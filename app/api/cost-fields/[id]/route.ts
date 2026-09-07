import { createAdminClient } from '@/lib/supabase/server-admin'
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import {
  allEntriesConfirmed,
  applyBulkMarkAllPaid,
  canEditCostFields,
  CONFIRMED_FIELD_STATE,
  ensureMinimumEntry,
  entriesSum,
  ENTRY_EXEMPT_FIELD_KEYS,
  formatBulkPaidAuditCopy,
  formatPaidRestoreAuditCopy,
  formatSectionConfirmedAuditCopy,
  hasBulkPaidSnapshot,
  isNonConfirmedFieldState,
  isUnconfirmedEntriesSeed,
  normalizeEntries,
  paidLockViolation,
  parseSectionPayment,
  pickPriorStateFromAuditRows,
  preservePaidSnapshots,
  productionCanEditFieldKey,
  restorePaidSnapshot,
  rolledUpCostFieldState,
  SECTION_PAYMENT_PAID,
  SECTION_PAYMENT_RESTORE,
  shouldSkipConfirmRollup,
  stampPaidAt,
  type CostEntry,
  type SectionPaymentAuditCopy,
} from '@/lib/cost-fields'
import {
  COST_FIELD_SCALAR_AUDIT_FIELDS,
  auditEntryDiffs,
  auditFieldDiffs,
  setAuditActor,
  writeAuditLog,
} from '@/lib/audit-log'
import { staffDisplayName } from '@/lib/cost-entry-source'

type LineItem = {
  role: string
  rate: number
  hours: number
  headcount: number
  source?: string
}

function lineItemsSum(items: LineItem[] | null | undefined): number {
  if (!items?.length) return 0
  return items.reduce(
    (sum, item) => sum + (Number(item.rate) || 0) * (Number(item.hours) || 0) * (Number(item.headcount) || 0),
    0,
  )
}

async function lastNonConfirmedStateBeforeConfirm(
  supabase: ReturnType<typeof createAdminClient>,
  costFieldId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('audit_log')
    .select('field_name, old_value, new_value, changed_at')
    .eq('table_name', 'cost_fields')
    .eq('record_id', costFieldId)
    .eq('new_value', CONFIRMED_FIELD_STATE)
    .order('changed_at', { ascending: false })
    .limit(20)

  if (error || !data?.length) return null
  return pickPriorStateFromAuditRows(data)
}

/**
 * PATCH /api/cost-fields/[id]
 * Authenticated write path for Run Costing — bypasses RLS via service role
 * after role checks. Allows admin/owner full edit; production only on fields
 * they can see in the UI.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const userClient = await createClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const supabase = createAdminClient()
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single()

  if (!profile || !canEditCostFields(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: existing, error: fetchErr } = await supabase
    .from('cost_fields')
    .select('*')
    .eq('id', id)
    .single()

  if (fetchErr || !existing) {
    return NextResponse.json({ error: 'Cost field not found' }, { status: 404 })
  }

  if (profile.role === 'production' && !productionCanEditFieldKey(existing.field_key)) {
    return NextResponse.json(
      { error: 'Production role cannot edit this cost field' },
      { status: 403 },
    )
  }

  const body = await req.json()
  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    updated_by: user.id,
  }

  if (body.state !== undefined) {
    const allowed = ['known', 'estimated', 'guess', 'pending', 'auto_calc']
    if (!allowed.includes(body.state)) {
      return NextResponse.json({ error: 'Invalid state' }, { status: 400 })
    }
    updates.state = body.state
  }

  if (body.source !== undefined) {
    updates.source = body.source === '' ? null : body.source
  }

  if (body.line_items !== undefined) {
    if (!Array.isArray(body.line_items)) {
      return NextResponse.json({ error: 'line_items must be an array' }, { status: 400 })
    }
    updates.line_items = body.line_items
  }

  const sectionPayment = body.section_payment === undefined
    ? null
    : parseSectionPayment(body.section_payment)
  if (body.section_payment !== undefined && sectionPayment == null) {
    return NextResponse.json(
      { error: "Invalid section_payment — use 'paid' or 'restore'" },
      { status: 400 },
    )
  }

  const entriesProvided = body.entries !== undefined
  if (entriesProvided && sectionPayment != null) {
    return NextResponse.json(
      { error: 'Do not send entries together with section_payment' },
      { status: 400 },
    )
  }

  let bulkPaidApplied = false
  let snapshotRestored = false
  let restoreBefore: CostEntry[] | null = null
  let restoreAfter: CostEntry[] | null = null
  let bulkBefore: CostEntry[] | null = null

  if (sectionPayment === SECTION_PAYMENT_PAID) {
    if (ENTRY_EXEMPT_FIELD_KEYS.has(existing.field_key)) {
      return NextResponse.json(
        { error: 'This field does not support MARK ALL AS PAID' },
        { status: 400 },
      )
    }
    const existingEntries = normalizeEntries(existing.entries) ?? []
    if (existingEntries.length === 0) {
      return NextResponse.json(
        { error: 'No lines to mark paid' },
        { status: 400 },
      )
    }
    // Payment action only — never writes cost_fields.state (not even 'known').
    delete updates.state
    let entries = applyBulkMarkAllPaid(existingEntries)
    entries = stampPaidAt(entries, existingEntries)
    const lockError = paidLockViolation(existingEntries, entries)
    if (lockError) {
      return NextResponse.json({ error: lockError }, { status: 400 })
    }
    updates.entries = entries
    updates.value = entriesSum(entries)
    bulkPaidApplied = true
    bulkBefore = existingEntries
  } else if (
    sectionPayment === SECTION_PAYMENT_RESTORE
    || (sectionPayment == null && body.state !== undefined && !entriesProvided && hasBulkPaidSnapshot(normalizeEntries(existing.entries)))
  ) {
    // Leaving bulk-PAID: restore paid flags only. Figure-source state comes
    // from the user's dropdown selection (body.state) if they sent one —
    // snapshot restore must not invent or clobber cost_fields.state.
    const existingEntries = normalizeEntries(existing.entries) ?? []
    if (hasBulkPaidSnapshot(existingEntries)) {
      let entries = restorePaidSnapshot(existingEntries)
      entries = stampPaidAt(entries, existingEntries)
      const lockError = paidLockViolation(existingEntries, entries)
      if (lockError) {
        return NextResponse.json({ error: lockError }, { status: 400 })
      }
      updates.entries = entries
      updates.value = entriesSum(entries)
      snapshotRestored = true
      restoreBefore = existingEntries
      restoreAfter = entries
    }
    // No snapshot: treat restore as a no-op so Edit→Confirmed still applies
    // figure-source state (double-save / already undone).
  }

  if (entriesProvided) {
    let entries = normalizeEntries(body.entries) ?? []
    if (!ENTRY_EXEMPT_FIELD_KEYS.has(existing.field_key)) {
      if (entries.length === 0) {
        return NextResponse.json(
          { error: 'Cannot clear all entries — at least one entry is required' },
          { status: 400 },
        )
      }
      entries = ensureMinimumEntry(entries, existing.label, existing.value)
    }

    const existingEntries = normalizeEntries(existing.entries) ?? []
    entries = preservePaidSnapshots(entries, existingEntries)
    entries = stampPaidAt(entries, existingEntries)
    const lockError = paidLockViolation(existingEntries, entries)
    if (lockError) {
      return NextResponse.json({ error: lockError }, { status: 400 })
    }

    updates.entries = entries
    // Entries drive line total for non–venue_staff fields.
    // venue_staff: planned roles (line_items) remain primary when saving roles;
    // when entries are explicitly patched, sync value to sum(entries).
    updates.value = entriesSum(entries)
  }

  const rolledEntries = (updates.entries as ReturnType<typeof normalizeEntries>) ?? null
  const skipRollup = shouldSkipConfirmRollup({ bulkPaidApplied, snapshotRestored })

  // W1.1: line-item confirm ticks roll up to cost_fields.state (`known` = CONFIRMED).
  // W1.2 PAID does not write cost_fields.state (payment ≠ figure accuracy).
  // W1.2b bulk pay / snapshot restore skip rollup so confirming lines for lock
  // rules (or restoring paid flags) cannot clobber the figure-source state.
  if (
    rolledEntries
    && !skipRollup
    && !ENTRY_EXEMPT_FIELD_KEYS.has(existing.field_key)
    && !isUnconfirmedEntriesSeed(existing.entries as Parameters<typeof isUnconfirmedEntriesSeed>[0], rolledEntries)
  ) {
    const currentState = String(updates.state ?? existing.state ?? '')
    let prior: string | null = isNonConfirmedFieldState(currentState) ? currentState : null
    if (currentState === CONFIRMED_FIELD_STATE && !allEntriesConfirmed(rolledEntries)) {
      prior = (await lastNonConfirmedStateBeforeConfirm(supabase, id)) ?? prior
    }
    const nextState = rolledUpCostFieldState({
      entries: rolledEntries,
      currentState,
      priorNonConfirmedState: prior,
      fieldKey: existing.field_key,
    })
    if (nextState !== currentState) updates.state = nextState
  }

  // Explicit value only accepted when entries are not being patched —
  // and only for venue_staff (line_items-derived) or exempt auto fields.
  if (body.value !== undefined && !entriesProvided) {
    if (existing.field_key === 'venue_staff' || ENTRY_EXEMPT_FIELD_KEYS.has(existing.field_key)) {
      updates.value = body.value === null || body.value === '' ? null : Number(body.value)
    }
  }

  // Saving planned roles: value = sum(line_items); do not fight entries totals
  // unless entries were also in this request.
  if (body.line_items !== undefined && !entriesProvided && existing.field_key === 'venue_staff') {
    const total = lineItemsSum(body.line_items as LineItem[])
    updates.value = total === 0 ? null : total
  }

  if (Object.keys(updates).length <= 1) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  updates.updated_by = user.id
  await setAuditActor(supabase, user.id)

  const { data, error } = await supabase
    .from('cost_fields')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const runId = (existing.run_id as string | null) ?? (data?.run_id as string | null) ?? null
  const showId = (existing.show_id as string | null) ?? null
  const actorName = staffDisplayName(profile.full_name) ?? 'Someone'
  const [runRow, showRow] = await Promise.all([
    runId
      ? supabase.from('runs').select('code').eq('id', runId).maybeSingle()
      : Promise.resolve({ data: null }),
    showId
      ? supabase.from('shows').select('venue_name').eq('id', showId).maybeSingle()
      : Promise.resolve({ data: null }),
  ])
  const runCode = runRow.data && 'code' in runRow.data ? String(runRow.data.code ?? '') : ''
  const showLabel = showRow.data && 'venue_name' in showRow.data ? String(showRow.data.venue_name ?? '') : ''
  const sectionLabel = String(existing.label ?? existing.field_key ?? 'this section')

  let narrative: SectionPaymentAuditCopy | null = null
  if (bulkPaidApplied && bulkBefore) {
    narrative = formatBulkPaidAuditCopy({
      actorName,
      sectionLabel,
      showLabel,
      runCode,
      entries: bulkBefore,
    })
  } else if (snapshotRestored && restoreBefore && restoreAfter) {
    narrative = formatPaidRestoreAuditCopy({
      actorName,
      sectionLabel,
      showLabel,
      runCode,
      before: restoreBefore,
      after: restoreAfter,
    })
  }

  const rolledToConfirmed = Boolean(
    rolledEntries
    && !skipRollup
    && String(updates.state ?? '') === CONFIRMED_FIELD_STATE
    && String(existing.state ?? '') !== CONFIRMED_FIELD_STATE
    && allEntriesConfirmed(rolledEntries),
  )
  if (!narrative && rolledToConfirmed && rolledEntries) {
    narrative = formatSectionConfirmedAuditCopy({
      actorName,
      sectionLabel,
      lineCount: rolledEntries.length,
    })
  }

  // Prefer the plain-language row over a cryptic entries JSON dump for bulk pay / restore.
  const auditRows = auditFieldDiffs(
    'cost_fields',
    id,
    runId,
    existing as Record<string, unknown>,
    (data ?? {}) as Record<string, unknown>,
    COST_FIELD_SCALAR_AUDIT_FIELDS,
  )
  if (!bulkPaidApplied && !snapshotRestored) {
    auditRows.push(...auditEntryDiffs(
      'cost_fields',
      id,
      runId,
      normalizeEntries(existing.entries),
      normalizeEntries((data as { entries?: unknown } | null)?.entries ?? updates.entries),
    ))
  }
  if (narrative) {
    auditRows.unshift({
      table_name: 'cost_fields',
      record_id: id,
      run_id: runId,
      field_name: narrative.fieldName,
      old_value: narrative.oldValue,
      new_value: narrative.newValue,
      change_type: 'update',
    })
  }

  await writeAuditLog(supabase, user.id, auditRows)

  return NextResponse.json(data)
}

/**
 * Shared cost-line mutation used by Run Costing and Run Advancing.
 * The table name is the only storage difference — Advancing never writes cost_fields.
 */

import { NextResponse } from 'next/server'
import {
  allEntriesConfirmed,
  applyBulkMarkAllPaid,
  applyInvoiceAmountsIfMissing,
  CONFIRMED_FIELD_STATE,
  ensureMinimumEntry,
  ensurePaidLinesConfirmed,
  entriesSum,
  ENTRY_EXEMPT_FIELD_KEYS,
  formatAllPaidAlsoConfirmedSentence,
  formatBulkPaidAuditCopy,
  formatPaidRestoreAuditCopy,
  formatSectionConfirmedAuditCopy,
  AUDIT_FIELD_PAID_ALSO_CONFIRMED,
  hasBulkPaidSnapshot,
  INVOICED_FIELD_STATE,
  invoiceAmountsChanged,
  isCostFieldState,
  isNonConfirmedFieldState,
  isUnconfirmedEntriesSeed,
  lineItemsSum,
  normalizeEntries,
  normalizeLineItems,
  paidLineItemLockViolation,
  paidLockViolation,
  parseSectionPayment,
  paymentDidNotChangeAttestationTicks,
  pickPriorStateFromAuditRows,
  preservePaidSnapshots,
  restorePaidSnapshot,
  rolledUpCostFieldState,
  SECTION_PAYMENT_PAID,
  SECTION_PAYMENT_RESTORE,
  shouldSkipConfirmRollup,
  stampPaidAt,
  type CostEntry,
  type PayableAuditUnit,
  type SectionPaymentAuditCopy,
  type StaffLineItem,
} from './cost-fields.ts'
import {
  COST_FIELD_SCALAR_AUDIT_FIELDS,
  auditEntryDiffs,
  auditFieldDiffs,
  auditLineItemDiffs,
  setAuditActor,
  writeAuditLog,
} from './audit-log.ts'
import { autoTickChecklistAfterCostFieldSave } from './advancing-checklist-paid-ticks-persist.ts'
import type { createAdminClient } from '@/lib/supabase/server-admin'

type AdminClient = ReturnType<typeof createAdminClient>

export type CostFieldWriteTable = 'cost_fields' | 'advancing_cost_fields'

async function lastNonConfirmedStateBeforeConfirm(
  admin: AdminClient,
  table: CostFieldWriteTable,
  costFieldId: string,
): Promise<string | null> {
  const { data, error } = await admin
    .from('audit_log')
    .select('field_name, old_value, new_value, changed_at')
    .eq('table_name', table)
    .eq('record_id', costFieldId)
    .eq('new_value', CONFIRMED_FIELD_STATE)
    .order('changed_at', { ascending: false })
    .limit(20)

  if (error || !data?.length) return null
  return pickPriorStateFromAuditRows(data)
}

export async function executeCostFieldPatch(opts: {
  admin: AdminClient
  table: CostFieldWriteTable
  id: string
  existing: Record<string, unknown>
  body: Record<string, unknown>
  userId: string
  actorName: string
}): Promise<NextResponse> {
  const { admin, table, id, existing, body, userId, actorName } = opts

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    updated_by: userId,
  }

  if (body.state !== undefined) {
    if (!isCostFieldState(String(body.state))) {
      return NextResponse.json({ error: 'Invalid state' }, { status: 400 })
    }
    updates.state = body.state
  }

  if (body.source !== undefined) {
    updates.source = body.source === '' ? null : body.source
  }

  const lineItemsProvided = body.line_items !== undefined
  if (lineItemsProvided && !Array.isArray(body.line_items)) {
    return NextResponse.json({ error: 'line_items must be an array' }, { status: 400 })
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

  const existingLineItems = normalizeLineItems(existing.line_items) ?? []
  const incomingLineItems = lineItemsProvided
    ? (normalizeLineItems(body.line_items) ?? [])
    : existingLineItems
  const venueStaffUsesRoles = existing.field_key === 'venue_staff' && incomingLineItems.length > 0

  let bulkPaidApplied = false
  let snapshotRestored = false
  let restoreBefore: Array<CostEntry | StaffLineItem> | null = null
  let restoreAfter: Array<CostEntry | StaffLineItem> | null = null
  let bulkBefore: Array<CostEntry | StaffLineItem> | null = null
  let paidImpliedConfirms: Array<CostEntry | StaffLineItem> = []
  let paymentAuditUnit: PayableAuditUnit = 'line'

  if (sectionPayment === SECTION_PAYMENT_PAID) {
    if (ENTRY_EXEMPT_FIELD_KEYS.has(String(existing.field_key))) {
      return NextResponse.json(
        { error: 'This field does not support MARK ALL AS PAID' },
        { status: 400 },
      )
    }
    delete updates.state
    if (venueStaffUsesRoles) {
      const prev = existingLineItems
      let items = preservePaidSnapshots(incomingLineItems, prev)
      if (items.length === 0) {
        return NextResponse.json({ error: 'No roles to mark paid' }, { status: 400 })
      }
      items = applyBulkMarkAllPaid(items)
      items = stampPaidAt(items, prev)
      const repaired = ensurePaidLinesConfirmed(items)
      items = repaired.entries
      paidImpliedConfirms = repaired.newlyConfirmed
      const lockError = paidLineItemLockViolation(prev, items)
      if (lockError) {
        return NextResponse.json({ error: lockError }, { status: 400 })
      }
      updates.line_items = items
      const total = lineItemsSum(items)
      updates.value = total === 0 ? null : total
      bulkPaidApplied = true
      bulkBefore = incomingLineItems
      paymentAuditUnit = 'role'
    } else {
      const existingEntries = normalizeEntries(existing.entries) ?? []
      if (existingEntries.length === 0) {
        return NextResponse.json(
          { error: 'No lines to mark paid' },
          { status: 400 },
        )
      }
      let entries = applyBulkMarkAllPaid(existingEntries)
      entries = stampPaidAt(entries, existingEntries)
      const repaired = ensurePaidLinesConfirmed(entries)
      entries = repaired.entries
      paidImpliedConfirms = repaired.newlyConfirmed
      const lockError = paidLockViolation(existingEntries, entries)
      if (lockError) {
        return NextResponse.json({ error: lockError }, { status: 400 })
      }
      updates.entries = entries
      updates.value = entriesSum(entries)
      bulkPaidApplied = true
      bulkBefore = existingEntries
    }
  } else if (
    sectionPayment === SECTION_PAYMENT_RESTORE
    || (sectionPayment == null && body.state !== undefined && !entriesProvided && (
      hasBulkPaidSnapshot(normalizeEntries(existing.entries))
      || (existing.field_key === 'venue_staff' && hasBulkPaidSnapshot(existingLineItems))
    ))
  ) {
    if (existing.field_key === 'venue_staff' && hasBulkPaidSnapshot(existingLineItems)) {
      let items = preservePaidSnapshots(incomingLineItems, existingLineItems)
      items = restorePaidSnapshot(items)
      items = stampPaidAt(items, existingLineItems)
      const lockError = paidLineItemLockViolation(existingLineItems, items)
      if (lockError) {
        return NextResponse.json({ error: lockError }, { status: 400 })
      }
      updates.line_items = items
      const total = lineItemsSum(items)
      updates.value = total === 0 ? null : total
      snapshotRestored = true
      restoreBefore = existingLineItems
      restoreAfter = items
      paymentAuditUnit = 'role'
    }
    const existingEntries = normalizeEntries(existing.entries) ?? []
    if (hasBulkPaidSnapshot(existingEntries)) {
      let entries = restorePaidSnapshot(existingEntries)
      entries = stampPaidAt(entries, existingEntries)
      const lockError = paidLockViolation(existingEntries, entries)
      if (lockError) {
        return NextResponse.json({ error: lockError }, { status: 400 })
      }
      updates.entries = entries
      if (existing.field_key !== 'venue_staff') {
        updates.value = entriesSum(entries)
      }
      snapshotRestored = true
      if (!restoreBefore) {
        restoreBefore = existingEntries
        restoreAfter = entries
        paymentAuditUnit = 'line'
      }
    }
  }

  if (entriesProvided) {
    let entries = normalizeEntries(body.entries) ?? []
    if (!ENTRY_EXEMPT_FIELD_KEYS.has(String(existing.field_key))) {
      if (entries.length === 0) {
        return NextResponse.json(
          { error: 'Cannot clear all entries — at least one entry is required' },
          { status: 400 },
        )
      }
      entries = ensureMinimumEntry(entries, String(existing.label ?? ''), existing.value as number | null)
    }

    const existingEntries = normalizeEntries(existing.entries) ?? []
    entries = preservePaidSnapshots(entries, existingEntries)
    entries = stampPaidAt(entries, existingEntries)
    const repaired = ensurePaidLinesConfirmed(entries)
    entries = repaired.entries
    paidImpliedConfirms = repaired.newlyConfirmed
    const lockError = paidLockViolation(existingEntries, entries)
    if (lockError) {
      return NextResponse.json({ error: lockError }, { status: 400 })
    }

    updates.entries = entries
    updates.value = entriesSum(entries)
  }

  if (
    lineItemsProvided
    && !bulkPaidApplied
    && !snapshotRestored
    && existing.field_key === 'venue_staff'
  ) {
    let items = preservePaidSnapshots(incomingLineItems, existingLineItems)
    items = stampPaidAt(items, existingLineItems)
    const repaired = ensurePaidLinesConfirmed(items)
    items = repaired.entries
    if (repaired.newlyConfirmed.length > 0) {
      paidImpliedConfirms = repaired.newlyConfirmed
      paymentAuditUnit = 'role'
    }
    const lockError = paidLineItemLockViolation(existingLineItems, items)
    if (lockError) {
      return NextResponse.json({ error: lockError }, { status: 400 })
    }
    updates.line_items = items
    if (!entriesProvided) {
      const total = lineItemsSum(items)
      updates.value = total === 0 ? null : total
    }
  }

  const invoicedState = String(updates.state ?? existing.state ?? '') === INVOICED_FIELD_STATE
  if (invoicedState && !ENTRY_EXEMPT_FIELD_KEYS.has(String(existing.field_key))) {
    const baseEntries = (updates.entries as CostEntry[] | undefined)
      ?? normalizeEntries(existing.entries)
      ?? []
    const stampedEntries = applyInvoiceAmountsIfMissing(baseEntries, e => Number(e.amount) || 0)
    if (invoiceAmountsChanged(baseEntries, stampedEntries)) {
      updates.entries = stampedEntries
    }
    if (existing.field_key === 'venue_staff') {
      const baseItems = (updates.line_items as StaffLineItem[] | undefined) ?? existingLineItems
      const stampedItems = applyInvoiceAmountsIfMissing(
        baseItems,
        item => (Number(item.rate) || 0) * (Number(item.hours) || 0) * (Number(item.headcount) || 0),
      )
      if (invoiceAmountsChanged(baseItems, stampedItems)) {
        updates.line_items = stampedItems
      }
    }
  }

  const rolledEntries = (updates.entries as ReturnType<typeof normalizeEntries>) ?? null
  const rolledRoles = (updates.line_items as StaffLineItem[] | undefined) ?? null
  const existingEntriesForRollup = normalizeEntries(existing.entries) ?? []
  const skipRollup = shouldSkipConfirmRollup({
    bulkPaidApplied,
    snapshotRestored,
    paymentImpliedConfirmsOnly: Boolean(
      (rolledRoles && paymentDidNotChangeAttestationTicks(existingLineItems, rolledRoles))
      || (rolledEntries && paymentDidNotChangeAttestationTicks(existingEntriesForRollup, rolledEntries)),
    ),
  })

  const rollupLines = rolledRoles && rolledRoles.length > 0 && existing.field_key === 'venue_staff'
    ? rolledRoles
    : rolledEntries
  if (
    rollupLines
    && !skipRollup
    && !ENTRY_EXEMPT_FIELD_KEYS.has(String(existing.field_key))
    && !(
      rollupLines === rolledEntries
      && isUnconfirmedEntriesSeed(existing.entries as Parameters<typeof isUnconfirmedEntriesSeed>[0], rolledEntries)
    )
  ) {
    const currentState = String(updates.state ?? existing.state ?? '')
    let prior: string | null = isNonConfirmedFieldState(currentState) ? currentState : null
    if (currentState === CONFIRMED_FIELD_STATE && !allEntriesConfirmed(rollupLines)) {
      prior = (await lastNonConfirmedStateBeforeConfirm(admin, table, id)) ?? prior
    }
    const nextState = rolledUpCostFieldState({
      entries: rollupLines,
      currentState,
      priorNonConfirmedState: prior,
      fieldKey: String(existing.field_key),
    })
    if (nextState !== currentState) updates.state = nextState
  }

  if (body.value !== undefined && !entriesProvided && updates.line_items === undefined) {
    if (existing.field_key === 'venue_staff' || ENTRY_EXEMPT_FIELD_KEYS.has(String(existing.field_key))) {
      updates.value = body.value === null || body.value === '' ? null : Number(body.value)
    }
  }

  if (Object.keys(updates).length <= 1) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  updates.updated_by = userId
  await setAuditActor(admin, userId)

  const { data, error } = await admin
    .from(table)
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const runId = (existing.run_id as string | null) ?? (data?.run_id as string | null) ?? null
  const showId = (existing.show_id as string | null) ?? null
  const [runRow, showRow] = await Promise.all([
    runId
      ? admin.from('runs').select('code').eq('id', runId).maybeSingle()
      : Promise.resolve({ data: null }),
    showId
      ? admin.from('shows').select('venue_name').eq('id', showId).maybeSingle()
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
      unit: paymentAuditUnit,
    })
  } else if (!snapshotRestored && paidImpliedConfirms.length > 0) {
    const sentence = formatAllPaidAlsoConfirmedSentence({
      actorName,
      sectionLabel,
      confirmedCount: paidImpliedConfirms.length,
      actionLabel: 'Pay',
      unit: paymentAuditUnit,
    })
    if (sentence) {
      narrative = {
        fieldName: AUDIT_FIELD_PAID_ALSO_CONFIRMED,
        oldValue: `${paidImpliedConfirms.length} ${paidImpliedConfirms.length === 1 ? `${paymentAuditUnit} was` : `${paymentAuditUnit}s were`} not confirm-ticked`,
        newValue: sentence,
      }
    }
  } else if (snapshotRestored && restoreBefore && restoreAfter) {
    narrative = formatPaidRestoreAuditCopy({
      actorName,
      sectionLabel,
      showLabel,
      runCode,
      before: restoreBefore,
      after: restoreAfter,
      unit: paymentAuditUnit,
    })
  }

  const rolledToConfirmed = Boolean(
    rollupLines
    && !skipRollup
    && String(updates.state ?? '') === CONFIRMED_FIELD_STATE
    && String(existing.state ?? '') !== CONFIRMED_FIELD_STATE
    && allEntriesConfirmed(rollupLines),
  )
  if (!narrative && rolledToConfirmed && rollupLines) {
    narrative = formatSectionConfirmedAuditCopy({
      actorName,
      sectionLabel,
      lineCount: rollupLines.length,
      unit: rolledRoles && rollupLines === rolledRoles ? 'role' : 'line',
    })
  }

  const auditRows = auditFieldDiffs(
    table,
    id,
    runId,
    existing,
    (data ?? {}) as Record<string, unknown>,
    COST_FIELD_SCALAR_AUDIT_FIELDS,
  )
  if (!bulkPaidApplied && !snapshotRestored) {
    auditRows.push(...auditEntryDiffs(
      table,
      id,
      runId,
      normalizeEntries(existing.entries),
      normalizeEntries((data as { entries?: unknown } | null)?.entries ?? updates.entries),
    ))
    auditRows.push(...auditLineItemDiffs(
      table,
      id,
      runId,
      existingLineItems,
      normalizeLineItems((data as { line_items?: unknown } | null)?.line_items ?? updates.line_items),
    ))
  }
  if (narrative) {
    auditRows.unshift({
      table_name: table,
      record_id: id,
      run_id: runId,
      field_name: narrative.fieldName,
      old_value: narrative.oldValue,
      new_value: narrative.newValue,
      change_type: 'update',
    })
  }

  await writeAuditLog(admin, userId, auditRows)

  await autoTickChecklistAfterCostFieldSave({
    admin,
    table,
    runId,
    field: {
      field_key: String(existing.field_key ?? (data as { field_key?: string } | null)?.field_key ?? ''),
      entries: (data as { entries?: unknown } | null)?.entries ?? updates.entries ?? existing.entries,
      line_items: (data as { line_items?: unknown } | null)?.line_items ?? updates.line_items ?? existing.line_items,
    },
    actorUserId: userId,
    actorName,
    writeAudit: true,
  })

  return NextResponse.json(data)
}

import { createAdminClient } from '@/lib/supabase/server-admin'
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import {
  canEditCostFields,
  ensureMinimumEntry,
  entriesSum,
  ENTRY_EXEMPT_FIELD_KEYS,
  normalizeEntries,
  productionCanEditFieldKey,
} from '@/lib/cost-fields'
import {
  COST_FIELD_AUDIT_FIELDS,
  auditFieldDiffs,
  setAuditActor,
  writeAuditLog,
} from '@/lib/audit-log'

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
    .select('role')
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

  const entriesProvided = body.entries !== undefined
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
    updates.entries = entries
    // Entries drive line total for non–venue_staff fields.
    // venue_staff: planned roles (line_items) remain primary when saving roles;
    // when entries are explicitly patched, sync value to sum(entries).
    updates.value = entriesSum(entries)
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
  await writeAuditLog(
    supabase,
    user.id,
    auditFieldDiffs(
      'cost_fields',
      id,
      runId,
      existing as Record<string, unknown>,
      (data ?? {}) as Record<string, unknown>,
      COST_FIELD_AUDIT_FIELDS,
    ),
  )

  return NextResponse.json(data)
}

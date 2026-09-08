import { createAdminClient } from '@/lib/supabase/server-admin'
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import {
  canEditCostFields,
  ensureMinimumEntry,
  entriesSum,
  ENTRY_EXEMPT_FIELD_KEYS,
  lineItemsSum,
  normalizeEntries,
  normalizeLineItems,
  paidLineItemLockViolation,
  paidLockViolation,
  productionCanEditFieldKey,
  stampPaidAt,
} from '@/lib/cost-fields'
import { ADVANCING_ARCHIVED_ERROR, isAdvancingWorkspaceActive } from '@/lib/run-advancing'
import { loadActiveAdvancingWorkspace } from '@/lib/run-advancing-persist'

/**
 * POST /api/advancing-cost-fields — create a line on the Run Advancing twin sheet.
 * Writes advancing_cost_fields only. Never cost_fields.
 */
export async function POST(req: NextRequest) {
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

  const body = await req.json()
  const fieldKey = String(body.field_key ?? '')
  const runId = String(body.run_id ?? '')
  const workspaceId = String(body.workspace_id ?? '')
  if (!fieldKey || !runId || !workspaceId || !body.label || !body.category) {
    return NextResponse.json(
      { error: 'run_id, workspace_id, field_key, label, and category are required' },
      { status: 400 },
    )
  }

  if (profile.role === 'production' && !productionCanEditFieldKey(fieldKey)) {
    return NextResponse.json(
      { error: 'Production role cannot create this cost field' },
      { status: 403 },
    )
  }

  const workspace = await loadActiveAdvancingWorkspace(supabase, runId)
  if (!workspace || workspace.id !== workspaceId || !isAdvancingWorkspaceActive(workspace)) {
    return NextResponse.json({ error: ADVANCING_ARCHIVED_ERROR }, { status: 409 })
  }

  const state = body.state ?? 'guess'
  const allowed = ['known', 'estimated', 'guess', 'pending', 'auto_calc']
  if (!allowed.includes(state)) {
    return NextResponse.json({ error: 'Invalid state' }, { status: 400 })
  }

  let entries = normalizeEntries(body.entries) ?? []
  const initialValue = body.value != null && body.value !== '' ? Number(body.value) : null

  if (!ENTRY_EXEMPT_FIELD_KEYS.has(fieldKey)) {
    entries = ensureMinimumEntry(entries, String(body.label), initialValue)
  }
  entries = stampPaidAt(entries, [])
  const lockError = paidLockViolation([], entries)
  if (lockError) {
    return NextResponse.json({ error: lockError }, { status: 400 })
  }

  let lineItems = fieldKey === 'venue_staff'
    ? (normalizeLineItems(body.line_items) ?? [])
    : (body.line_items ?? null)
  if (Array.isArray(lineItems) && fieldKey === 'venue_staff') {
    lineItems = stampPaidAt(lineItems, [])
    const roleLock = paidLineItemLockViolation([], lineItems)
    if (roleLock) {
      return NextResponse.json({ error: roleLock }, { status: 400 })
    }
  }

  const roleTotal = fieldKey === 'venue_staff' && Array.isArray(lineItems) && lineItems.length > 0
    ? lineItemsSum(lineItems)
    : null
  const value = ENTRY_EXEMPT_FIELD_KEYS.has(fieldKey)
    ? initialValue
    : roleTotal != null
      ? (roleTotal === 0 ? null : roleTotal)
      : entriesSum(entries)

  const row = {
    workspace_id: workspaceId,
    run_id: runId,
    source_cost_field_id: null,
    show_id: body.show_id ?? null,
    category: body.category,
    field_key: fieldKey,
    label: body.label,
    value,
    state,
    source: body.source ?? null,
    line_items: lineItems,
    entries,
    updated_by: user.id,
  }

  const { data, error } = await supabase
    .from('advancing_cost_fields')
    .insert(row)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

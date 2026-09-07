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
import { rejectIfBookedCostFrozen } from '@/lib/booked-cost-freeze-persist'

/**
 * POST /api/cost-fields — create a cost field row (authenticated).
 * Always seeds ≥1 entry (except exempt keys). value = sum(entries).
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
  if (!fieldKey || !body.run_id || !body.label || !body.category) {
    return NextResponse.json(
      { error: 'run_id, field_key, label, and category are required' },
      { status: 400 },
    )
  }

  if (profile.role === 'production' && !productionCanEditFieldKey(fieldKey)) {
    return NextResponse.json(
      { error: 'Production role cannot create this cost field' },
      { status: 403 },
    )
  }

  const frozen = await rejectIfBookedCostFrozen(supabase, String(body.run_id))
  if (frozen) return frozen

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
    run_id: body.run_id,
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
    .from('cost_fields')
    .insert(row)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

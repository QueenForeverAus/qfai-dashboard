import { createAdminClient } from '@/lib/supabase/server-admin'
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { ASSIGNABLE_OWNERS, normalizeAssignedTo } from '@/lib/advancement-checklist'
import { diffAuditFields, insertAuditRows } from '@/lib/audit-log'

const ALLOWED_STATUSES = ['pending', 'done', 'n_a']

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ runId: string; itemId: string }> }
) {
  const { itemId } = await params

  const userClient = await createClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const body = await req.json()
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: user.id }

  if (body.status !== undefined) {
    if (!ALLOWED_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }
    updates.status = body.status
  }
  if (body.notes !== undefined) updates.notes = body.notes
  if (body.paid !== undefined) updates.paid = body.paid
  if (body.payment_type !== undefined) updates.payment_type = body.payment_type

  if (body.label !== undefined) {
    const label = typeof body.label === 'string' ? body.label.trim() : ''
    if (!label) return NextResponse.json({ error: 'Label cannot be empty' }, { status: 400 })
    if (label.length > 500) return NextResponse.json({ error: 'Label too long' }, { status: 400 })
    updates.label = label
  }

  if (body.assigned_to !== undefined) {
    const next = normalizeAssignedTo(String(body.assigned_to))
    if (!ASSIGNABLE_OWNERS.includes(next)) {
      return NextResponse.json({ error: 'Invalid assigned_to' }, { status: 400 })
    }
    updates.assigned_to = next
  }

  const supabase = createAdminClient()
  const { data: existingItem, error: existingErr } = await supabase
    .from('advancement_items')
    .select('*')
    .eq('id', itemId)
    .single()
  if (existingErr || !existingItem) {
    return NextResponse.json({ error: 'Item not found' }, { status: 404 })
  }

  const { data, error } = await supabase
    .from('advancement_items')
    .update(updates)
    .eq('id', itemId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await insertAuditRows(
    supabase,
    user.id,
    diffAuditFields(
      'advancement_items',
      itemId,
      (data?.run_id as string | null) ?? (existingItem.run_id as string | null) ?? null,
      existingItem as Record<string, unknown>,
      data as Record<string, unknown>,
      ['status', 'notes', 'paid', 'payment_type', 'label', 'assigned_to'],
    ),
  )

  return NextResponse.json({
    ...data,
    assigned_to: normalizeAssignedTo(data.assigned_to as string),
  })
}

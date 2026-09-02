import { createAdminClient } from '@/lib/supabase/server-admin'
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

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

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('advancement_items')
    .update(updates)
    .eq('id', itemId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

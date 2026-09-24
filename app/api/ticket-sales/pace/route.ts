/**
 * Owner/admin pace on a matched Ticket Sales board row.
 * Empty string clears the judgement. No automatic pace.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getAdminOwnerActor } from '@/lib/admin-access'
import { writeAuditLog } from '@/lib/audit-log'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/server-admin'
import { parseTicketSalesPace } from '@/lib/ticket-sales-board'

export async function PATCH(req: NextRequest) {
  const userClient = await createClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const actor = await getAdminOwnerActor()
  if (!actor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => null) as { show_id?: unknown; pace?: unknown } | null
  const showId = typeof body?.show_id === 'string' ? body.show_id : ''
  if (!showId) return NextResponse.json({ error: 'show_id is required' }, { status: 400 })
  if (body && 'pace' in body && body.pace != null && body.pace !== '' && parseTicketSalesPace(body.pace) == null) {
    return NextResponse.json({ error: 'Pace must be Clear, Watch, Impediment, or empty' }, { status: 400 })
  }
  const pace = parseTicketSalesPace(body?.pace)

  const admin = createAdminClient()
  const { data: show, error: showError } = await admin
    .from('shows')
    .select('id, run_id')
    .eq('id', showId)
    .maybeSingle()
  if (showError) return NextResponse.json({ error: showError.message }, { status: 500 })
  if (!show) return NextResponse.json({ error: 'Show not found' }, { status: 404 })

  const { data: existing } = await admin
    .from('ticket_sales_pace')
    .select('pace')
    .eq('show_id', showId)
    .maybeSingle()

  const { error } = await admin
    .from('ticket_sales_pace')
    .upsert({
      show_id: showId,
      pace,
      updated_at: new Date().toISOString(),
      updated_by: actor.userId,
    }, { onConflict: 'show_id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await writeAuditLog(admin, actor.userId, [{
    table_name: 'ticket_sales_pace',
    record_id: showId,
    run_id: show.run_id ?? null,
    field_name: 'pace',
    old_value: existing?.pace ?? null,
    new_value: pace,
    change_type: 'update',
  }])

  return NextResponse.json({ show_id: showId, pace })
}

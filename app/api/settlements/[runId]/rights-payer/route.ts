import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server-admin'
import { writeAuditLog } from '@/lib/audit-log'
import { getSettlementsActor, resolveSettlementsRun } from '@/lib/settlements-access'
import { formatRightsPayerAuditCopy, isRightsPayer } from '@/lib/remittance'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  const actor = await getSettlementsActor()
  if (!actor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { runId } = await params
  const admin = createAdminClient()
  const run = await resolveSettlementsRun(admin, runId)
  if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 })

  const body = await req.json() as { show_id?: string; rights_payer?: string }
  if (!body.show_id) return NextResponse.json({ error: 'show_id is required' }, { status: 400 })
  if (!isRightsPayer(body.rights_payer)) {
    return NextResponse.json({ error: 'rights_payer must be tbd, venue, or qf' }, { status: 400 })
  }

  const { data: show } = await admin
    .from('shows')
    .select('id, venue_name, run_id, rights_payer')
    .eq('id', body.show_id)
    .maybeSingle()

  if (!show || show.run_id !== run.id) {
    return NextResponse.json({ error: 'Show does not belong to this run' }, { status: 400 })
  }

  const from = isRightsPayer(show.rights_payer) ? show.rights_payer : 'tbd'
  const { data, error } = await admin
    .from('shows')
    .update({ rights_payer: body.rights_payer })
    .eq('id', show.id)
    .select('id, rights_payer, venue_name')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (from !== body.rights_payer) {
    const copy = formatRightsPayerAuditCopy({
      actorName: actor.fullName,
      runCode: run.code,
      showLabel: show.venue_name,
      from,
      to: body.rights_payer,
    })
    await writeAuditLog(admin, actor.userId, [{
      table_name: 'shows',
      record_id: show.id,
      run_id: run.id,
      field_name: copy.fieldName,
      old_value: copy.oldValue,
      new_value: copy.newValue,
      change_type: 'update',
    }])
  }

  return NextResponse.json({ show: data })
}

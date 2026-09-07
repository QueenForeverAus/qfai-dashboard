import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server-admin'
import { writeAuditLog } from '@/lib/audit-log'
import { getSettlementsActor, resolveSettlementsRun } from '@/lib/settlements-access'
import { formatRemittanceAcceptedAuditCopy, formatRemittanceRectifyAuditCopy } from '@/lib/remittance'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  const actor = await getSettlementsActor()
  if (!actor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { runId } = await params
  const admin = createAdminClient()
  const run = await resolveSettlementsRun(admin, runId)
  if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 })

  const body = await req.json().catch(() => ({})) as { action?: string }
  const action = body.action === 'rectify' ? 'rectify' : 'accept'
  const now = new Date().toISOString()
  const status = action === 'rectify' ? 'rectify_awaiting' : 'accepted'

  const { data: existing } = await admin
    .from('run_settlements')
    .select('run_id')
    .eq('run_id', run.id)
    .maybeSingle()

  const row = {
    remittance_status: status,
    remittance_accepted_at: action === 'accept' ? now : null,
    remittance_accepted_by: action === 'accept' ? actor.userId : null,
    updated_at: now,
  }

  const write = existing
    ? admin.from('run_settlements').update(row).eq('run_id', run.id).select('*').single()
    : admin.from('run_settlements').insert({ run_id: run.id, ...row, created_at: now }).select('*').single()

  const { data, error } = await write
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const copy = action === 'rectify'
    ? formatRemittanceRectifyAuditCopy({ actorName: actor.fullName, runCode: run.code })
    : formatRemittanceAcceptedAuditCopy({ actorName: actor.fullName, runCode: run.code })

  await writeAuditLog(admin, actor.userId, [{
    table_name: 'run_settlements',
    record_id: run.id,
    run_id: run.id,
    field_name: copy.fieldName,
    old_value: copy.oldValue,
    new_value: copy.newValue,
    change_type: 'update',
  }])

  return NextResponse.json({
    settlement: data,
    action,
    overwritten_agent_settlement: false,
  })
}

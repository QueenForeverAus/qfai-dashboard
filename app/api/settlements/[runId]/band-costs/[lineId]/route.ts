import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server-admin'
import { writeAuditLog } from '@/lib/audit-log'
import { getSettlementsActor } from '@/lib/settlements-access'
import { formatBandCostStatusAuditCopy } from '@/lib/settlements'

async function resolveRun(admin: ReturnType<typeof createAdminClient>, runId: string) {
  const byId = await admin.from('runs').select('id, code').eq('id', runId).maybeSingle()
  if (byId.data) return byId.data
  return (await admin.from('runs').select('id, code').eq('code', runId.toUpperCase()).maybeSingle()).data
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ runId: string; lineId: string }> },
) {
  const actor = await getSettlementsActor()
  if (!actor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { runId, lineId } = await params
  const admin = createAdminClient()
  const run = await resolveRun(admin, runId)
  if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 })

  const { data: existing } = await admin
    .from('band_cost_lines')
    .select('*')
    .eq('id', lineId)
    .eq('run_id', run.id)
    .maybeSingle()

  if (!existing) return NextResponse.json({ error: 'Band cost not found' }, { status: 404 })

  const body = await req.json() as { paid?: boolean; waived?: boolean }
  const now = new Date().toISOString()

  let paid = existing.paid as boolean
  let waived = existing.waived as boolean
  if (body.waived === true) {
    waived = true
    paid = false
  } else if (body.paid === true) {
    paid = true
    waived = false
  } else if (body.paid === false || body.waived === false) {
    paid = false
    waived = false
  }

  const { data, error } = await admin
    .from('band_cost_lines')
    .update({
      paid,
      waived,
      paid_at: paid ? now : null,
      updated_at: now,
    })
    .eq('id', lineId)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const status = waived ? 'waived' : paid ? 'paid' : 'open'
  const copy = formatBandCostStatusAuditCopy({
    actorName: actor.fullName,
    runCode: run.code,
    description: existing.description,
    status,
  })
  await writeAuditLog(admin, actor.userId, [{
    table_name: 'band_cost_lines',
    record_id: lineId,
    run_id: run.id,
    field_name: copy.fieldName,
    old_value: copy.oldValue,
    new_value: copy.newValue,
    change_type: 'update',
  }])

  return NextResponse.json({ line: data })
}

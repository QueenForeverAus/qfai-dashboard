import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server-admin'
import { writeAuditLog } from '@/lib/audit-log'
import { getSettlementsActor } from '@/lib/settlements-access'
import {
  buildCostingSnapshot,
  formatFinaliseAuditCopy,
  isCostingFinalised,
  nudgeDueFromFinalise,
  nudgeDueFromLastShow,
} from '@/lib/settlements'

async function resolveRun(admin: ReturnType<typeof createAdminClient>, runId: string) {
  const byId = await admin.from('runs').select('id, code, name, start_date, end_date').eq('id', runId).maybeSingle()
  if (byId.data) return byId.data
  return (await admin.from('runs').select('id, code, name, start_date, end_date').eq('code', runId.toUpperCase()).maybeSingle()).data
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const actor = await getSettlementsActor()
  if (!actor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { runId } = await params
  const admin = createAdminClient()
  const run = await resolveRun(admin, runId)
  if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 })

  const { data: existing } = await admin
    .from('run_settlements')
    .select('run_id, costing_finalised_at')
    .eq('run_id', run.id)
    .maybeSingle()

  if (isCostingFinalised(existing)) {
    return NextResponse.json({ error: 'Run Costing is already finalised and locked' }, { status: 409 })
  }

  const [{ data: fields }, { data: shows }] = await Promise.all([
    admin.from('cost_fields').select('*').eq('run_id', run.id),
    admin.from('shows').select('show_date').eq('run_id', run.id),
  ])

  const capturedAt = new Date().toISOString()
  const snapshot = buildCostingSnapshot({
    runId: run.id,
    runCode: run.code,
    capturedAt,
    fields: fields ?? [],
  })

  const lastShow = (shows ?? [])
    .map(s => s.show_date as string | null)
    .filter((d): d is string => Boolean(d))
    .sort()
    .at(-1) ?? run.end_date
  const lastShowNudge = nudgeDueFromLastShow(lastShow)
  const early = Boolean(lastShow && lastShow >= capturedAt.slice(0, 10))

  const row = {
    run_id: run.id,
    costing_finalised_at: capturedAt,
    costing_finalised_by: actor.userId,
    costing_snapshot: snapshot,
    nudge_due_at: nudgeDueFromFinalise(capturedAt),
    updated_at: capturedAt,
  }

  const write = existing
    ? admin.from('run_settlements').update(row).eq('run_id', run.id).select('*').single()
    : admin.from('run_settlements').insert({ ...row, created_at: capturedAt }).select('*').single()
  const { data, error } = await write

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const copy = formatFinaliseAuditCopy({
    actorName: actor.fullName,
    runCode: run.code,
    fieldCount: snapshot.field_count,
    early,
  })
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
    snapshot,
    early,
    last_show_nudge_hint: lastShowNudge,
  })
}

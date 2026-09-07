import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server-admin'
import { writeAuditLog } from '@/lib/audit-log'
import { getSettlementsActor, resolveSettlementsRun } from '@/lib/settlements-access'
import {
  DISTRIBUTE_BLOCKED_NOTE,
  DISTRIBUTE_READY_NOTE,
  DISTRIBUTE_STUB_NOTE,
  distributeGateFromSources,
  formatDistributeAuditCopy,
} from '@/lib/settlements-distribute-gate'
import { loadSettlementWorkspace } from '@/lib/settlements-load'

async function gateForRun(runId: string) {
  const data = await loadSettlementWorkspace(runId)
  if (!data) return null
  const gate = distributeGateFromSources({
    fields: data.liveFields,
    wave1BandCosts: data.bandCosts,
    sheetBandActuals: data.actuals
      .filter(a => a.line_kind === 'band_cost')
      .map(a => ({ id: a.id, line_key: a.line_key, paid: a.paid, notes: a.notes })),
  })
  return { run: data.run, gate }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const actor = await getSettlementsActor()
  if (!actor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { runId } = await params
  const packed = await gateForRun(runId)
  if (!packed) return NextResponse.json({ error: 'Run not found' }, { status: 404 })
  return NextResponse.json({ gate: packed.gate, run: packed.run })
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const actor = await getSettlementsActor()
  if (!actor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { runId } = await params
  const packed = await gateForRun(runId)
  if (!packed) return NextResponse.json({ error: 'Run not found' }, { status: 404 })

  const { gate, run } = packed
  if (!gate.ready) {
    return NextResponse.json({
      error: DISTRIBUTE_BLOCKED_NOTE,
      gate,
      distributed: false,
    }, { status: 409 })
  }

  const admin = createAdminClient()
  const resolved = await resolveSettlementsRun(admin, runId)
  const copy = formatDistributeAuditCopy({
    actorName: actor.fullName,
    runCode: run.code,
    ready: true,
  })
  await writeAuditLog(admin, actor.userId, [{
    table_name: 'run_settlements',
    record_id: resolved?.id ?? run.id,
    run_id: resolved?.id ?? run.id,
    field_name: copy.fieldName,
    old_value: copy.oldValue,
    new_value: copy.newValue,
    change_type: 'update',
  }])

  return NextResponse.json({
    distributed: false,
    stub: true,
    message: DISTRIBUTE_READY_NOTE,
    note: DISTRIBUTE_STUB_NOTE,
    gate,
  })
}

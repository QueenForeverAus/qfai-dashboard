import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server-admin'
import { writeAuditLog } from '@/lib/audit-log'
import { getSettlementsActor } from '@/lib/settlements-access'
import { formatBandCostAddedAuditCopy } from '@/lib/settlements'

async function resolveRun(admin: ReturnType<typeof createAdminClient>, runId: string) {
  const byId = await admin.from('runs').select('id, code').eq('id', runId).maybeSingle()
  if (byId.data) return byId.data
  return (await admin.from('runs').select('id, code').eq('code', runId.toUpperCase()).maybeSingle()).data
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  const actor = await getSettlementsActor()
  if (!actor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { runId } = await params
  const admin = createAdminClient()
  const run = await resolveRun(admin, runId)
  if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 })

  const { data, error } = await admin
    .from('band_cost_lines')
    .select('*')
    .eq('run_id', run.id)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ lines: data ?? [] })
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  const actor = await getSettlementsActor()
  if (!actor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { runId } = await params
  const admin = createAdminClient()
  const run = await resolveRun(admin, runId)
  if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 })

  const body = await req.json() as {
    description?: string
    amount?: number | string
    notes?: string
    show_id?: string | null
  }

  const description = (body.description ?? '').trim()
  if (!description) return NextResponse.json({ error: 'Description is required' }, { status: 400 })

  const amount = Number(body.amount)
  if (!Number.isFinite(amount)) return NextResponse.json({ error: 'Amount must be a number' }, { status: 400 })

  const showId: string | null = body.show_id || null
  let showLabel: string | null = null
  if (showId) {
    const { data: show } = await admin
      .from('shows')
      .select('id, venue_name, run_id')
      .eq('id', showId)
      .single()
    if (!show || show.run_id !== run.id) {
      return NextResponse.json({ error: 'Show does not belong to this run' }, { status: 400 })
    }
    showLabel = show.venue_name
  }

  const { data, error } = await admin
    .from('band_cost_lines')
    .insert({
      run_id: run.id,
      show_id: showId,
      description,
      amount,
      notes: (body.notes ?? '').trim() || null,
      source: actor.fullName ? `Entered by ${actor.fullName.split(/\s+/)[0]}` : null,
      created_by: actor.userId,
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const copy = formatBandCostAddedAuditCopy({
    actorName: actor.fullName,
    runCode: run.code,
    description,
    amount,
    showLabel,
  })
  await writeAuditLog(admin, actor.userId, [{
    table_name: 'band_cost_lines',
    record_id: data.id,
    run_id: run.id,
    field_name: copy.fieldName,
    old_value: copy.oldValue,
    new_value: copy.newValue,
    change_type: 'update',
  }])

  return NextResponse.json({ line: data }, { status: 201 })
}

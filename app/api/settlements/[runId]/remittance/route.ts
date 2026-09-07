import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server-admin'
import { writeAuditLog } from '@/lib/audit-log'
import { getSettlementsActor, resolveSettlementsRun } from '@/lib/settlements-access'
import { formatRemittanceAddedAuditCopy, isRemittanceLineType } from '@/lib/remittance'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  const actor = await getSettlementsActor()
  if (!actor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { runId } = await params
  const admin = createAdminClient()
  const run = await resolveSettlementsRun(admin, runId)
  if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 })

  const { data, error } = await admin
    .from('remittance_lines')
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
  const run = await resolveSettlementsRun(admin, runId)
  if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 })

  const body = await req.json() as {
    description?: string
    amount?: number | string
    show_id?: string | null
    occurred_on?: string | null
    reference?: string | null
    line_type?: string
    hours?: number | string | null
    rate?: number | string | null
    headcount?: number | string | null
    notes?: string | null
  }

  const description = (body.description ?? '').trim()
  if (!description) return NextResponse.json({ error: 'Description is required' }, { status: 400 })

  const amount = Number(body.amount)
  if (!Number.isFinite(amount)) return NextResponse.json({ error: 'Amount must be a number' }, { status: 400 })

  const lineType = body.line_type ?? 'payment'
  if (!isRemittanceLineType(lineType)) {
    return NextResponse.json({ error: 'line_type must be payment, deduction, or adjustment' }, { status: 400 })
  }

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

  const numOrNull = (v: number | string | null | undefined) => {
    if (v == null || v === '') return null
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }

  const { data, error } = await admin
    .from('remittance_lines')
    .insert({
      run_id: run.id,
      show_id: showId,
      line_type: lineType,
      description,
      amount,
      occurred_on: body.occurred_on || null,
      reference: (body.reference ?? '').trim() || null,
      hours: numOrNull(body.hours),
      rate: numOrNull(body.rate),
      headcount: numOrNull(body.headcount),
      notes: (body.notes ?? '').trim() || null,
      created_by: actor.userId,
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const copy = formatRemittanceAddedAuditCopy({
    actorName: actor.fullName,
    runCode: run.code,
    description,
    amount,
    lineType,
    showLabel,
  })
  await writeAuditLog(admin, actor.userId, [{
    table_name: 'remittance_lines',
    record_id: data.id,
    run_id: run.id,
    field_name: copy.fieldName,
    old_value: copy.oldValue,
    new_value: copy.newValue,
    change_type: 'update',
  }])

  return NextResponse.json({ line: data }, { status: 201 })
}

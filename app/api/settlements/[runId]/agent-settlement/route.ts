import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server-admin'
import { writeAuditLog } from '@/lib/audit-log'
import { getSettlementsActor, resolveSettlementsRun } from '@/lib/settlements-access'

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
    hours?: number | string | null
    rate?: number | string | null
    notes?: string | null
  }

  const description = (body.description ?? '').trim()
  if (!description) return NextResponse.json({ error: 'Description is required' }, { status: 400 })
  const amount = Number(body.amount)
  if (!Number.isFinite(amount)) return NextResponse.json({ error: 'Amount must be a number' }, { status: 400 })

  const showId: string | null = body.show_id || null
  if (showId) {
    const { data: show } = await admin.from('shows').select('id, run_id').eq('id', showId).single()
    if (!show || show.run_id !== run.id) {
      return NextResponse.json({ error: 'Show does not belong to this run' }, { status: 400 })
    }
  }

  const numOrNull = (v: number | string | null | undefined) => {
    if (v == null || v === '') return null
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }

  const { data, error } = await admin
    .from('agent_settlement_lines')
    .insert({
      run_id: run.id,
      show_id: showId,
      description,
      amount,
      occurred_on: body.occurred_on || null,
      reference: (body.reference ?? '').trim() || null,
      hours: numOrNull(body.hours),
      rate: numOrNull(body.rate),
      notes: (body.notes ?? '').trim() || null,
      created_by: actor.userId,
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await writeAuditLog(admin, actor.userId, [{
    table_name: 'agent_settlement_lines',
    record_id: data.id,
    run_id: run.id,
    field_name: 'Agent Settlement line added',
    old_value: null,
    new_value: `${actor.fullName.trim() || 'Someone'} added proposed Settlement line ${description} ${new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(amount)} (run ${run.code}).`,
    change_type: 'update',
  }])

  return NextResponse.json({ line: data }, { status: 201 })
}

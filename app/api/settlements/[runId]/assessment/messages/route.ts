import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server-admin'
import { writeAuditLog } from '@/lib/audit-log'
import { getSettlementsActor, resolveSettlementsRun } from '@/lib/settlements-access'
import { showHasOccurred } from '@/lib/settlements-sheet'
import { formatAssessmentCommentAuditCopy } from '@/lib/settlements-v3-assessment'

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
    .from('settlement_assessment_messages')
    .select('*')
    .eq('run_id', run.id)
    .order('created_at', { ascending: true })

  if (error) {
    if (/settlement_assessment_messages|does not exist|42P01/i.test(error.message)) {
      return NextResponse.json({ messages: [], note: 'Assessment chat table not applied on this environment yet.' })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ messages: data ?? [] })
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

  const body = await req.json().catch(() => ({})) as { body?: string; show_id?: string | null }
  const text = (body.body ?? '').trim()
  if (!text) return NextResponse.json({ error: 'Comment body is required' }, { status: 400 })

  const showId = body.show_id ? String(body.show_id) : null
  if (showId) {
    const { data: show } = await admin
      .from('shows')
      .select('id, show_date, run_id')
      .eq('id', showId)
      .eq('run_id', run.id)
      .maybeSingle()
    if (!show) return NextResponse.json({ error: 'Show not found on this run' }, { status: 404 })
    if (!showHasOccurred(show.show_date)) {
      return NextResponse.json({
        error: 'Data not yet available — check back when the show has occurred.',
      }, { status: 409 })
    }
  }

  const { data, error } = await admin
    .from('settlement_assessment_messages')
    .insert({
      run_id: run.id,
      show_id: showId,
      author_id: actor.userId,
      author_name: actor.fullName || 'Operator',
      body: text,
    })
    .select('*')
    .single()

  if (error) {
    if (/settlement_assessment_messages|does not exist|42P01/i.test(error.message)) {
      return NextResponse.json({
        error: 'Assessment chat store is not on this environment yet (staging migration pending).',
      }, { status: 503 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const copy = formatAssessmentCommentAuditCopy({
    actorName: actor.fullName,
    runCode: run.code,
  })
  await writeAuditLog(admin, actor.userId, [{
    table_name: 'settlement_assessment_messages',
    record_id: data.id,
    run_id: run.id,
    field_name: copy.fieldName,
    old_value: copy.oldValue,
    new_value: copy.newValue,
    change_type: 'update',
  }])

  return NextResponse.json({ message: data }, { status: 201 })
}

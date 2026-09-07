import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server-admin'
import { writeAuditLog } from '@/lib/audit-log'
import { getSettlementsActor, resolveSettlementsRun } from '@/lib/settlements-access'
import { showHasOccurred } from '@/lib/settlements-sheet'
import { buildChallengeDraft, formatChallengeDraftAuditCopy } from '@/lib/remittance'
import type { ComparisonRow } from '@/lib/remittance-variance'
import { AUDIT_FIELD_SHEET_CHALLENGE } from '@/lib/settlements-sheet-actuals'

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

  const body = await req.json().catch(() => ({})) as {
    reason?: string
    rows?: ComparisonRow[]
    evidence?: Record<string, boolean>
    send?: boolean
    show_id?: string | null
    actual_id?: string | null
    line_key?: string
  }

  if (body.send) {
    return NextResponse.json({ error: 'Challenge drafts are never auto-sent. Operator sends.' }, { status: 400 })
  }

  const reason = (body.reason ?? '').trim()
  if (!reason) return NextResponse.json({ error: 'A reason is required for a challenge draft' }, { status: 400 })

  const rows = Array.isArray(body.rows) ? body.rows : []
  if (rows.length === 0) {
    return NextResponse.json({ error: 'Select at least one flagged line' }, { status: 400 })
  }

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

  const evidence = body.evidence && typeof body.evidence === 'object' ? body.evidence : {}
  const draft = buildChallengeDraft({
    runCode: run.code,
    reason,
    rows,
    actorName: actor.fullName,
    evidence,
  })

  const { data: challenge, error } = await admin
    .from('remittance_challenges')
    .insert({
      run_id: run.id,
      show_id: showId,
      status: 'draft',
      reason,
      subject: draft.subject,
      body: draft.body,
      to_label: draft.to_label,
      evidence,
      sent_at: null,
      created_by: actor.userId,
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const items = rows.map(row => ({
    challenge_id: challenge.id,
    remittance_line_id: row.remittanceLineIds[0] ?? null,
    comparison_id: row.id,
    flag_codes: row.flags.map(f => f.code),
    proposed_amount: row.proposed,
    paid_amount: row.paid,
    variance: row.variance,
    snapshot: row,
  }))
  const { error: itemError } = await admin.from('remittance_challenge_items').insert(items)
  if (itemError) return NextResponse.json({ error: itemError.message }, { status: 500 })

  if (body.actual_id) {
    await admin
      .from('settlement_actual_lines')
      .update({
        status: 'challenged',
        challenge_id: challenge.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', body.actual_id)
      .eq('run_id', run.id)
  } else if (body.line_key) {
    const parentKey = String(body.line_key)
    let q = admin
      .from('settlement_actual_lines')
      .select('id, line_key')
      .eq('run_id', run.id)
    q = showId ? q.eq('show_id', showId) : q.is('show_id', null)
    const { data: rows } = await q
    const targets = (rows ?? []).filter(row =>
      row.line_key === parentKey || String(row.line_key).startsWith(`${parentKey}::`),
    )
    if (targets.length) {
      await admin
        .from('settlement_actual_lines')
        .update({
          status: 'challenged',
          challenge_id: challenge.id,
          updated_at: new Date().toISOString(),
        })
        .eq('run_id', run.id)
        .in('id', targets.map(r => r.id))
    }
  }

  const copy = formatChallengeDraftAuditCopy({
    actorName: actor.fullName,
    runCode: run.code,
    lineCount: rows.length,
    reason,
  })
  await writeAuditLog(admin, actor.userId, [{
    table_name: 'remittance_challenges',
    record_id: challenge.id,
    run_id: run.id,
    field_name: AUDIT_FIELD_SHEET_CHALLENGE,
    old_value: copy.oldValue,
    new_value: copy.newValue,
    change_type: 'update',
  }])

  return NextResponse.json({
    challenge: { ...challenge, sent_at: null },
    sent: false,
    note: 'Draft only — not sent.',
  }, { status: 201 })
}

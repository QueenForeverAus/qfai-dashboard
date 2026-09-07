import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server-admin'
import { writeAuditLog } from '@/lib/audit-log'
import { getSettlementsActor, resolveSettlementsRun } from '@/lib/settlements-access'
import { buildChallengeDraft, formatChallengeDraftAuditCopy } from '@/lib/remittance'
import type { ComparisonRow } from '@/lib/remittance-variance'

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
    reason?: string
    rows?: ComparisonRow[]
    evidence?: Record<string, boolean>
    send?: boolean
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
    field_name: copy.fieldName,
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

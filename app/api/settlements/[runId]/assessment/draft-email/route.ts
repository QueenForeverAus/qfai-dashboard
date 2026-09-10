import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server-admin'
import { writeAuditLog } from '@/lib/audit-log'
import { getSettlementsActor, resolveSettlementsRun } from '@/lib/settlements-access'
import { loadSettlementWorkspace } from '@/lib/settlements-load'
import { buildRunSheet } from '@/lib/settlements-sheet'
import { applyCol3Actuals, applyCol3ToRunSheet } from '@/lib/settlements-sheet-actuals'
import { buildV3RunModel } from '@/lib/settlements-v3'
import { buildV3RedFlags, formatV3NigelAssessment } from '@/lib/settlements-v3-flags'
import {
  buildAssessmentEmailDraft,
  formatAssessmentDraftAuditCopy,
  isAssessmentDraftKind,
} from '@/lib/settlements-v3-assessment'

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
    kind?: string
    show_id?: string | null
    send?: boolean
  }

  if (body.send) {
    return NextResponse.json({
      error: 'Assessment email drafts are never auto-sent. Operator sends.',
    }, { status: 400 })
  }

  if (!isAssessmentDraftKind(body.kind)) {
    return NextResponse.json({ error: 'kind must be harbour_accept, harbour_challenge, or michael_factcheck' }, { status: 400 })
  }

  const data = await loadSettlementWorkspace(run.code)
  if (!data) return NextResponse.json({ error: 'Run not found' }, { status: 404 })

  const runModel = buildRunSheet({
    shows: data.shows,
    fields: data.liveFields,
    factors: data.insideFactors,
    remittanceLines: data.remittanceKnownLines,
    gstLines: data.gstKnownLines,
  })
  if (runModel.blocked) {
    return NextResponse.json({
      error: 'Data not yet available — check back when the show has occurred.',
    }, { status: 409 })
  }

  const col3Run = applyCol3ToRunSheet({
    sections: runModel.sections,
    runLines: runModel.runLines,
    actuals: data.actuals,
    remittanceLines: data.gstKnownLines,
  })
  const showSheets = runModel.occurred.map(show => {
    const section = runModel.sections.find(sec => sec.show.id === show.id)
    const rawLines = (section?.lines ?? []).filter(l => l.group !== 'run_costs')
    return {
      show,
      lines: applyCol3Actuals({
        lines: rawLines,
        actuals: data.actuals,
        showId: show.id,
        remittanceLines: data.gstKnownLines,
      }),
    }
  })
  const model = buildV3RunModel({
    shows: runModel.occurred,
    showSheets,
    runLines: col3Run.runLines,
    fields: data.liveFields,
    actuals: data.actuals,
    remittanceLines: data.remittanceLines,
    gstLines: data.gstKnownLines,
  })
  const flags = buildV3RedFlags(model)
  const nigel = formatV3NigelAssessment({
    runCode: data.run.code,
    venueName: data.run.name,
    model,
    flags,
  })
  const draft = buildAssessmentEmailDraft({
    kind: body.kind,
    runCode: data.run.code,
    venueName: data.run.name,
    actorName: actor.fullName,
    model,
    flags,
    messages: data.assessmentMessages,
    nigelParagraph: nigel,
  })

  const { data: challenge, error } = await admin
    .from('remittance_challenges')
    .insert({
      run_id: run.id,
      show_id: body.show_id ?? null,
      status: 'draft',
      reason: draft.reason,
      subject: draft.subject,
      body: draft.body,
      to_label: draft.to_label,
      evidence: { assessment_thread: true, kind: body.kind },
      sent_at: null,
      created_by: actor.userId,
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const copy = formatAssessmentDraftAuditCopy({
    actorName: actor.fullName,
    runCode: run.code,
    kind: body.kind,
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

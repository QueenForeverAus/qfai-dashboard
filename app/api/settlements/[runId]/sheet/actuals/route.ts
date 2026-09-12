import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server-admin'
import { writeAuditLog } from '@/lib/audit-log'
import { getSettlementsActor, resolveSettlementsRun } from '@/lib/settlements-access'
import { persistActualWriteBack } from '@/lib/settlements-advancing-sync-persist'
import { pickSourceNote, sourceNoteRequiredError } from '@/lib/settlements-advancing-sync'
import { showHasOccurred } from '@/lib/settlements-sheet'
import {
  formatSheetActualAuditCopy,
  formatSheetBandPaidAuditCopy,
  isSettlementActualKind,
  sheetBandPaidLockViolation,
  type SettlementActualKind,
  type SettlementActualSource,
} from '@/lib/settlements-sheet-actuals'

async function findExisting(
  admin: ReturnType<typeof createAdminClient>,
  runId: string,
  showId: string | null,
  lineKey: string,
) {
  let q = admin
    .from('settlement_actual_lines')
    .select('*')
    .eq('run_id', runId)
    .eq('line_key', lineKey)
  q = showId ? q.eq('show_id', showId) : q.is('show_id', null)
  return (await q.maybeSingle()).data
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

  const body = await req.json().catch(() => ({})) as {
    show_id?: string | null
    line_key?: string
    line_kind?: SettlementActualKind
    amount?: number | string
    source?: SettlementActualSource
    quote_note?: string | null
    notes?: string | null
    source_note?: string | null
    paid?: boolean
    label?: string
  }

  const lineKey = String(body.line_key ?? '').trim()
  if (!lineKey) return NextResponse.json({ error: 'line_key is required' }, { status: 400 })
  if (!isSettlementActualKind(body.line_kind)) {
    return NextResponse.json({ error: 'line_kind must be venue_settlement or band_cost' }, { status: 400 })
  }

  const showId = body.show_id ? String(body.show_id) : null
  let showLabel: string | null = null
  if (showId) {
    const { data: show } = await admin
      .from('shows')
      .select('id, venue_name, run_id, show_date')
      .eq('id', showId)
      .eq('run_id', run.id)
      .maybeSingle()
    if (!show) return NextResponse.json({ error: 'Show not found on this run' }, { status: 404 })
    if (!showHasOccurred(show.show_date)) {
      return NextResponse.json({
        error: 'Data not yet available — check back when the show has occurred.',
      }, { status: 409 })
    }
    showLabel = show.venue_name
  }

  const amount = Number(body.amount)
  if (!Number.isFinite(amount)) {
    return NextResponse.json({ error: 'amount must be a number' }, { status: 400 })
  }

  const existing = await findExisting(admin, run.id, showId, lineKey)
  const source: SettlementActualSource = body.source === 'harbour_fixture' || body.source === 'advancing_copy' || body.source === 'email_scrape'
    ? body.source
    : 'manual'
  const now = new Date().toISOString()

  if (existing) {
    const lock = sheetBandPaidLockViolation({
      existingPaid: Boolean(existing.paid),
      nextPaid: body.paid === undefined ? Boolean(existing.paid) : Boolean(body.paid),
      amountChanged: Number(existing.amount) !== amount,
      quoteNoteChanged: body.quote_note !== undefined
        && ((body.quote_note ?? '').trim() || null) !== ((existing.quote_note ?? '').trim() || null),
    })
    if (lock) return NextResponse.json({ error: lock }, { status: 409 })
  }

  const paid = body.paid === undefined ? Boolean(existing?.paid) : Boolean(body.paid)
  const quoteNote = typeof body.quote_note === 'string' || body.quote_note === null
    ? ((body.quote_note ?? '').trim() || null)
    : (existing?.quote_note ?? null)
  const sourceNote = pickSourceNote(
    body.source_note,
    body.notes,
    quoteNote,
    existing?.notes as string | null | undefined,
    existing?.quote_note as string | null | undefined,
  )
  const sourceErr = sourceNoteRequiredError(sourceNote)
  if (sourceErr) return NextResponse.json({ error: sourceErr }, { status: 400 })

  const payload = {
    run_id: run.id,
    show_id: showId,
    line_key: lineKey,
    line_kind: body.line_kind,
    amount,
    status: existing?.status === 'challenged' ? 'challenged' : 'confirmed',
    source: existing && source === 'manual' && existing.source !== 'manual' ? 'manual' : source,
    notes: sourceNote,
    quote_note: quoteNote,
    paid,
    paid_at: paid ? (existing?.paid_at ?? now) : null,
    updated_at: now,
    created_by: existing?.created_by ?? actor.userId,
  }

  const query = existing
    ? admin.from('settlement_actual_lines').update(payload).eq('id', existing.id).select('*').single()
    : admin.from('settlement_actual_lines').insert(payload).select('*').single()

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const label = (body.label ?? lineKey).trim()
  try {
    await persistActualWriteBack({
      admin,
      runId: run.id,
      runCode: run.code,
      lineKey,
      showId,
      label,
      actualAmount: amount,
      markPaid: paid,
      sourceNote,
      actorUserId: actor.userId,
      actorName: actor.fullName,
    })
  } catch (err) {
    console.error('Settlements → Advancing write-back failed:', err)
  }

  const paidChanged = Boolean(existing?.paid) !== paid
  if (paidChanged) {
    const copy = formatSheetBandPaidAuditCopy({
      actorName: actor.fullName,
      runCode: run.code,
      label,
      status: paid ? 'paid' : 'open',
    })
    await writeAuditLog(admin, actor.userId, [{
      table_name: 'settlement_actual_lines',
      record_id: data.id,
      run_id: run.id,
      field_name: copy.fieldName,
      old_value: copy.oldValue,
      new_value: copy.newValue,
      change_type: 'update',
    }])
  } else if (!existing || Number(existing.amount) !== amount) {
    const copy = formatSheetActualAuditCopy({
      actorName: actor.fullName,
      runCode: run.code,
      label,
      amount,
      source,
      showLabel,
    })
    await writeAuditLog(admin, actor.userId, [{
      table_name: 'settlement_actual_lines',
      record_id: data.id,
      run_id: run.id,
      field_name: copy.fieldName,
      old_value: existing ? String(existing.amount) : null,
      new_value: copy.newValue,
      change_type: 'update',
    }])
  }

  return NextResponse.json({ line: data }, { status: existing ? 200 : 201 })
}

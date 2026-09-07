import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server-admin'
import { writeAuditLog } from '@/lib/audit-log'
import { getSettlementsActor } from '@/lib/settlements-access'
import { formatBandCostStatusAuditCopy } from '@/lib/settlements'
import { formatQuoteAttachmentAuditCopy, formatQuoteNoteAuditCopy } from '@/lib/quote-invoice-stub'
import type { AuditLogWriteRow } from '@/lib/audit-log'

async function resolveRun(admin: ReturnType<typeof createAdminClient>, runId: string) {
  const byId = await admin.from('runs').select('id, code').eq('id', runId).maybeSingle()
  if (byId.data) return byId.data
  return (await admin.from('runs').select('id, code').eq('code', runId.toUpperCase()).maybeSingle()).data
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ runId: string; lineId: string }> },
) {
  const actor = await getSettlementsActor()
  if (!actor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { runId, lineId } = await params
  const admin = createAdminClient()
  const run = await resolveRun(admin, runId)
  if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 })

  const { data: existing } = await admin
    .from('band_cost_lines')
    .select('*')
    .eq('id', lineId)
    .eq('run_id', run.id)
    .maybeSingle()

  if (!existing) return NextResponse.json({ error: 'Band cost not found' }, { status: 404 })

  const body = await req.json() as {
    paid?: boolean
    waived?: boolean
    quote_note?: string | null
    attachment_path?: string | null
    attachment_filename?: string | null
    attachment_mime?: string | null
    clear_attachment?: boolean
  }
  const now = new Date().toISOString()
  const updates: Record<string, unknown> = { updated_at: now }
  const audits: AuditLogWriteRow[] = []

  const statusTouched = body.paid !== undefined || body.waived !== undefined
  if (statusTouched) {
    let paid = existing.paid as boolean
    let waived = existing.waived as boolean
    if (body.waived === true) {
      waived = true
      paid = false
    } else if (body.paid === true) {
      paid = true
      waived = false
    } else if (body.paid === false || body.waived === false) {
      paid = false
      waived = false
    }
    updates.paid = paid
    updates.waived = waived
    updates.paid_at = paid ? now : null
    if (paid !== existing.paid || waived !== existing.waived) {
      const status = waived ? 'waived' : paid ? 'paid' : 'open'
      const copy = formatBandCostStatusAuditCopy({
        actorName: actor.fullName,
        runCode: run.code,
        description: existing.description,
        status,
      })
      audits.push({
        table_name: 'band_cost_lines',
        record_id: lineId,
        run_id: run.id,
        field_name: copy.fieldName,
        old_value: copy.oldValue,
        new_value: copy.newValue,
        change_type: 'update',
      })
    }
  }

  if (typeof body.quote_note === 'string' || body.quote_note === null) {
    const nextNote = (body.quote_note ?? '').trim() || null
    const prevNote = (existing.quote_note ?? '').trim() || null
    if (nextNote !== prevNote) {
      updates.quote_note = nextNote
      const copy = formatQuoteNoteAuditCopy({
        actorName: actor.fullName,
        runCode: run.code,
        lineLabel: existing.description,
        oldNote: prevNote,
        newNote: nextNote,
        scope: 'band-cost',
      })
      audits.push({
        table_name: 'band_cost_lines',
        record_id: lineId,
        run_id: run.id,
        field_name: copy.fieldName,
        old_value: copy.oldValue,
        new_value: copy.newValue,
        change_type: 'update',
      })
    }
  }

  if (body.clear_attachment) {
    if (existing.attachment_path || existing.attachment_filename) {
      updates.attachment_path = null
      updates.attachment_filename = null
      updates.attachment_mime = null
      const copy = formatQuoteAttachmentAuditCopy({
        actorName: actor.fullName,
        runCode: run.code,
        lineLabel: existing.description,
        oldFilename: existing.attachment_filename,
        newFilename: null,
        scope: 'band-cost',
      })
      audits.push({
        table_name: 'band_cost_lines',
        record_id: lineId,
        run_id: run.id,
        field_name: copy.fieldName,
        old_value: copy.oldValue,
        new_value: copy.newValue,
        change_type: 'update',
      })
    }
  } else if (typeof body.attachment_path === 'string' && body.attachment_path.trim()) {
    const nextName = (body.attachment_filename ?? '').trim() || 'attachment'
    updates.attachment_path = body.attachment_path.trim()
    updates.attachment_filename = nextName
    updates.attachment_mime = (body.attachment_mime ?? '').trim() || null
    const copy = formatQuoteAttachmentAuditCopy({
      actorName: actor.fullName,
      runCode: run.code,
      lineLabel: existing.description,
      oldFilename: existing.attachment_filename,
      newFilename: nextName,
      scope: 'band-cost',
    })
    audits.push({
      table_name: 'band_cost_lines',
      record_id: lineId,
      run_id: run.id,
      field_name: copy.fieldName,
      old_value: copy.oldValue,
      new_value: copy.newValue,
      change_type: 'update',
    })
  }

  if (Object.keys(updates).length <= 1) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const { data, error } = await admin
    .from('band_cost_lines')
    .update(updates)
    .eq('id', lineId)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await writeAuditLog(admin, actor.userId, audits)

  return NextResponse.json({ line: data })
}

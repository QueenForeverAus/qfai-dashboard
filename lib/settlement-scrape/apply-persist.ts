/**
 * Persist a settlement / remittance email-scrape apply.
 * Writes settlement_actual_lines or remittance_lines. Never sends email.
 * Never writes cost_fields or PAID.
 */

import { writeAuditLog } from '../audit-log.ts'
import { showHasOccurred } from '../settlements-sheet.ts'
import type { createAdminClient } from '@/lib/supabase/server-admin'
import {
  formatSettlementScrapeAuditCopy,
  planSettlementScrapeApply,
  SETTLEMENT_SCRAPE_APPLY_WRITES_COST_FIELDS,
  type SettlementScrapeApplyPlan,
} from './apply-engine.ts'

type AdminClient = ReturnType<typeof createAdminClient>

export type SettlementScrapePersistResult = {
  preview: SettlementScrapeApplyPlan
  applied: boolean
  actual_ids: string[]
  remittance_ids: string[]
  writes_cost_fields: false
  sent: false
}

export async function persistSettlementScrapeApply(opts: {
  admin: AdminClient
  runId: string
  runCode: string
  bookingStatus: string
  showId: string
  showDates: Array<string | null | undefined>
  packet: unknown
  actorUserId: string | null
  actorName: string
  previewOnly: boolean
  confirmMoney: boolean
  moneyConfirmedBy?: string | null
}): Promise<SettlementScrapePersistResult> {
  if (SETTLEMENT_SCRAPE_APPLY_WRITES_COST_FIELDS) {
    throw new Error('Settlement scrape apply must never write cost_fields')
  }

  const preview = planSettlementScrapeApply({
    packet: opts.packet,
    bookingStatus: opts.bookingStatus,
    showDates: opts.showDates,
    confirmMoney: opts.confirmMoney,
    moneyConfirmedBy: opts.moneyConfirmedBy,
  })

  if (!preview.ok || opts.previewOnly) {
    return {
      preview,
      applied: false,
      actual_ids: [],
      remittance_ids: [],
      writes_cost_fields: false,
      sent: false,
    }
  }

  const now = new Date().toISOString()
  const actualIds: string[] = []
  const remittanceIds: string[] = []

  for (const row of preview.actuals) {
    const payload = {
      run_id: opts.runId,
      show_id: opts.showId,
      line_key: row.line_key,
      line_kind: row.line_kind,
      amount: row.amount,
      notes: row.notes,
      status: 'confirmed' as const,
      source: 'email_scrape',
      paid: false,
      paid_at: null,
      updated_at: now,
      created_by: opts.actorUserId,
      attachment_filename: preview.packet?.attachments[0]?.filename ?? null,
      attachment_mime: preview.packet?.attachments[0]?.mime ?? null,
    }
    const existing = (await opts.admin
      .from('settlement_actual_lines')
      .select('id')
      .eq('run_id', opts.runId)
      .eq('line_key', row.line_key)
      .eq('show_id', opts.showId)
      .maybeSingle()).data
    const query = existing
      ? opts.admin.from('settlement_actual_lines').update(payload).eq('id', existing.id).select('id').single()
      : opts.admin.from('settlement_actual_lines').insert(payload).select('id').single()
    const result = await query
    if (result.error) {
      if (/email_scrape|source/i.test(result.error.message)) {
        const fallback = { ...payload, source: 'manual' as const }
        const retry = existing
          ? await opts.admin.from('settlement_actual_lines').update(fallback).eq('id', existing.id).select('id').single()
          : await opts.admin.from('settlement_actual_lines').insert(fallback).select('id').single()
        if (retry.error) throw new Error(retry.error.message)
        if (retry.data?.id) actualIds.push(String(retry.data.id))
        continue
      }
      throw new Error(result.error.message)
    }
    if (result.data?.id) actualIds.push(String(result.data.id))
  }

  for (const row of preview.remittance) {
    const existing = (await opts.admin
      .from('remittance_lines')
      .select('id')
      .eq('run_id', opts.runId)
      .eq('reference', row.reference)
      .eq('description', row.description)
      .maybeSingle()).data
    const payload = {
      run_id: opts.runId,
      show_id: opts.showId,
      line_type: row.line_type,
      description: row.description,
      amount: row.amount,
      occurred_on: null,
      reference: row.reference,
      notes: row.notes,
      created_by: opts.actorUserId,
    }
    const query = existing
      ? opts.admin.from('remittance_lines').update(payload).eq('id', existing.id).select('id').single()
      : opts.admin.from('remittance_lines').insert(payload).select('id').single()
    const result = await query
    if (result.error) throw new Error(result.error.message)
    if (result.data?.id) remittanceIds.push(String(result.data.id))
  }

  const copy = formatSettlementScrapeAuditCopy({
    actorName: opts.actorName,
    runCode: opts.runCode,
    kind: preview.kind ?? 'settlement',
    attachmentCount: preview.packet?.attachments.length ?? 0,
    lineCount: preview.lines.length,
  })
  await writeAuditLog(opts.admin, opts.actorUserId, [{
    table_name: preview.kind === 'remittance' ? 'remittance_lines' : 'settlement_actual_lines',
    record_id: opts.runId,
    run_id: opts.runId,
    field_name: copy.fieldName,
    old_value: copy.oldValue,
    new_value: copy.newValue,
    change_type: 'update',
  }])

  return {
    preview,
    applied: true,
    actual_ids: actualIds,
    remittance_ids: remittanceIds,
    writes_cost_fields: false,
    sent: false,
  }
}

export function pickOccurredShow<T extends { id: string; show_date: string | null }>(
  shows: T[],
  preferredId?: string | null,
): T | null {
  const occurred = shows.filter(s => showHasOccurred(s.show_date))
  if (preferredId) return occurred.find(s => s.id === preferredId) ?? occurred[0] ?? null
  return occurred[0] ?? null
}

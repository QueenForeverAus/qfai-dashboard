/**
 * Persist a receipt-extract apply onto Run Advancing only.
 * Never writes cost_fields / locked Run Costings.
 */

import { writeAuditLog } from '../audit-log.ts'
import { applyPaidChecklistTicks } from '../advancing-checklist-paid-ticks-persist.ts'
import { ADVANCING_WRITEBACK_ERROR } from '../run-advancing.ts'
import { assertNoAdvancingWriteBack } from '../run-advancing-persist.ts'
import type { createAdminClient } from '@/lib/supabase/server-admin'
import {
  assertReceiptApplyTable,
  formatReceiptApplyAuditCopy,
  planReceiptApply,
  RECEIPT_APPLY_WRITES_COST_FIELDS,
  type ReceiptApplyPlan,
} from './apply-engine.ts'
import type { ReceiptShowLike } from './itinerary.ts'
import { isHotelReceiptPacket } from './packet.ts'

type AdminClient = ReturnType<typeof createAdminClient>

export type ReceiptApplyPersistResult = {
  preview: ReceiptApplyPlan
  applied: boolean
  accommodation_field_id: string | null
  ticked_ids: string[]
}

const ACCOM_CATEGORY = 'Travel & Accommodation'
const ACCOM_KEY = 'accommodation'
const ACCOM_LABEL = 'Accommodation'

export async function persistReceiptApply(opts: {
  admin: AdminClient
  runId: string
  workspaceId: string
  bookingStatus: string
  packet: unknown
  actorUserId: string
  actorName: string
  previewOnly: boolean
}): Promise<ReceiptApplyPersistResult> {
  assertNoAdvancingWriteBack()
  if (RECEIPT_APPLY_WRITES_COST_FIELDS) {
    throw new Error(ADVANCING_WRITEBACK_ERROR)
  }

  const from = (table: string) => {
    assertReceiptApplyTable(table)
    return opts.admin.from(table)
  }

  const [{ data: run }, { data: shows }, { data: field }] = await Promise.all([
    from('runs')
      .select('id, code, status, hotels_overview_notes')
      .eq('id', opts.runId)
      .maybeSingle(),
    from('shows')
      .select('id, venue_city, venue_name, show_date, show_order, hotel_notes')
      .eq('run_id', opts.runId)
      .order('show_order'),
    from('advancing_cost_fields')
      .select('*')
      .eq('workspace_id', opts.workspaceId)
      .eq('field_key', ACCOM_KEY)
      .is('show_id', null)
      .maybeSingle(),
  ])

  const showRows = (shows ?? []) as ReceiptShowLike[]
  const preview = planReceiptApply({
    bookingStatus: opts.bookingStatus,
    hasActiveWorkspace: true,
    packet: opts.packet,
    existingEntries: field?.entries,
    shows: showRows,
    hotelsOverviewNotes: run?.hotels_overview_notes ?? null,
  })

  if (!preview.ok || opts.previewOnly) {
    return {
      preview,
      applied: false,
      accommodation_field_id: field?.id ? String(field.id) : null,
      ticked_ids: [],
    }
  }

  const now = new Date().toISOString()
  const fieldPatch = {
    entries: preview.next_entries,
    value: preview.field_value,
    source: preview.field_source,
    updated_at: now,
    updated_by: opts.actorUserId,
  }

  let fieldId = field?.id ? String(field.id) : null
  if (fieldId) {
    const { error } = await from('advancing_cost_fields')
      .update(fieldPatch)
      .eq('id', fieldId)
      .eq('workspace_id', opts.workspaceId)
    if (error) throw new Error(error.message)
  } else {
    const { data, error } = await from('advancing_cost_fields')
      .insert({
        workspace_id: opts.workspaceId,
        run_id: opts.runId,
        source_cost_field_id: null,
        show_id: null,
        category: ACCOM_CATEGORY,
        field_key: ACCOM_KEY,
        label: ACCOM_LABEL,
        state: 'estimated',
        line_items: null,
        ...fieldPatch,
      })
      .select('id')
      .single()
    if (error || !data) throw new Error(error?.message ?? 'Failed to create Advancing accommodation line')
    fieldId = String(data.id)
  }

  if (preview.worksheet.show_id) {
    const { error } = await from('shows')
      .update({
        hotel_notes: preview.worksheet.hotel_notes,
        updated_by: opts.actorUserId,
      })
      .eq('id', preview.worksheet.show_id)
      .eq('run_id', opts.runId)
    if (error) throw new Error(error.message)
  }

  const { error: runError } = await from('runs')
    .update({ hotels_overview_notes: preview.worksheet.hotels_overview_notes })
    .eq('id', opts.runId)
  if (runError) throw new Error(runError.message)

  let tickedIds: string[] = []
  if (preview.will_tick_hotel_confirmed) {
    const ticks = await applyPaidChecklistTicks({
      admin: opts.admin,
      runId: opts.runId,
      paidFieldKeys: ['accommodation'],
      source: 'advancing',
      actorUserId: opts.actorUserId,
      actorName: opts.actorName,
      writeAudit: true,
    })
    tickedIds = ticks.tickedIds
  }

  const hotel = preview.packet && isHotelReceiptPacket(preview.packet) ? preview.packet : null
  const narrative = formatReceiptApplyAuditCopy({
    actorName: opts.actorName,
    vendor: hotel?.vendor ?? 'hotel',
    confirmationId: hotel?.confirmation_id ?? '',
    dateIso: hotel?.check_in ?? new Date().toISOString().slice(0, 10),
    nightCount: preview.nights.length,
  })
  await writeAuditLog(opts.admin, opts.actorUserId, [{
    table_name: 'advancing_cost_fields',
    record_id: fieldId,
    run_id: opts.runId,
    field_name: narrative.fieldName,
    old_value: narrative.oldValue,
    new_value: narrative.newValue,
    change_type: 'update',
  }])

  return {
    preview,
    applied: true,
    accommodation_field_id: fieldId,
    ticked_ids: tickedIds,
  }
}

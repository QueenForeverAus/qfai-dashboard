/**
 * Persist a travel-scrape apply onto the BOOKED Run Advancing twin.
 * Never writes cost_fields / locked Run Costings.
 * Source note lands on advancement_items.notes only — not Worksheet chrome.
 */

import { KNOWN_ITEM_KEYS } from '../advancement-checklist.ts'
import { writeAuditLog } from '../audit-log.ts'
import { ADVANCING_WRITEBACK_ERROR } from '../run-advancing.ts'
import { assertNoAdvancingWriteBack } from '../run-advancing-persist.ts'
import { appendUniqueNote } from '../receipts/source.ts'
import type { createAdminClient } from '@/lib/supabase/server-admin'
import {
  assertTravelScrapeApplyTable,
  formatTravelScrapeApplyAuditCopy,
  planTravelScrapeApply,
  TRAVEL_SCRAPE_APPLY_WRITES_COST_FIELDS,
  type TravelScrapeApplyPlan,
} from './apply-engine.ts'
import { DEFINED_RUN_COST_FIELDS } from '../cost-fields.ts'

type AdminClient = ReturnType<typeof createAdminClient>

export type TravelScrapePersistResult = {
  preview: TravelScrapeApplyPlan
  applied: boolean
  ticked_ids: string[]
  ticked_keys: string[]
  /**
   * Shared Advancing accommodation row id. Intentional — nights are
   * `entries[]` lines (see money_entry_id). PAID is per-entry.
   */
  money_field_id: string | null
  money_entry_id: string | null
  city_night_key: string | null
  writes_cost_fields: false
}

export async function persistTravelScrapeApply(opts: {
  admin: AdminClient
  runId: string
  runCode: string
  workspaceId: string
  bookingStatus: string
  packet: unknown
  actorUserId: string | null
  actorName: string
  previewOnly: boolean
  confirmMoney: boolean
  moneyConfirmedBy?: string | null
  existingEntries?: unknown
}): Promise<TravelScrapePersistResult> {
  assertNoAdvancingWriteBack()
  if (TRAVEL_SCRAPE_APPLY_WRITES_COST_FIELDS) {
    throw new Error(ADVANCING_WRITEBACK_ERROR)
  }

  const from = (table: string) => {
    assertTravelScrapeApplyTable(table)
    return opts.admin.from(table)
  }

  const [{ data: workspace }, { data: profiles }] = await Promise.all([
    from('run_advancing_workspaces')
      .select('id, travel_blocks')
      .eq('id', opts.workspaceId)
      .is('archived_at', null)
      .maybeSingle(),
    opts.admin.from('profiles').select('id, full_name, nickname'),
  ])

  const profileRows = (profiles ?? []).map(row => ({
    id: String(row.id),
    full_name: String(row.full_name ?? ''),
    nickname: row.nickname == null ? null : String(row.nickname),
  }))

  const hintPlan = planTravelScrapeApply({
    bookingStatus: opts.bookingStatus,
    hasActiveWorkspace: true,
    targetRunId: opts.runId,
    packet: opts.packet,
    existingTravelBlocks: workspace?.travel_blocks,
    existingEntries: opts.existingEntries,
    profiles: profileRows,
    confirmMoney: opts.confirmMoney,
    moneyConfirmedBy: opts.moneyConfirmedBy,
  })

  let existingEntries = opts.existingEntries
  let moneyField: { id?: string; entries?: unknown } | null = null
  // Shared money_field_id is intentional: one Advancing row per field_key
  // (CostFieldsTab expandable entries). Hotel nights upsert into entries[]
  // by confirmation_id, else city+night_date. Non-accom upserts by
  // confirmation_id only (blank confirmation refuses the money write).
  // PAID is per-entry. Never replace the stored entries array with a single night.
  if (hintPlan.money.field_key) {
    const { data } = await from('advancing_cost_fields')
      .select('id, entries')
      .eq('workspace_id', opts.workspaceId)
      .eq('field_key', hintPlan.money.field_key)
      .is('show_id', null)
      .maybeSingle()
    moneyField = data
    if (data) existingEntries = data.entries
  }

  const preview = existingEntries === opts.existingEntries
    ? hintPlan
    : planTravelScrapeApply({
      bookingStatus: opts.bookingStatus,
      hasActiveWorkspace: true,
      targetRunId: opts.runId,
      packet: opts.packet,
      existingTravelBlocks: workspace?.travel_blocks,
      existingEntries,
      profiles: profileRows,
      confirmMoney: opts.confirmMoney,
      moneyConfirmedBy: opts.moneyConfirmedBy,
    })

  const nothingToWrite = !preview.details.will_apply
    && !preview.checklist.will_apply
    && !preview.money.will_write
  if (!preview.ok || opts.previewOnly || nothingToWrite) {
    return {
      preview,
      applied: false,
      ticked_ids: [],
      ticked_keys: [],
      money_field_id: moneyField?.id ? String(moneyField.id) : null,
      money_entry_id: preview.money.money_entry_id,
      city_night_key: preview.money.city_night_key,
      writes_cost_fields: false,
    }
  }

  const now = new Date().toISOString()

  if (preview.details.will_apply && preview.details.merge_action !== 'none') {
    const { error } = await from('run_advancing_workspaces')
      .update({ travel_blocks: preview.next_travel_blocks, updated_at: now })
      .eq('id', opts.workspaceId)
      .is('archived_at', null)
    if (error) throw new Error(error.message)
  }

  const tickedIds: string[] = []
  const tickedKeys: string[] = []
  if (preview.checklist.will_apply) {
    const { data: items, error: itemsError } = await from('advancement_items')
      .select('id, item_key, status, notes')
      .eq('run_id', opts.runId)
    if (itemsError) throw new Error(itemsError.message)

    for (const item of items ?? []) {
      const key = String(item.item_key)
      if (!preview.checklist.item_keys.includes(key)) continue
      if (!KNOWN_ITEM_KEYS.has(key)) continue
      if (item.status === 'n_a') continue

      const updates: Record<string, unknown> = {
        notes: appendUniqueNote(item.notes as string | null, preview.checklist.source_note),
        updated_at: now,
      }
      if (opts.actorUserId) updates.updated_by = opts.actorUserId
      if (item.status === 'pending') updates.status = 'done'

      const { data, error } = await from('advancement_items')
        .update(updates)
        .eq('id', item.id)
        .select('id, item_key, status')
        .maybeSingle()
      if (error) throw new Error(error.message)
      if (!data) continue
      tickedIds.push(String(data.id))
      tickedKeys.push(String(data.item_key))
    }
  }

  let moneyFieldId = moneyField?.id ? String(moneyField.id) : null
  if (preview.money.will_write && preview.money.field_key) {
    const def = DEFINED_RUN_COST_FIELDS.find(row => row.key === preview.money.field_key)
    // Planner already upserted this night into the full entries[]; write that
    // merged array. Do not substitute [this night] for stored nights.
    const fieldPatch: Record<string, unknown> = {
      entries: preview.money.next_entries,
      value: preview.money.field_value,
      updated_at: now,
    }
    if (opts.actorUserId) fieldPatch.updated_by = opts.actorUserId
    if (moneyFieldId) {
      const { error } = await from('advancing_cost_fields')
        .update(fieldPatch)
        .eq('id', moneyFieldId)
        .eq('workspace_id', opts.workspaceId)
      if (error) throw new Error(error.message)
    } else if (def) {
      const { data, error } = await from('advancing_cost_fields')
        .insert({
          workspace_id: opts.workspaceId,
          run_id: opts.runId,
          source_cost_field_id: null,
          show_id: null,
          category: def.category,
          field_key: def.key,
          label: def.label,
          state: 'estimated',
          line_items: null,
          ...fieldPatch,
        })
        .select('id')
        .single()
      if (error || !data) throw new Error(error?.message ?? 'Failed to create Advancing money line')
      moneyFieldId = String(data.id)
    }
  }

  const narrative = formatTravelScrapeApplyAuditCopy({
    actorName: opts.actorName,
    runCode: opts.runCode,
    category: preview.packet?.category ?? 'travel',
    detailsApplied: preview.details.will_apply,
    moneyWritten: preview.money.will_write,
  })
  await writeAuditLog(opts.admin, opts.actorUserId, [{
    table_name: 'run_advancing_workspaces',
    record_id: opts.workspaceId,
    run_id: opts.runId,
    field_name: narrative.fieldName,
    old_value: narrative.oldValue,
    new_value: narrative.newValue,
    change_type: 'update',
  }])

  return {
    preview,
    applied: preview.details.will_apply,
    ticked_ids: tickedIds,
    ticked_keys: tickedKeys,
    money_field_id: moneyFieldId,
    money_entry_id: preview.money.money_entry_id,
    city_night_key: preview.money.city_night_key,
    writes_cost_fields: false,
  }
}

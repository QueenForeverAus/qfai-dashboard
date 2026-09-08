/**
 * Tour Desk v2 Phase 1 — Run Advancing twin sheet.
 *
 * At BOOKED, the whole run cost sheet is copied into a separate Advancing
 * workspace. Costing cost lines stay locked; Advancing is the working copy.
 * Advancing edits never write back into Run Costings.
 *
 * Settings toggles are PARKED — lock is hardcoded ON.
 */

import { isBookedBookingStatus } from './booked-cost-freeze.ts'
import type { CostEntry, StaffLineItem } from './cost-fields.ts'

/** Settings toggles PARKED. Do not add a Settings UI to unlock this. */
export const TOUR_DESK_V2_SETTINGS_LOCK_ON = true as const

/** Hard rule — Advancing must never mutate locked Run Costings. */
export const ADVANCING_WRITES_BACK_TO_COSTING = false as const

export const RUN_ADVANCING_TAB = 'run_advancing' as const
export const RUN_ADVANCING_TAB_LABEL = 'Run Advancing'
export const ADVANCING_CHECKLIST_TAB_LABEL = 'Advancing Checklist'
export const WORKSHEET_TAB_LABEL = 'Worksheet'

export const AUDIT_FIELD_RUN_ADVANCING_COPY = 'Run Advancing copy'
export const AUDIT_FIELD_RUN_ADVANCING_ARCHIVE = 'Run Advancing archive'

export const RUN_ADVANCING_EMPTY =
  'Run Advancing is available after this run is BOOKED. Accept the run to copy the cost sheet into a working Advancing workspace.'

export const RUN_ADVANCING_BANNER =
  'Run Advancing — working copy of the BOOKED cost sheet. Edits stay here and are not written back into locked Run Costings.'

export const RUN_ADVANCING_ARCHIVED_NOTE =
  'This Advancing workspace was soft-archived when the run was UNBOOKED. Costing is editable again.'

export const PNL_CHROME_LOCKED_ERROR =
  'This run is BOOKED — P&L chrome (ticket price, capacity, venue inside overrides) is read-only on Run Costings. Edit the working copy on Run Advancing.'

export const ADVANCING_ARCHIVED_ERROR =
  'This Advancing workspace is archived. Re-BOOK the run to copy a fresh working sheet.'

export const ADVANCING_WRITEBACK_ERROR =
  'Advancing edits cannot write back into locked Run Costings.'

/** Show columns that are working P&L chrome (not sell-through sliders). */
export const PNL_CHROME_SHOW_FIELDS = [
  'capacity',
  'capacity_bands',
  'ticket_price',
  'booking_fee_per_payer',
  'cc_fee_pct',
] as const

export type PnlChromeShowField = (typeof PNL_CHROME_SHOW_FIELDS)[number]

export type AdvancingShowChrome = {
  show_id: string
  ticket_price: number | null
  capacity: number | null
  capacity_bands: unknown
  booking_fee_per_payer: number | null
  cc_fee_pct: number | null
}

export type AdvancingCostFieldCopy = {
  workspace_id: string
  run_id: string
  source_cost_field_id: string | null
  show_id: string | null
  category: string
  field_key: string
  label: string
  value: number | null
  state: string
  source: string | null
  line_items: StaffLineItem[] | null
  entries: CostEntry[] | null
}

export type CostFieldCopySource = {
  id: string
  run_id: string
  show_id: string | null
  category: string
  field_key: string
  label: string
  value: number | null
  state: string
  source: string | null
  line_items: unknown
  entries: unknown
}

export type ShowChromeSource = {
  id: string
  ticket_price?: number | null
  capacity?: number | null
  capacity_bands?: unknown
  booking_fee_per_payer?: number | null
  cc_fee_pct?: number | null
}

export function isPnlChromeShowField(key: string): key is PnlChromeShowField {
  return (PNL_CHROME_SHOW_FIELDS as readonly string[]).includes(key)
}

export function pnlChromeMutationBlockedReason(frozen: boolean): string | null {
  if (!TOUR_DESK_V2_SETTINGS_LOCK_ON) return null
  return frozen ? PNL_CHROME_LOCKED_ERROR : null
}

export function advancingWriteBackBlocked(): boolean {
  return TOUR_DESK_V2_SETTINGS_LOCK_ON && !ADVANCING_WRITES_BACK_TO_COSTING
}

/** Copy the whole run into Advancing when transitioning into BOOKED. */
export function shouldCopyRunIntoAdvancing(opts: {
  nextStatus: string | null | undefined
  prevStatus?: string | null
  hasActiveWorkspace?: boolean
}): boolean {
  if (!isBookedBookingStatus(opts.nextStatus)) return false
  if (opts.hasActiveWorkspace === true && isBookedBookingStatus(opts.prevStatus)) return false
  if (opts.hasActiveWorkspace === true && !isBookedBookingStatus(opts.prevStatus)) return true
  return !isBookedBookingStatus(opts.prevStatus) || opts.hasActiveWorkspace !== true
}

/** Soft-archive Advancing when leaving BOOKED (UNBOOKED / Unconfirm). */
export function shouldArchiveAdvancingWorkspace(opts: {
  nextStatus: string | null | undefined
  prevStatus?: string | null
  hasActiveWorkspace?: boolean
}): boolean {
  if (!isBookedBookingStatus(opts.prevStatus)) return false
  if (isBookedBookingStatus(opts.nextStatus)) return false
  return opts.hasActiveWorkspace !== false
}

export function isAdvancingWorkspaceActive(row: {
  archived_at?: string | null
} | null | undefined): boolean {
  return Boolean(row) && row?.archived_at == null
}

export function buildAdvancingShowsChrome(shows: ShowChromeSource[]): AdvancingShowChrome[] {
  return shows.map(show => ({
    show_id: show.id,
    ticket_price: show.ticket_price ?? null,
    capacity: show.capacity ?? null,
    capacity_bands: show.capacity_bands ?? null,
    booking_fee_per_payer: show.booking_fee_per_payer ?? null,
    cc_fee_pct: show.cc_fee_pct ?? null,
  }))
}

export function buildAdvancingFieldCopies(
  workspaceId: string,
  runId: string,
  fields: CostFieldCopySource[],
): AdvancingCostFieldCopy[] {
  return fields.map(field => ({
    workspace_id: workspaceId,
    run_id: runId,
    source_cost_field_id: field.id,
    show_id: field.show_id,
    category: field.category,
    field_key: field.field_key,
    label: field.label,
    value: field.value,
    state: field.state,
    source: field.source,
    line_items: Array.isArray(field.line_items) ? field.line_items as StaffLineItem[] : null,
    entries: Array.isArray(field.entries) ? field.entries as CostEntry[] : null,
  }))
}

export function mergeShowsWithAdvancingChrome<T extends ShowChromeSource>(
  shows: T[],
  chrome: AdvancingShowChrome[] | null | undefined,
): T[] {
  if (!chrome?.length) return shows
  const byShow = new Map(chrome.map(row => [row.show_id, row]))
  return shows.map(show => {
    const overlay = byShow.get(show.id)
    if (!overlay) return show
    return {
      ...show,
      ticket_price: overlay.ticket_price,
      capacity: overlay.capacity,
      capacity_bands: overlay.capacity_bands,
      booking_fee_per_payer: overlay.booking_fee_per_payer,
      cc_fee_pct: overlay.cc_fee_pct,
    }
  })
}

export function applyAdvancingChromePatch(
  chrome: AdvancingShowChrome[],
  showId: string,
  patch: Partial<Omit<AdvancingShowChrome, 'show_id'>>,
): AdvancingShowChrome[] {
  const next = chrome.map(row => row.show_id === showId ? { ...row, ...patch, show_id: row.show_id } : row)
  if (next.some(row => row.show_id === showId)) return next
  return [
    ...next,
    {
      show_id: showId,
      ticket_price: patch.ticket_price ?? null,
      capacity: patch.capacity ?? null,
      capacity_bands: patch.capacity_bands ?? null,
      booking_fee_per_payer: patch.booking_fee_per_payer ?? null,
      cc_fee_pct: patch.cc_fee_pct ?? null,
    },
  ]
}

export function formatRunAdvancingCopyAuditCopy(opts: {
  actorName: string
  runCode: string
  fieldCount: number
}): { fieldName: string; oldValue: string; newValue: string } {
  const actor = opts.actorName.trim() || 'Someone'
  return {
    fieldName: AUDIT_FIELD_RUN_ADVANCING_COPY,
    oldValue: 'no Advancing workspace',
    newValue: `${actor} copied the ${opts.runCode} cost sheet into Run Advancing (${opts.fieldCount} cost line${opts.fieldCount === 1 ? '' : 's'}). Working P&L chrome lives here.`,
  }
}

export function formatRunAdvancingArchiveAuditCopy(opts: {
  actorName: string
  runCode: string
}): { fieldName: string; oldValue: string; newValue: string } {
  const actor = opts.actorName.trim() || 'Someone'
  return {
    fieldName: AUDIT_FIELD_RUN_ADVANCING_ARCHIVE,
    oldValue: 'active Run Advancing workspace',
    newValue: `${actor} soft-archived the ${opts.runCode} Run Advancing workspace on UNBOOKED. Run Costings is editable again.`,
  }
}

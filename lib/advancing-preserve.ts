/**
 * Re-BOOK after Unconfirm: copy Costings → Advancing while preserving
 * Advancing-only payment chrome and Wave D hooks.
 *
 * Preserved from the existing Advancing twin:
 *   - entries[].paid / paid_at / paid_snapshot
 *   - entries[].invoice_amount (INVOICED chrome)
 *   - line_items paid / invoice_amount
 *   - paid travel money_entries (confirmation_id / night_date / receipt_kind)
 *   - Band Comps field_keys if present (Wave D UX is out of scope — do not wipe)
 *
 * Structure / amounts / new sub-lines come from Costings (exact twin).
 */

import { ADVANCING_NULL_SHOW_SENTINEL, advancingCopyLineKey } from './run-advancing.ts'
import type { CostEntry, StaffLineItem } from './cost-fields.ts'
import { INVOICED_FIELD_STATE } from './cost-fields.ts'

/** Wave D Band Comps — preserve-hook only. Do not wipe if present. */
export const BAND_COMPS_FIELD_KEYS = ['band_comps', 'comps', 'band_comp'] as const

export function isBandCompsFieldKey(fieldKey: string | null | undefined): boolean {
  const key = String(fieldKey ?? '').trim().toLowerCase()
  return (BAND_COMPS_FIELD_KEYS as readonly string[]).includes(key)
}

export type PreserveField = {
  show_id: string | null
  field_key: string
  state?: string | null
  value?: number | null
  source?: string | null
  label?: string | null
  category?: string | null
  entries?: CostEntry[] | null
  line_items?: StaffLineItem[] | null
}

function norm(s: string | null | undefined): string {
  return String(s ?? '').trim().toLowerCase()
}

function travelIdentity(entry: Pick<CostEntry, 'confirmation_id' | 'night_date' | 'receipt_kind'>): string | null {
  const conf = norm(entry.confirmation_id)
  const night = String(entry.night_date ?? '').trim()
  if (!conf && !night) return null
  return `${conf}|${night}|${entry.receipt_kind ?? ''}`
}

export function matchPreservedEntry(
  costing: CostEntry,
  advancing: CostEntry[],
  used: Set<string>,
): CostEntry | null {
  const byId = advancing.find(a => a.id && a.id === costing.id && !used.has(a.id))
  if (byId) {
    used.add(byId.id)
    return byId
  }
  const travel = travelIdentity(costing)
  if (travel) {
    const byTravel = advancing.find(a => !used.has(a.id) && travelIdentity(a) === travel)
    if (byTravel) {
      used.add(byTravel.id)
      return byTravel
    }
  }
  const desc = norm(costing.description)
  if (desc) {
    const byDesc = advancing.find(a => !used.has(a.id) && norm(a.description) === desc)
    if (byDesc) {
      used.add(byDesc.id)
      return byDesc
    }
  }
  return null
}

export function matchPreservedLineItem(
  costing: StaffLineItem,
  advancing: StaffLineItem[],
  used: Set<string>,
): StaffLineItem | null {
  const byId = advancing.find(a => a.id && a.id === costing.id && !used.has(a.id))
  if (byId) {
    used.add(byId.id)
    return byId
  }
  const role = norm(costing.role)
  if (role) {
    const byRole = advancing.find(a => !used.has(a.id) && norm(a.role) === role)
    if (byRole) {
      used.add(byRole.id)
      return byRole
    }
  }
  return null
}

function applyPaidChrome<T extends {
  paid?: boolean
  paid_at?: string | null
  paid_snapshot?: CostEntry['paid_snapshot']
  invoice_amount?: number | null
  confirmation_id?: string | null
  night_date?: string | null
  receipt_kind?: CostEntry['receipt_kind']
  city?: string | null
  vendor?: string | null
}>(costing: T, advancing: T | null): T {
  if (!advancing) return costing
  return {
    ...costing,
    paid: advancing.paid === true || costing.paid === true,
    paid_at: advancing.paid ? (advancing.paid_at ?? costing.paid_at ?? null) : (costing.paid_at ?? null),
    paid_snapshot: advancing.paid_snapshot ?? costing.paid_snapshot ?? null,
    invoice_amount: advancing.invoice_amount ?? costing.invoice_amount ?? null,
    ...(advancing.confirmation_id != null ? { confirmation_id: advancing.confirmation_id } : {}),
    ...(advancing.night_date != null ? { night_date: advancing.night_date } : {}),
    ...(advancing.receipt_kind != null ? { receipt_kind: advancing.receipt_kind } : {}),
    ...(advancing.city != null ? { city: advancing.city } : {}),
    ...(advancing.vendor != null ? { vendor: advancing.vendor } : {}),
  }
}

export function preservePaidEntries(
  costingEntries: CostEntry[] | null | undefined,
  advancingEntries: CostEntry[] | null | undefined,
): CostEntry[] {
  const costing = Array.isArray(costingEntries) ? costingEntries : []
  const advancing = Array.isArray(advancingEntries) ? advancingEntries : []
  const used = new Set<string>()
  const merged = costing.map(row => applyPaidChrome(row, matchPreservedEntry(row, advancing, used)))
  const leftoverPaid = advancing.filter(a =>
    !used.has(a.id) && (a.paid === true || travelIdentity(a) != null),
  )
  return [...merged, ...leftoverPaid]
}

export function preservePaidLineItems(
  costingItems: StaffLineItem[] | null | undefined,
  advancingItems: StaffLineItem[] | null | undefined,
): StaffLineItem[] | null {
  if (!Array.isArray(costingItems) && !Array.isArray(advancingItems)) return null
  const costing = Array.isArray(costingItems) ? costingItems : []
  const advancing = Array.isArray(advancingItems) ? advancingItems : []
  const used = new Set<string>()
  const merged = costing.map(row => applyPaidChrome(row, matchPreservedLineItem(row, advancing, used)))
  const leftoverPaid = advancing.filter(a => !used.has(a.id) && a.paid === true)
  return [...merged, ...leftoverPaid]
}

export function mergePreservedState(
  costingState: string | null | undefined,
  advancingState: string | null | undefined,
): string {
  if (advancingState === INVOICED_FIELD_STATE || costingState === INVOICED_FIELD_STATE) {
    return INVOICED_FIELD_STATE
  }
  return costingState ?? advancingState ?? 'guess'
}

export function mergeAdvancingFieldPreserve(
  costing: PreserveField,
  advancing: PreserveField | null | undefined,
): PreserveField {
  if (advancing && isBandCompsFieldKey(advancing.field_key)) {
    return advancing
  }
  if (!advancing) return costing
  return {
    ...costing,
    state: mergePreservedState(costing.state, advancing.state),
    entries: preservePaidEntries(costing.entries, advancing.entries),
    line_items: preservePaidLineItems(costing.line_items, advancing.line_items),
  }
}

export function indexFieldsByLineKey<T extends { show_id: string | null; field_key: string }>(
  fields: T[],
): Map<string, T> {
  const map = new Map<string, T>()
  for (const field of fields) {
    map.set(advancingCopyLineKey(field), field)
  }
  return map
}

/**
 * Costings copies win structure; existing Advancing wins PAID/INVOICED/comps.
 * Advancing-only Band Comps rows are appended so Wave D data is not wiped.
 */
export function mergeCostingCopiesPreservingAdvancing<T extends PreserveField>(
  costingCopies: T[],
  existingAdvancing: T[],
): T[] {
  const existing = indexFieldsByLineKey(existingAdvancing)
  const merged = costingCopies.map(copy => {
    const prior = existing.get(advancingCopyLineKey(copy))
    return mergeAdvancingFieldPreserve(copy, prior) as T
  })
  const seen = new Set(merged.map(row => advancingCopyLineKey(row)))
  for (const row of existingAdvancing) {
    if (isBandCompsFieldKey(row.field_key) && !seen.has(advancingCopyLineKey(row))) {
      merged.push(row)
    }
  }
  return merged
}

export function advancingLineKey(showId: string | null, fieldKey: string): string {
  return `${showId ?? ADVANCING_NULL_SHOW_SENTINEL}:${fieldKey}`
}

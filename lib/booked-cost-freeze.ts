/**
 * Phase 2 — BOOKED cost freeze on Run Costings.
 *
 * When a run booking status becomes BOOKED (`runs.status = confirmed`),
 * snapshot venue + run cost lines and make that sheet read-only.
 * Sell-through / revenue sliders stay scenario-capable (not part of this freeze).
 * Settlements Finalise is a separate lock and is not used here.
 */

import {
  buildCostingSnapshot,
  type CostFieldSnapshotSource,
  type CostingSnapshotField,
} from './settlements.ts'

/** DB booking status that the UI labels BOOKED. */
export const BOOKED_BOOKING_STATUS = 'confirmed'

export const BOOKED_COST_SNAPSHOT_KIND = 'booked_cost_freeze' as const
export const BOOKED_COST_SNAPSHOT_VERSION = 1 as const

export const AUDIT_FIELD_BOOKED_COST_FREEZE = 'BOOKED cost freeze'

export const BOOKED_COST_FREEZE_ERROR =
  'This run is BOOKED — the cost sheet is frozen. Confirm ticks, PAID, and line edits are locked. Sell-through / revenue sliders stay editable.'

export const BOOKED_COST_FREEZE_BANNER =
  'BOOKED — cost sheet frozen. Venue and run cost lines are read-only as decided at booking. Sell-through and revenue sliders stay scenario-capable.'

export const BOOKED_COST_FREEZE_BADGE = 'BOOKED · frozen'

export type BookedCostSnapshot = {
  kind: typeof BOOKED_COST_SNAPSHOT_KIND
  version: typeof BOOKED_COST_SNAPSHOT_VERSION
  captured_at: string
  run_id: string
  run_code: string
  booking_status: typeof BOOKED_BOOKING_STATUS
  field_count: number
  fields: CostingSnapshotField[]
}

export function isBookedBookingStatus(status: string | null | undefined): boolean {
  return String(status ?? '').trim().toLowerCase() === BOOKED_BOOKING_STATUS
}

/** Run Costings cost-line mutations are blocked while the run is BOOKED. */
export function isRunCostSheetFrozen(run: { status?: string | null } | null | undefined): boolean {
  return isBookedBookingStatus(run?.status)
}

export function shouldCaptureBookedCostSnapshot(opts: {
  nextStatus: string | null | undefined
  prevStatus?: string | null
  hasSnapshot?: boolean
}): boolean {
  if (!isBookedBookingStatus(opts.nextStatus)) return false
  const hasSnapshot = opts.hasSnapshot === true
  if (hasSnapshot && isBookedBookingStatus(opts.prevStatus)) return false
  if (!isBookedBookingStatus(opts.prevStatus)) return true
  return !hasSnapshot
}

export function costLineMutationBlockedReason(frozen: boolean): string | null {
  return frozen ? BOOKED_COST_FREEZE_ERROR : null
}

/** Cost-line write keys that the freeze gates. Sell-through is not included. */
export const FROZEN_COST_LINE_MUTATIONS = [
  'confirm_tick',
  'paid',
  'pencil',
  'section_payment',
  'entries',
  'line_items',
  'cost_field_state',
  'cost_field_create',
] as const

export const UNFROZEN_SCENARIO_FIELDS = ['sell_through_pct'] as const

export function isFrozenCostLineMutation(kind: string): boolean {
  return (FROZEN_COST_LINE_MUTATIONS as readonly string[]).includes(kind)
}

export function isSellThroughFrozenByBookedGate(): boolean {
  return false
}

export function snapshotIncludesSellThrough(snapshot: BookedCostSnapshot | null | undefined): boolean {
  if (!snapshot) return false
  return snapshot.fields.some(f => f.field_key === 'sell_through_pct')
}

export function buildBookedCostSnapshot(opts: {
  runId: string
  runCode: string
  capturedAt: string
  fields: CostFieldSnapshotSource[]
}): BookedCostSnapshot {
  const inner = buildCostingSnapshot({
    runId: opts.runId,
    runCode: opts.runCode,
    capturedAt: opts.capturedAt,
    fields: opts.fields,
  })
  return {
    kind: BOOKED_COST_SNAPSHOT_KIND,
    version: BOOKED_COST_SNAPSHOT_VERSION,
    captured_at: inner.captured_at,
    run_id: inner.run_id,
    run_code: inner.run_code,
    booking_status: BOOKED_BOOKING_STATUS,
    field_count: inner.field_count,
    fields: inner.fields,
  }
}

export function parseBookedCostSnapshot(raw: unknown): BookedCostSnapshot | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Partial<BookedCostSnapshot>
  if (row.kind !== BOOKED_COST_SNAPSHOT_KIND) return null
  if (row.version !== BOOKED_COST_SNAPSHOT_VERSION) return null
  if (!row.run_id || !row.captured_at || !Array.isArray(row.fields)) return null
  return raw as BookedCostSnapshot
}

export function hasBookedCostSnapshot(raw: unknown): boolean {
  return parseBookedCostSnapshot(raw) != null
}

export function formatBookedCostFreezeAuditCopy(opts: {
  actorName: string
  runCode: string
  fieldCount: number
}): { fieldName: string; oldValue: string; newValue: string } {
  const actor = opts.actorName.trim() || 'Someone'
  return {
    fieldName: AUDIT_FIELD_BOOKED_COST_FREEZE,
    oldValue: 'live Run Costing',
    newValue: `${actor} froze the Run Costing sheet for ${opts.runCode} at BOOKED (${opts.fieldCount} cost line${opts.fieldCount === 1 ? '' : 's'} snapshot). Sell-through stays editable.`,
  }
}

/**
 * Settlements W1.3 — shell types, snapshot, close-gate, terminology.
 *
 * HARD copy: Settlement = proposed payment (not cash).
 * Remittance (cash received) is W1.4 — see lib/remittance.ts.
 */

import {
  entriesSum,
  lineItemsSum,
  type CostEntry,
  type StaffLineItem,
} from './cost-fields.ts'

export const SETTLEMENTS_MODULE_LABEL = 'Settlements'
export const TOUR_DESK_MODULE_LABEL = 'Tour Desk'

/** Sidebar / page — proposed figure, never “cash received”. */
export const SETTLEMENT_PROPOSED_NOTE =
  'Settlement is a proposed payment from the agent statement — not cash received.'

export const REMITTANCE_STUB_LABEL = 'Remittance'
/** @deprecated W1.4 — Remittance is a real tab. Kept so old copy imports still typecheck. */
export const REMITTANCE_STUB_NOTE = 'Remittance is cash received — open the Remittance tab.'

export const FINALISE_CONTROL_LABEL = 'Finalise Costing'
export const FINALISE_LOCK_NOTE =
  'Finalise snapshots Run Costing and hard-locks this pane. Tour Desk costing stays live-editable. Early Finalise still locks.'

export const NUDGE_STUB_NOTE =
  'A ~24 hour nudge will remind the team to Finalise Costing. Cron is not wired yet — this is a display stub.'

export const AGENT_SETTLEMENT_EMPTY_NOTE =
  'No agent statement yet. The proposed payment (Settlement) will appear here when a statement is received. This is not remittance.'

export const BAND_COSTS_HELP =
  'Receipts and surprise costs (e.g. Uber) belong on the right only. They are not written back into the locked Run Costing snapshot.'

export const CLOSE_GATE_LABEL = 'Close-gate (display only)'
export const CLOSE_GATE_RULE = 'All band-cost lines must be PAID or waived before close.'

export const AUDIT_FIELD_FINALISE_COSTING = 'Finalise Costing'
export const AUDIT_FIELD_BAND_COST_ADDED = 'Band Cost added'
export const AUDIT_FIELD_BAND_COST_STATUS = 'Band Cost status'

export const SETTLEMENTS_SNAPSHOT_VERSION = 1 as const

export function canAccessSettlements(role: string | undefined | null): boolean {
  return role === 'admin' || role === 'owner'
}

export type CostingSnapshotField = {
  id: string
  run_id: string
  show_id: string | null
  category: string
  field_key: string
  label: string
  value: number | null
  state: string
  source: string | null
  entries: CostEntry[]
  line_items: StaffLineItem[]
}

export type CostingSnapshot = {
  version: typeof SETTLEMENTS_SNAPSHOT_VERSION
  captured_at: string
  run_id: string
  run_code: string
  field_count: number
  fields: CostingSnapshotField[]
}

export type CostFieldSnapshotSource = {
  id: string
  run_id: string
  show_id: string | null
  category: string
  field_key: string
  label: string
  value: number | null
  state: string
  source: string | null
  entries?: unknown
  line_items?: unknown
}

export type BandCostLine = {
  id: string
  run_id: string
  show_id: string | null
  description: string
  amount: number
  notes: string | null
  source: string | null
  paid: boolean
  waived: boolean
  paid_at: string | null
  created_by: string | null
  created_at: string
  attachment_path?: string | null
  attachment_filename?: string | null
  attachment_mime?: string | null
  quote_note?: string | null
  payables_document_id?: string | null
}

export type RunSettlementRow = {
  run_id: string
  costing_finalised_at: string | null
  costing_finalised_by: string | null
  costing_snapshot: CostingSnapshot | null
  nudge_due_at: string | null
  remittance_status?: 'open' | 'accepted' | 'rectify_awaiting'
  remittance_accepted_at?: string | null
  remittance_accepted_by?: string | null
}

export type CloseGateStatus = {
  ready: boolean
  total: number
  paid: number
  waived: number
  settled: number
  open: number
  summary: string
}

const NUDGE_MS = 24 * 60 * 60 * 1000

export function addHoursIso(iso: string, hours: number): string {
  return new Date(new Date(iso).getTime() + hours * 60 * 60 * 1000).toISOString()
}

/** Display stub: 24h after Finalise (early Finalise still sets this). */
export function nudgeDueFromFinalise(finalisedAt: string): string {
  return addHoursIso(finalisedAt, 24)
}

/** Pre-finalise hint: 24h after the last show date (Sydney calendar noon UTC). */
export function nudgeDueFromLastShow(lastShowDate: string | null | undefined): string | null {
  if (!lastShowDate) return null
  const m = String(lastShowDate).match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return null
  const noon = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12)
  return new Date(noon + NUDGE_MS).toISOString()
}

export function isCostingFinalised(row: Pick<RunSettlementRow, 'costing_finalised_at'> | null | undefined): boolean {
  return Boolean(row?.costing_finalised_at)
}

function asEntries(raw: unknown): CostEntry[] {
  return Array.isArray(raw) ? (raw as CostEntry[]) : []
}

function asLineItems(raw: unknown): StaffLineItem[] {
  return Array.isArray(raw) ? (raw as StaffLineItem[]) : []
}

export function snapshotFieldTotal(field: Pick<CostingSnapshotField, 'field_key' | 'value' | 'entries' | 'line_items'>): number {
  if (field.field_key === 'venue_staff' && field.line_items.length > 0) {
    return lineItemsSum(field.line_items)
  }
  if (field.entries.length > 0) return entriesSum(field.entries)
  return Number(field.value) || 0
}

export function buildCostingSnapshot(opts: {
  runId: string
  runCode: string
  capturedAt: string
  fields: CostFieldSnapshotSource[]
}): CostingSnapshot {
  const fields: CostingSnapshotField[] = opts.fields.map(f => ({
    id: f.id,
    run_id: f.run_id,
    show_id: f.show_id,
    category: f.category,
    field_key: f.field_key,
    label: f.label,
    value: f.value == null ? null : Number(f.value),
    state: f.state,
    source: f.source,
    entries: asEntries(f.entries),
    line_items: asLineItems(f.line_items),
  }))
  return {
    version: SETTLEMENTS_SNAPSHOT_VERSION,
    captured_at: opts.capturedAt,
    run_id: opts.runId,
    run_code: opts.runCode,
    field_count: fields.length,
    fields,
  }
}

export function parseCostingSnapshot(raw: unknown): CostingSnapshot | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Partial<CostingSnapshot>
  if (row.version !== SETTLEMENTS_SNAPSHOT_VERSION) return null
  if (!row.run_id || !row.captured_at || !Array.isArray(row.fields)) return null
  return raw as CostingSnapshot
}

export function fieldsForShow(
  fields: CostingSnapshotField[],
  showId: string | null | undefined,
): CostingSnapshotField[] {
  if (!showId) return fields
  return fields.filter(f => f.show_id === showId || f.show_id == null)
}

export function bandCostCloseGate(lines: Array<Pick<BandCostLine, 'paid' | 'waived'>>): CloseGateStatus {
  const total = lines.length
  const paid = lines.filter(l => l.paid && !l.waived).length
  const waived = lines.filter(l => l.waived).length
  const settled = lines.filter(l => l.paid || l.waived).length
  const open = total - settled
  const ready = open === 0
  let summary: string
  if (total === 0) {
    summary = 'No band-cost lines yet — close-gate is clear (nothing to pay or waive).'
  } else if (ready) {
    summary = `All ${total} band-cost line${total === 1 ? '' : 's'} PAID or waived.`
  } else {
    summary = `${open} of ${total} band-cost line${total === 1 ? '' : 's'} still open (must be PAID or waived).`
  }
  return { ready, total, paid, waived, settled, open, summary }
}

export function formatSettlementsMoney(value: number | null | undefined): string {
  const n = Number(value) || 0
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    maximumFractionDigits: 2,
  }).format(n)
}

export function formatFinaliseAuditCopy(opts: {
  actorName: string
  runCode: string
  fieldCount: number
  early: boolean
}): { fieldName: string; oldValue: string; newValue: string } {
  const actor = opts.actorName.trim() || 'Someone'
  const earlyBit = opts.early ? ' Early Finalise — snapshot still locked.' : ''
  return {
    fieldName: AUDIT_FIELD_FINALISE_COSTING,
    oldValue: 'live Run Costing',
    newValue: `${actor} finalised Run Costing for ${opts.runCode} (snapshot locked, ${opts.fieldCount} section${opts.fieldCount === 1 ? '' : 's'}).${earlyBit}`,
  }
}

export function formatBandCostAddedAuditCopy(opts: {
  actorName: string
  runCode: string
  description: string
  amount: number
  showLabel?: string | null
}): { fieldName: string; oldValue: string | null; newValue: string } {
  const actor = opts.actorName.trim() || 'Someone'
  const desc = (opts.description || 'a band cost').trim()
  const show = (opts.showLabel ?? '').trim()
  const where = show ? ` on ${show}` : ''
  return {
    fieldName: AUDIT_FIELD_BAND_COST_ADDED,
    oldValue: null,
    newValue: `${actor} added band cost ${desc} ${formatSettlementsMoney(opts.amount)}${where} (run ${opts.runCode}).`,
  }
}

export function formatBandCostStatusAuditCopy(opts: {
  actorName: string
  runCode: string
  description: string
  status: 'paid' | 'waived' | 'open'
}): { fieldName: string; oldValue: string; newValue: string } {
  const actor = opts.actorName.trim() || 'Someone'
  const desc = (opts.description || 'a band cost').trim()
  const verb =
    opts.status === 'paid' ? 'marked band cost as PAID'
      : opts.status === 'waived' ? 'waived band cost'
        : 'reopened band cost'
  return {
    fieldName: AUDIT_FIELD_BAND_COST_STATUS,
    oldValue: desc,
    newValue: `${actor} ${verb} ${desc} (run ${opts.runCode}).`,
  }
}

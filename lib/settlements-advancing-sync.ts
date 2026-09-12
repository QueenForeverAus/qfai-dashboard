/**
 * Advancing ↔ Settlements two-way sync (staging).
 *
 * Col2 Expected is a live read of advancing_cost_fields when a BOOKED run has
 * an active workspace — see resolveSettlementExpectedLive. This module is the
 * write side:
 *   • Settlements Actual known/PAID → Advancing (same advancing_cost_fields)
 *   • Tickets lock on Advancing once the show has completed and actual
 *     tickets_sold is known from the settlement sheet / email_scrape
 *   • Source notes required on those write paths
 *
 * HARD: never overwrite Settlements Actual with an Advancing estimate.
 * Actual wins Actual. Expected = Advancing until PAID.
 * One PAID truth — do not create a second PAID on Advancing when it is
 * already PAID; sync the Actual amount instead.
 * Never writes cost_fields. Never invents amounts.
 */

import {
  CONFIRMED_FIELD_STATE,
  allEntriesPaid,
  normalizeEntries,
  normalizeLineItems,
  sectionPayableLines,
  type CostEntry,
  type StaffLineItem,
} from './cost-fields.ts'
import { roundMoney } from './pnl-run-costing.ts'
import { showHasOccurred } from './settlements-sheet.ts'

export const SETTLEMENTS_SYNC_WRITES_COST_FIELDS = false as const
export const SETTLEMENTS_SYNC_OVERWRITES_ACTUAL = false as const

export const SOURCE_NOTE_REQUIRED =
  'Source note is required — never invent amounts. Note the settlement sheet, email scrape, or who confirmed.'

export const TICKETS_LOCKED_NOTE =
  'Tickets are locked on Advancing — show has completed and actual tickets sold are known from the settlement sheet / email scrape.'

export const TICKETS_LOCK_SOURCE_REQUIRED =
  'A source note is required to lock tickets from the settlement sheet or email scrape.'

export const NO_WORKSPACE_WRITEBACK_NOTE =
  'No active Run Advancing workspace — Col2 falls back to locked Run Costing. Write-back skipped (figures are not invented).'

export const NO_ADVANCING_FIELD_NOTE =
  'No matching advancing_cost_fields row — write-back skipped. Not inventing a cost line.'

export const NOT_SHARED_COST_LINE_NOTE =
  'Not a shared Advancing cost line — no write-back.'

export const AUDIT_FIELD_SETTLEMENTS_ADVANCING_SYNC = 'Settlements → Advancing sync'

/** Sheet / scrape sources that may lock Advancing tickets (SOP ticket-from-sheet). */
export const TICKET_LOCK_SOURCES = ['sheet', 'manual', 'email_scrape'] as const
export type TicketLockSource = (typeof TICKET_LOCK_SOURCES)[number]

export function normalizeSourceNote(raw: string | null | undefined): string {
  return String(raw ?? '').replace(/\s+/g, ' ').trim()
}

export function sourceNoteRequiredError(raw: string | null | undefined): string | null {
  return normalizeSourceNote(raw) ? null : SOURCE_NOTE_REQUIRED
}

export function pickSourceNote(...candidates: Array<string | null | undefined>): string {
  for (const candidate of candidates) {
    const note = normalizeSourceNote(candidate)
    if (note) return note
  }
  return ''
}

/**
 * Parent sheet keys that share advancing_cost_fields.
 * Child keys (`show:venue_marketing::edm`) do not overwrite the parent field.
 * Due to Hirer and AUTO CALC social ads are out of scope.
 */
export function sharedCostLineFromSheetKey(lineKey: string): {
  fieldKey: string
  scope: 'show' | 'run'
} | null {
  const key = String(lineKey ?? '').trim()
  if (!key || key.includes('::')) return null
  if (key.startsWith('show:')) {
    const fieldKey = key.slice(5)
    if (!fieldKey || fieldKey === 'due_to_hirer' || fieldKey === 'hire_deposit') return null
    return { fieldKey, scope: 'show' }
  }
  if (key.startsWith('run:')) {
    const fieldKey = key.slice(4)
    if (!fieldKey || fieldKey === 'social_ads_var') return null
    return { fieldKey, scope: 'run' }
  }
  return null
}

export function findAdvancingFieldForSheetKey<T extends {
  field_key: string
  show_id?: string | null
}>(
  fields: T[],
  lineKey: string,
  showId: string | null,
): T | undefined {
  const mapped = sharedCostLineFromSheetKey(lineKey)
  if (!mapped) return undefined
  const wantShow = mapped.scope === 'show' ? showId : null
  return fields.find(f => f.field_key === mapped.fieldKey && (f.show_id ?? null) === wantShow)
}

export type PaidWriteBackAction = 'none' | 'mark_known' | 'mark_paid' | 'sync_amount'

export type AdvancingFieldSnapshot = {
  id: string
  field_key: string
  show_id?: string | null
  label?: string | null
  value?: number | null
  state?: string | null
  source?: string | null
  entries?: unknown
  line_items?: unknown
}

export type PaidWriteBackPlan = {
  ok: boolean
  action: PaidWriteBackAction
  error: string | null
  writes_cost_fields: false
  overwrites_actual: false
  field_id: string | null
  field_key: string | null
  next_state: typeof CONFIRMED_FIELD_STATE | null
  next_value: number | null
  next_source: string | null
  next_entries: CostEntry[] | null
  next_line_items: StaffLineItem[] | null
  already_paid_on_advancing: boolean
  reason: string
}

function emptyPlan(reason: string, error: string | null = null): PaidWriteBackPlan {
  return {
    ok: error == null,
    action: 'none',
    error,
    writes_cost_fields: false,
    overwrites_actual: false,
    field_id: null,
    field_key: null,
    next_state: null,
    next_value: null,
    next_source: null,
    next_entries: null,
    next_line_items: null,
    already_paid_on_advancing: false,
    reason,
  }
}

function newEntryId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `e-sync-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function applyActualToEntries(opts: {
  existing: CostEntry[]
  amount: number
  sourceNote: string
  markPaid: boolean
  label: string
  now: string
}): CostEntry[] {
  const base = opts.existing[0]
  const paid = opts.markPaid
  return [{
    id: base?.id ?? newEntryId(),
    description: (base?.description || opts.label || 'Settlement actual').trim(),
    notes: opts.sourceNote,
    amount: opts.amount,
    gst_included: base?.gst_included ?? true,
    confirmed: true,
    paid,
    paid_at: paid ? (base?.paid_at ?? opts.now) : null,
    invoice_amount: base?.invoice_amount ?? null,
    attachment_path: base?.attachment_path ?? null,
    attachment_filename: base?.attachment_filename ?? null,
    attachment_mime: base?.attachment_mime ?? null,
    quote_note: base?.quote_note ?? null,
    payables_document_id: base?.payables_document_id ?? null,
  }]
}

function applyActualToLineItems(opts: {
  existing: StaffLineItem[]
  sourceNote: string
  markPaid: boolean
  now: string
}): StaffLineItem[] {
  return opts.existing.map(item => ({
    ...item,
    confirmed: true,
    paid: opts.markPaid ? true : Boolean(item.paid),
    paid_at: opts.markPaid
      ? (item.paid_at ?? opts.now)
      : (item.paid ? (item.paid_at ?? null) : null),
    source: opts.sourceNote,
  }))
}

/**
 * Settlements Actual known/PAID → Advancing write-back plan (pure).
 * Actual amount becomes Expected. Never copies Advancing onto Actual.
 */
export function planActualWriteBack(opts: {
  lineKey: string
  showId: string | null
  actualAmount: number
  markPaid: boolean
  sourceNote: string | null | undefined
  advancingWorkspaceActive: boolean
  advancingField?: AdvancingFieldSnapshot | null
  now?: string
}): PaidWriteBackPlan {
  const sourceErr = sourceNoteRequiredError(opts.sourceNote)
  if (sourceErr) return emptyPlan(sourceErr, sourceErr)

  const mapped = sharedCostLineFromSheetKey(opts.lineKey)
  if (!mapped) return emptyPlan(NOT_SHARED_COST_LINE_NOTE)

  if (!opts.advancingWorkspaceActive) {
    return emptyPlan(NO_WORKSPACE_WRITEBACK_NOTE)
  }

  const field = opts.advancingField
  if (!field) return emptyPlan(NO_ADVANCING_FIELD_NOTE)

  const amount = roundMoney(Math.abs(Number(opts.actualAmount) || 0))
  const sourceNote = normalizeSourceNote(opts.sourceNote)
  const now = opts.now ?? new Date().toISOString()
  const entries = normalizeEntries(field.entries) ?? []
  const lineItems = field.field_key === 'venue_staff'
    ? (normalizeLineItems(field.line_items) ?? [])
    : []
  const payable = sectionPayableLines(field.field_key, entries, lineItems)
  const alreadyPaid = allEntriesPaid(payable)
  const markPaid = opts.markPaid || alreadyPaid

  const nextEntries = applyActualToEntries({
    existing: entries,
    amount,
    sourceNote,
    markPaid,
    label: String(field.label ?? mapped.fieldKey),
    now,
  })
  const nextLineItems = field.field_key === 'venue_staff' && lineItems.length > 0
    ? applyActualToLineItems({ existing: lineItems, sourceNote, markPaid, now })
    : null

  const action: PaidWriteBackAction = alreadyPaid
    ? 'sync_amount'
    : opts.markPaid
      ? 'mark_paid'
      : 'mark_known'

  return {
    ok: true,
    action,
    error: null,
    writes_cost_fields: false,
    overwrites_actual: false,
    field_id: String(field.id),
    field_key: mapped.fieldKey,
    next_state: CONFIRMED_FIELD_STATE,
    next_value: amount,
    next_source: sourceNote,
    next_entries: nextEntries,
    next_line_items: nextLineItems,
    already_paid_on_advancing: alreadyPaid,
    reason: alreadyPaid
      ? 'Advancing already PAID — sync amount to Settlements Actual (one PAID truth). Actual wins.'
      : opts.markPaid
        ? 'Settlements Actual PAID → Advancing known + PAID.'
        : 'Settlements Actual known → Advancing known. Expected stays the Advancing live read.',
  }
}

/** Actual is never replaced by an Advancing estimate. */
export function actualWinsActual(opts: {
  actualAmount: number | null | undefined
  advancingEstimate: number | null | undefined
}): { actual: number | null; copied_from_advancing: false } {
  const n = opts.actualAmount
  const actual = n == null || !Number.isFinite(Number(n)) ? null : Number(n)
  return { actual, copied_from_advancing: false }
}

export function isTicketLockSource(source: string | null | undefined): boolean {
  const s = String(source ?? '').trim()
  return (TICKET_LOCK_SOURCES as readonly string[]).includes(s)
}

/**
 * Advancing tickets lock when the show has occurred AND actual tickets are
 * known from the settlement sheet (`manual` / `sheet`) or email_scrape.
 */
export function advancingTicketsLocked(opts: {
  showDate: string | null | undefined
  actualTickets: number | null | undefined
  source: string | null | undefined
  today?: string
}): boolean {
  if (!showHasOccurred(opts.showDate, opts.today)) return false
  if (opts.actualTickets == null || !Number.isFinite(Number(opts.actualTickets))) return false
  if (Number(opts.actualTickets) < 0) return false
  return isTicketLockSource(opts.source)
}

export type TicketLockRow = {
  locked: boolean
  tickets: number | null
  source: string | null
  sourceNote: string | null
}

export function ticketLockFromActuals(opts: {
  showId: string
  showDate: string | null | undefined
  ticketsSold?: number | null
  actuals: Array<{
    show_id?: string | null
    line_key: string
    amount: number
    source: string
    notes?: string | null
  }>
  today?: string
}): TicketLockRow {
  const row = opts.actuals.find(a => a.line_key === 'tickets_sold' && (a.show_id ?? null) === opts.showId)
  const tickets = row != null
    ? Math.round(Number(row.amount))
    : (opts.ticketsSold == null ? null : Math.round(Number(opts.ticketsSold)))
  const source = row?.source ?? null
  const sourceNote = normalizeSourceNote(row?.notes) || null
  return {
    locked: advancingTicketsLocked({
      showDate: opts.showDate,
      actualTickets: tickets,
      source,
      today: opts.today,
    }),
    tickets: tickets != null && Number.isFinite(tickets) ? tickets : null,
    source,
    sourceNote,
  }
}

export function formatSettlementsSyncAuditCopy(opts: {
  actorName: string
  runCode: string
  label: string
  action: PaidWriteBackAction
  amount: number
  sourceNote: string
}): { fieldName: string; oldValue: string | null; newValue: string } {
  const actor = opts.actorName.trim() || 'Someone'
  const verb = opts.action === 'mark_paid'
    ? 'wrote Settlements Actual PAID back to Advancing'
    : opts.action === 'sync_amount'
      ? 'synced Settlements Actual onto already-PAID Advancing'
      : 'wrote Settlements Actual known back to Advancing'
  return {
    fieldName: AUDIT_FIELD_SETTLEMENTS_ADVANCING_SYNC,
    oldValue: null,
    newValue:
      `${actor} ${verb} ${opts.label} `
      + `($${Number(opts.amount).toFixed(2)} · ${opts.sourceNote}) on ${opts.runCode}.`,
  }
}

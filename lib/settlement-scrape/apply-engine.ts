/**
 * Pure settlement / remittance email-scrape apply planner (staging).
 * Reads attachments, classifies lines, never auto-sends email.
 * Money / PAID never writes without the travel-scrape confirm pattern.
 */

import { isBookedBookingStatus } from '../booked-cost-freeze.ts'
import {
  classifySettlementLine,
  parentFieldKey,
  type V3RawLine,
} from '../settlements-v3-buckets.ts'
import { showHasOccurred } from '../settlements-sheet.ts'
import { isTravelScrapeMoneyConfirmed } from '../travel-scrape/apply-engine.ts'
import { formatDdMmYy } from '../receipts/dates.ts'
import {
  normalizeSourceNote,
  sourceNoteRequiredError,
} from '../settlements-advancing-sync.ts'
import { linesFromAttachments } from './attachments.ts'
import {
  parseSettlementScrapePacket,
  SETTLEMENT_SCRAPE_SCHEMA_VERSION,
  type SettlementScrapeKind,
  type SettlementScrapePacket,
} from './packet.ts'

export const SETTLEMENT_SCRAPE_APPLY_WRITES_COST_FIELDS = false as const
export const SETTLEMENT_SCRAPE_NEVER_SEND = true as const

export const AUDIT_FIELD_SETTLEMENT_SCRAPE_APPLY = 'Settlement email scrape apply'

export const SETTLEMENT_SCRAPE_PRODUCTION_ERROR =
  'Settlement email scrape is staging-only. Refusing apply_env=production.'

export const SETTLEMENT_SCRAPE_PRE_SHOW_ERROR =
  'Data not yet available — check back when the show has occurred.'

export const SETTLEMENT_SCRAPE_NO_SHOW_ERROR =
  'No occurred show on this run for settlement / remittance ingest.'

export const SETTLEMENT_SCRAPE_PROPOSED_ERROR =
  'Never ingest a settlement email on a proposed-only run. BOOK the run first.'

export const SETTLEMENT_SCRAPE_PAID_CONFIRM_NOTE =
  'Money / PAID is not written from scrape unless confirm_money=true or money_confirmed_by is set.'

export type PlannedActual = {
  line_key: string
  line_kind: 'venue_settlement'
  amount: number
  notes: string
  paid: false
}

export type PlannedRemittance = {
  description: string
  amount: number
  line_type: 'payment' | 'deduction' | 'adjustment'
  notes: string
  reference: string
}

export type SettlementScrapeApplyPlan = {
  ok: boolean
  error: string | null
  schema_version: typeof SETTLEMENT_SCRAPE_SCHEMA_VERSION
  kind: SettlementScrapeKind | null
  packet: SettlementScrapePacket | null
  lines: V3RawLine[]
  actuals: PlannedActual[]
  remittance: PlannedRemittance[]
  writes_paid: false
  writes_cost_fields: false
  sends_email: false
  money_action: 'none' | 'confirm_needed'
  money_reason: string
  source_note: string
}

export function settlementScrapeBlockedReason(opts: {
  applyEnv?: string | null
  bookingStatus?: string | null
  hasOccurredShow: boolean
}): string | null {
  const env = String(opts.applyEnv ?? 'staging').trim().toLowerCase()
  if (env === 'production') return SETTLEMENT_SCRAPE_PRODUCTION_ERROR
  const status = String(opts.bookingStatus ?? '').trim().toLowerCase()
  if (status === 'proposed') return SETTLEMENT_SCRAPE_PROPOSED_ERROR
  if (status && !isBookedBookingStatus(status) && status !== 'post_show' && status !== 'settled') {
    // SAMPLE / BOOKED confirmed is the normal path. post_show leftover is tolerated for ingest.
    if (status !== 'confirmed') return SETTLEMENT_SCRAPE_PROPOSED_ERROR
  }
  if (!opts.hasOccurredShow) return SETTLEMENT_SCRAPE_NO_SHOW_ERROR
  return null
}

/** Count vs $: never put attendance qty on gross_ticket_sales. */
export function settlementTicketActualKey(line: V3RawLine): 'tickets_sold' | 'gross_ticket_sales' | null {
  const classified = classifySettlementLine(line, 'venue_statement')
  if (classified.kind === 'ticket_count') return 'tickets_sold'
  if (classified.kind === 'tickets') return 'gross_ticket_sales'
  const key = parentFieldKey(line.lineKey)
  if (key === 'tickets_sold') return 'tickets_sold'
  if (key === 'gross_ticket_sales' || key === 'gross_box_office') return 'gross_ticket_sales'
  return null
}

export function unsignedScrapeAmount(value: number): number {
  return Math.abs(Number(value) || 0)
}

/** Rounded integer count from a planned tickets_sold Actual, or null when absent. */
export function plannedTicketsSoldCount(actuals: PlannedActual[]): number | null {
  const row = actuals.find(a => a.line_key === 'tickets_sold')
  if (!row) return null
  const n = Math.round(unsignedScrapeAmount(row.amount))
  return Number.isFinite(n) && n >= 0 ? n : null
}

export function formatSettlementScrapeSourceNote(packet: SettlementScrapePacket): string {
  const from = packet.email.from.trim() || 'settlement email'
  const dateIso = (packet.email.date || packet.captured_at).slice(0, 10)
  const date = /^\d{4}-\d{2}-\d{2}$/.test(dateIso) ? formatDdMmYy(dateIso) : dateIso
  const filename = packet.attachments[0]?.filename.trim() || 'attachment'
  return `from ${from} ${date} · ${filename}`
}

function plannedVenueActual(line_key: string, line: V3RawLine, sourceNote: string): PlannedActual {
  const notes = [line.description, sourceNote].filter(Boolean).join(' — ')
  return {
    line_key,
    line_kind: 'venue_settlement',
    amount: unsignedScrapeAmount(line.amount),
    notes,
    paid: false,
  }
}

export function lineKeyForClassified(
  line: V3RawLine,
  indexByParent: Map<string, number>,
  sourceNote = '',
): PlannedActual | null {
  const classified = classifySettlementLine(line, 'venue_statement')
  if (classified.kind === 'due_to_hirer') {
    return plannedVenueActual('show:due_to_hirer', line, sourceNote)
  }
  const ticketKey = settlementTicketActualKey(line)
  if (ticketKey) return plannedVenueActual(ticketKey, line, sourceNote)
  if (classified.kind === 'inside') {
    const n = (indexByParent.get('inside') ?? 0) + 1
    indexByParent.set('inside', n)
    return plannedVenueActual(`inside_pre_commission::${n}`, line, sourceNote)
  }
  if (classified.kind === 'deposit') {
    return plannedVenueActual('show:hire_deposit', line, sourceNote)
  }
  const parent =
    classified.kind === 'hire' ? 'show:venue_hire'
      : classified.kind === 'staff' ? 'show:venue_staff'
        : classified.kind === 'marketing' ? 'show:venue_marketing'
          : classified.kind === 'production' ? 'show:production_costs'
            : classified.kind === 'other' ? 'show:other'
              : null
  if (!parent) return null
  const n = (indexByParent.get(parent) ?? 0) + 1
  indexByParent.set(parent, n)
  const slug = line.description.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'line'
  const line_key = n === 1 && classified.kind !== 'marketing' && classified.kind !== 'other'
    ? parent
    : `${parent}::${slug}`
  return plannedVenueActual(line_key, line, sourceNote)
}

export function remittanceRowForLine(
  line: V3RawLine,
  reference: string,
  filename: string,
  sourceNote = '',
): PlannedRemittance {
  const classified = classifySettlementLine({
    ...line,
    lineType: line.lineType ?? (classifiedDeduction(line) ? 'deduction' : 'payment'),
  }, 'remittance')
  const line_type: PlannedRemittance['line_type'] =
    classified.kind === 'deductible' || line.lineType === 'deduction'
      ? 'deduction'
      : line.lineType === 'adjustment'
        ? 'adjustment'
        : 'payment'
  return {
    description: line.description,
    amount: line.amount,
    line_type,
    notes: [sourceNote, `email-scrape ${filename}`].filter(Boolean).join(' — '),
    reference,
  }
}

function classifiedDeduction(line: V3RawLine): boolean {
  return classifySettlementLine(line, 'remittance').kind === 'deductible'
}

export function planSettlementScrapeApply(opts: {
  packet: unknown
  bookingStatus?: string | null
  showDates: Array<string | null | undefined>
  applyEnv?: string | null
  confirmMoney?: boolean
  moneyConfirmedBy?: string | null
}): SettlementScrapeApplyPlan {
  const parsed = parseSettlementScrapePacket(opts.packet)
  const empty = (error: string, packet: SettlementScrapePacket | null = null): SettlementScrapeApplyPlan => ({
    ok: false,
    error,
    schema_version: SETTLEMENT_SCRAPE_SCHEMA_VERSION,
    kind: packet?.kind ?? null,
    packet,
    lines: [],
    actuals: [],
    remittance: [],
    writes_paid: false,
    writes_cost_fields: false,
    sends_email: false,
    money_action: 'none',
    money_reason: SETTLEMENT_SCRAPE_PAID_CONFIRM_NOTE,
    source_note: packet ? formatSettlementScrapeSourceNote(packet) : '',
  })
  if (!parsed.ok) return empty(parsed.error)

  const packet = parsed.packet
  const sourceNote = formatSettlementScrapeSourceNote(packet)
  const sourceErr = sourceNoteRequiredError(sourceNote)
  if (sourceErr) return empty(sourceErr, packet)

  const env = opts.applyEnv ?? packet.apply_env ?? 'staging'
  const hasOccurredShow = opts.showDates.some(d => showHasOccurred(d))
  const blocked = settlementScrapeBlockedReason({
    applyEnv: env,
    bookingStatus: opts.bookingStatus,
    hasOccurredShow,
  })
  if (blocked) return empty(blocked, packet)
  if (!hasOccurredShow) return empty(SETTLEMENT_SCRAPE_PRE_SHOW_ERROR, packet)

  const lines = linesFromAttachments(packet.attachments)
  if (lines.length === 0) {
    return empty('No statement lines could be read from the email attachments.', packet)
  }

  const moneyConfirmed = isTravelScrapeMoneyConfirmed({
    confirmMoney: opts.confirmMoney,
    moneyConfirmedBy: opts.moneyConfirmedBy,
  })
  const moneyAction: SettlementScrapeApplyPlan['money_action'] =
    packet.money_action === 'confirm' && !moneyConfirmed ? 'confirm_needed' : 'none'

  const indexByParent = new Map<string, number>()
  const actuals = packet.kind === 'settlement'
    ? lines.map(line => lineKeyForClassified(line, indexByParent, sourceNote)).filter((row): row is PlannedActual => row != null)
    : []
  const filename = packet.attachments[0]?.filename || 'attachment'
  const remittance = packet.kind === 'remittance'
    ? lines.map(line => remittanceRowForLine(line, packet.email.message_id, filename, sourceNote))
    : []

  return {
    ok: true,
    error: null,
    schema_version: SETTLEMENT_SCRAPE_SCHEMA_VERSION,
    kind: packet.kind,
    packet,
    lines,
    actuals,
    remittance,
    writes_paid: false,
    writes_cost_fields: false,
    sends_email: false,
    money_action: moneyAction,
    money_reason: moneyAction === 'confirm_needed'
      ? SETTLEMENT_SCRAPE_PAID_CONFIRM_NOTE
      : 'Scrape writes confirmed venue / remittance figures only. PAID stays false.',
    source_note: normalizeSourceNote(sourceNote),
  }
}

export function formatSettlementScrapeAuditCopy(opts: {
  actorName: string
  runCode: string
  kind: SettlementScrapeKind
  attachmentCount: number
  lineCount: number
}): { fieldName: string; oldValue: string | null; newValue: string } {
  const actor = opts.actorName.trim() || 'Someone'
  return {
    fieldName: AUDIT_FIELD_SETTLEMENT_SCRAPE_APPLY,
    oldValue: null,
    newValue:
      `${actor} applied settlement-scrape-packet-v1 (${opts.kind}) on ${opts.runCode} `
      + `(${opts.attachmentCount} attachment${opts.attachmentCount === 1 ? '' : 's'}, `
      + `${opts.lineCount} line${opts.lineCount === 1 ? '' : 's'}; not sent; PAID not auto).`,
  }
}

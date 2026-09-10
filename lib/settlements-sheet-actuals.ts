/**
 * Settlements Phase 4 — Col3 Actuals (staging).
 *
 * Venue settlement figures enter as confirmed and can be Challenged
 * (Wave 1 remittance draft, never auto-sent). Band costs copy from
 * Advancing / Run Costing and stay editable until PAID.
 */

import { CHALLENGE_NEVER_SEND_NOTE } from './remittance.ts'
import {
  type ComparisonRow,
  type VarianceFlag,
  type VarianceSeverity,
} from './remittance-variance.ts'
import {
  GST_QUARANTINE_KEY,
  computePnlSummary,
  gstQuarantineLineLabel,
  type KnownGstLine,
  roundMoney,
} from './pnl-run-costing.ts'
import { QUOTE_INVOICE_NOTE_LABEL } from './quote-invoice-stub.ts'
import {
  type SheetLine,
  type SheetLineGroup,
} from './settlements-sheet.ts'
import {
  groupActualsForExpected,
  sheetMatchToComparisonRow,
  type SheetMatchChild,
  type SheetMatchKind,
} from './settlements-sheet-match.ts'

export const COL3_ACTUALS_NOTE =
  'Venue settlement figures enter as confirmed. Challenge drafts a Harbour email (never auto-sent). Band costs copy from Advancing and stay editable until PAID. One Expected bucket can roll up many Actuals (EDM + banner + FB).'

export const VENUE_CONFIRMED_LABEL = 'Confirmed'
export const VENUE_CHALLENGED_LABEL = 'Challenged'
export const CHALLENGE_BUTTON_LABEL = 'Challenge'
export const SHEET_CHALLENGE_NEVER_SEND_NOTE = CHALLENGE_NEVER_SEND_NOTE
export const HARBOUR_FIXTURE_BUTTON_LABEL = 'Load Harbour fixture'
export const HARBOUR_FIXTURE_HELP =
  'Removed. Settlement and remittance figures ingest from email attachments — no manual paste or fixture loader.'
export const EMAIL_SCRAPE_INGEST_NOTE =
  'Venue settlement and remittance figures ingest from email attachments (staging). No manual paste. Money / PAID never auto without the same confirm pattern as travel scrape.'

export const SHEET_BAND_PAID_LOCK =
  'Paid line is locked — un-pay before editing amount, description, notes, or confirm'

export const SHEET_BAND_PAID_HELP =
  'Copied from Advancing / Run Costing. Editable until PAID — same lock as Wave 1 cost fields.'

export const AUDIT_FIELD_SHEET_ACTUAL = 'Sheet actual'
export const AUDIT_FIELD_SHEET_BAND_PAID = 'Sheet band cost PAID'
export const AUDIT_FIELD_SHEET_CHALLENGE = 'Sheet challenge draft created'

export const SETTLEMENT_ACTUAL_KINDS = ['venue_settlement', 'band_cost'] as const
export type SettlementActualKind = (typeof SETTLEMENT_ACTUAL_KINDS)[number]

export const SETTLEMENT_ACTUAL_STATUSES = ['confirmed', 'challenged'] as const
export type SettlementActualStatus = (typeof SETTLEMENT_ACTUAL_STATUSES)[number]

export const SETTLEMENT_ACTUAL_SOURCES = ['manual', 'harbour_fixture', 'advancing_copy', 'email_scrape'] as const
export type SettlementActualSource = (typeof SETTLEMENT_ACTUAL_SOURCES)[number]

export type SheetActualSource = SettlementActualSource | 'tickets_sold' | 'computed'

export type SheetLineActualKind = SettlementActualKind | 'derived'

export type SettlementActualLine = {
  id: string
  run_id: string
  show_id: string | null
  line_key: string
  line_kind: SettlementActualKind
  amount: number
  status: SettlementActualStatus
  source: SettlementActualSource
  notes: string | null
  challenge_id: string | null
  paid: boolean
  paid_at: string | null
  quote_note: string | null
  attachment_path: string | null
  attachment_filename: string | null
  attachment_mime: string | null
}

export type SheetActualDecor = {
  actual: number | null
  actualKind: SheetLineActualKind
  actualStatus: SettlementActualStatus | null
  actualSource: SheetActualSource | null
  actualPaid: boolean
  actualId: string | null
  challengeId: string | null
  quoteNote: string | null
  variance: number | null
  varianceSeverity: VarianceSeverity | null
  match?: SheetMatchKind | null
  matchConfidence?: number | null
  matchChildren?: SheetMatchChild[]
}

export type DecoratedSheetLine = SheetLine & SheetActualDecor

/** Harbour fixture keyed by venue name — no OCR. Staging smoke / manual ingest. */
export type HarbourFixtureLine = {
  line_key: string
  amount: number
  notes?: string
}

/** Harbour fixture keyed by venue — Phase 5 marketing is children under Venue Marketing. */
export const HARBOUR_FIXTURE_BY_VENUE: Record<string, HarbourFixtureLine[]> = {
  'Geelong Performing Arts Centre': [
    { line_key: 'tickets_sold', amount: 400 },
    { line_key: 'show:venue_hire', amount: 3100 },
    { line_key: 'show:venue_staff', amount: 4150 },
    { line_key: 'show:venue_marketing::edm', amount: 80, notes: 'EDM' },
    { line_key: 'show:venue_marketing::banner', amount: 100, notes: 'Banner' },
    { line_key: 'show:venue_marketing::fb', amount: 70, notes: 'FB' },
    { line_key: 'show:production_costs', amount: 0 },
  ],
  "Her Majesty's Theatre Ballarat": [
    { line_key: 'show:venue_hire', amount: 2900 },
    { line_key: 'show:venue_staff', amount: 3750 },
  ],
}

export function isSettlementActualKind(value: unknown): value is SettlementActualKind {
  return value === 'venue_settlement' || value === 'band_cost'
}

export function isSettlementActualStatus(value: unknown): value is SettlementActualStatus {
  return value === 'confirmed' || value === 'challenged'
}

export function actualLookupKey(showId: string | null | undefined, lineKey: string): string {
  return `${showId ?? 'run'}::${lineKey}`
}

export function indexActuals(rows: SettlementActualLine[]): Map<string, SettlementActualLine> {
  const index = new Map<string, SettlementActualLine>()
  for (const row of rows) {
    index.set(actualLookupKey(row.show_id, row.line_key), row)
  }
  return index
}

export function lineKindForGroup(group: SheetLineGroup): SheetLineActualKind | null {
  if (group === 'tickets' || group === 'revenue' || group === 'venue_costs') return 'venue_settlement'
  if (group === 'run_costs') return 'band_cost'
  if (group === 'pnl') return 'derived'
  return null
}

export function isVenueSettlementLine(line: Pick<SheetLine, 'group'>): boolean {
  return lineKindForGroup(line.group) === 'venue_settlement'
}

export function isBandCostLine(line: Pick<SheetLine, 'group'>): boolean {
  return lineKindForGroup(line.group) === 'band_cost'
}

export function canEditSheetBandActual(paid: boolean | null | undefined): boolean {
  return !paid
}

export function sheetBandPaidLockViolation(opts: {
  existingPaid: boolean
  nextPaid: boolean
  amountChanged: boolean
  quoteNoteChanged?: boolean
}): string | null {
  if (opts.existingPaid && opts.nextPaid && (opts.amountChanged || opts.quoteNoteChanged)) {
    return SHEET_BAND_PAID_LOCK
  }
  return null
}

export function findStoredActual(
  index: Map<string, SettlementActualLine>,
  showId: string | null | undefined,
  lineKey: string,
): SettlementActualLine | undefined {
  return index.get(actualLookupKey(showId, lineKey))
}

function moneyOrNull(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(Number(value))) return null
  return roundMoney(Number(value))
}

/** Cost columns stay ≥0. Sign lives on the row label, never as a mirrored amount. */
function unsignedCost(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(Number(value))) return null
  return roundMoney(Math.abs(Number(value)))
}

export function varianceOf(expected: number | null | undefined, actual: number | null | undefined): number | null {
  if (expected == null || actual == null) return null
  return roundMoney(Number(actual) - Number(expected))
}

/** True when Col3 has a real venue/statement figure — not a costing echo. */
export function isSettledVenueActual(line: Pick<DecoratedSheetLine, 'actual' | 'actualId' | 'actualSource' | 'group'>): boolean {
  if (line.actual == null) return false
  if (line.group === 'run_costs') return true
  if (line.actualId) return true
  return line.actualSource === 'email_scrape'
    || line.actualSource === 'harbour_fixture'
    || line.actualSource === 'manual'
    || line.actualSource === 'tickets_sold'
}

export function costVarianceOf(expected: number | null | undefined, actual: number | null | undefined): number | null {
  if (expected == null || actual == null) return null
  return roundMoney((unsignedCost(actual) ?? 0) - (unsignedCost(expected) ?? 0))
}

/** Exact-dollar flag reused from remittance thresholds. Count lines skip money flags. */
export function sheetVarianceFlag(opts: {
  expected: number | null
  actual: number | null
  kind: SheetLine['kind']
}): VarianceFlag | null {
  if (opts.kind === 'count') {
    if (opts.expected == null || opts.actual == null) return null
    if (opts.expected === opts.actual) return null
    return {
      code: 'count-mismatch',
      severity: 'soft',
      kind: 'exact',
      message: `Count drifted ${opts.actual - opts.expected} vs Expected (Advancing).`,
    }
  }
  return exactAbsFlag(opts.expected, opts.actual)
}

function exactAbsFlag(expected: number | null, actual: number | null): VarianceFlag | null {
  if (expected == null || actual == null) return null
  const delta = roundMoney(Math.abs(actual - expected))
  if (delta < 1) return null
  const signed = roundMoney(actual - expected)
  const sign = signed > 0 ? '+' : ''
  return {
    code: 'exact-dollar',
    severity: 'hard',
    kind: 'exact',
    message: `Exact $ field off by ${sign}${signed.toFixed(2)} (flag ≥ $1.00).`,
  }
}

function emptyDecor(kind: SheetLineActualKind | null): SheetActualDecor {
  return {
    actual: null,
    actualKind: kind ?? 'derived',
    actualStatus: null,
    actualSource: null,
    actualPaid: false,
    actualId: null,
    challengeId: null,
    quoteNote: null,
    variance: null,
    varianceSeverity: null,
    match: null,
    matchConfidence: null,
    matchChildren: [],
  }
}

const TICKET_SHEET_KEYS = new Set(['tickets_sold', 'gross_ticket_sales'])

/** SOP: Expected may mirror Actual for ticket lines when no separate Advancing forecast exists. */
export function ticketSheetExpected(
  line: Pick<SheetLine, 'key' | 'kind' | 'group' | 'expected'>,
  actual: number | null,
): number | null {
  const base = line.kind === 'count' || line.group === 'pnl' || line.group === 'revenue'
    ? (line.expected == null || !Number.isFinite(Number(line.expected)) ? null : Number(line.expected))
    : unsignedCost(line.expected)
  if (base != null) return line.kind === 'count' ? Math.round(base) : moneyOrNull(base)
  if (actual == null || !TICKET_SHEET_KEYS.has(line.key)) return null
  return actual
}

function fromStored(row: SettlementActualLine, line: SheetLine): SheetActualDecor {
  const raw = line.kind === 'count' ? Math.round(Number(row.amount) || 0) : moneyOrNull(row.amount)
  const actual = line.kind === 'count' || line.group === 'pnl' || line.group === 'revenue'
    ? raw
    : unsignedCost(raw)
  const expected = ticketSheetExpected(line, actual)
  const flag = sheetVarianceFlag({ expected, actual, kind: line.kind })
  return {
    actual,
    actualKind: row.line_kind,
    actualStatus: row.status,
    actualSource: row.source,
    actualPaid: Boolean(row.paid),
    actualId: row.id,
    challengeId: row.challenge_id,
    quoteNote: row.quote_note,
    variance: line.kind === 'count' || line.group === 'pnl' ? varianceOf(expected, actual) : costVarianceOf(expected, actual),
    varianceSeverity: flag?.severity ?? null,
    match: 'one',
    matchConfidence: 1,
    matchChildren: [],
  }
}

function decorateLine(
  line: SheetLine,
  stored: SettlementActualLine | undefined,
): DecoratedSheetLine {
  const kind = lineKindForGroup(line.group)
  if (kind === 'derived' || !kind) {
    return { ...line, ...emptyDecor('derived') }
  }
  if (stored) {
    const decor = fromStored(stored, line)
    return { ...line, expected: ticketSheetExpected(line, decor.actual), ...decor }
  }
  if (kind === 'band_cost') {
    const actual = line.expected
    const flag = sheetVarianceFlag({ expected: line.expected, actual, kind: line.kind })
    return {
      ...line,
      actual,
      actualKind: 'band_cost',
      actualStatus: actual == null ? null : 'confirmed',
      actualSource: actual == null ? null : 'advancing_copy',
      actualPaid: Boolean(line.expectedPaid),
      actualId: null,
      challengeId: null,
      quoteNote: null,
      variance: varianceOf(line.expected, actual),
      varianceSeverity: flag?.severity ?? null,
      match: 'one',
      matchConfidence: 1,
      matchChildren: [],
    }
  }
  // Venue costs with no stored actual stay empty (Actual —). Do not copy
  // Expected into Actual — that looks like duplicate Expected when ▶expanded
  // (BNZ VT package vs staff). Formula totals fall back to Expected in v3.
  // Venue settlement: tickets + computed revenue use the Col2 actual-ticket math
  // until a Harbour/manual override is stored.
  if (line.group === 'tickets' || line.group === 'revenue') {
    const actual = line.expected
    const flag = sheetVarianceFlag({ expected: line.expected, actual, kind: line.kind })
    return {
      ...line,
      actual,
      actualKind: 'venue_settlement',
      actualStatus: actual == null ? null : 'confirmed',
      actualSource: line.group === 'tickets' ? 'tickets_sold' : 'computed',
      actualPaid: false,
      actualId: null,
      challengeId: null,
      quoteNote: null,
      variance: varianceOf(line.expected, actual),
      varianceSeverity: flag?.severity ?? null,
      match: 'one',
      matchConfidence: 1,
      matchChildren: [],
    }
  }
  return { ...line, ...emptyDecor('venue_settlement') }
}

function sumGroupActual(lines: DecoratedSheetLine[], group: SheetLineGroup): number {
  return roundMoney(
    lines.filter(l => l.group === group).reduce((n, l) => n + (l.actual ?? 0), 0),
  )
}

function fillActualPnl(
  lines: DecoratedSheetLine[],
  opts?: { remittanceLines?: KnownGstLine[] | null; showId?: string | null },
): DecoratedSheetLine[] {
  const netRevenue = lines.find(l => l.key === 'net_revenue')?.actual ?? null
  const totalCosts = roundMoney(sumGroupActual(lines, 'venue_costs') + sumGroupActual(lines, 'run_costs'))
  const anyCost = lines.some(l => (l.group === 'venue_costs' || l.group === 'run_costs') && l.actual != null)
  const summary = netRevenue != null
    ? computePnlSummary({
        netRevenue,
        totalCosts,
        remittanceLines: opts?.remittanceLines,
        showId: opts?.showId,
      })
    : null

  return lines.map(line => {
    if (line.group !== 'pnl') return line
    const actual =
      line.key === 'total_costs' ? (summary ? summary.totalCosts : anyCost ? totalCosts : null)
        : line.key === 'net_profit' ? (summary?.netProfit ?? null)
          : line.key === GST_QUARANTINE_KEY ? (summary?.gstQuarantine ?? null)
            : line.key === 'reserve' ? (summary?.reserve ?? null)
              : line.key === 'pre_dist_margin' ? (summary?.preDistMargin ?? null)
                : null
    const label = line.key === GST_QUARANTINE_KEY
      ? gstQuarantineLineLabel(summary?.gstKnown ?? false)
      : line.label
    const note = line.key === GST_QUARANTINE_KEY ? summary?.gstSourceLabel : line.note
    return {
      ...line,
      label,
      note,
      actual,
      actualKind: 'derived' as const,
      actualStatus: actual == null ? null : 'confirmed',
      actualSource: actual == null ? null : 'computed',
      actualPaid: false,
      actualId: null,
      challengeId: null,
      quoteNote: null,
      variance: varianceOf(line.expected, actual),
      varianceSeverity: sheetVarianceFlag({ expected: line.expected, actual, kind: line.kind })?.severity ?? null,
    }
  })
}

export function applyCol3Actuals(opts: {
  lines: SheetLine[]
  actuals: SettlementActualLine[]
  showId: string | null
  remittanceLines?: KnownGstLine[] | null
}): DecoratedSheetLine[] {
  const index = indexActuals(opts.actuals)
  const claimed = new Set<string>()
  const decorated = opts.lines.map(line => {
    const base = decorateLine(line, findStoredActual(index, opts.showId, line.key))
    if (line.group !== 'venue_costs' && line.group !== 'run_costs') return base
    const grouped = groupActualsForExpected({
      expected: line,
      actuals: opts.actuals,
      showId: opts.showId,
      claimedIds: claimed,
    })
    if (grouped.match === 'unmatched') return base
    const groupedActual = line.kind === 'count' ? grouped.actual : unsignedCost(grouped.actual)
    const groupedExpected = line.kind === 'count' ? line.expected : unsignedCost(line.expected)
    const flag = sheetVarianceFlag({ expected: groupedExpected, actual: groupedActual, kind: line.kind })
    const anyChallenged = grouped.children.some(c => c.status === 'challenged')
    const allPaid = grouped.children.length > 0 && grouped.children.every(c => c.paid)
    const primary = opts.actuals.find(a => a.id === grouped.children[0]?.id)
    const actualStatus: DecoratedSheetLine['actualStatus'] = anyChallenged ? 'challenged' : 'confirmed'
    return {
      ...base,
      actual: groupedActual,
      actualStatus,
      actualSource: (primary?.source as DecoratedSheetLine['actualSource']) ?? base.actualSource,
      actualPaid: lineKindForGroup(line.group) === 'band_cost' ? allPaid : base.actualPaid,
      actualId: grouped.children.length === 1 ? grouped.children[0]!.id : null,
      challengeId: grouped.children.find(c => c.challengeId)?.challengeId ?? null,
      variance: line.kind === 'count' ? varianceOf(groupedExpected, groupedActual) : costVarianceOf(groupedExpected, groupedActual),
      varianceSeverity: flag?.severity ?? null,
      match: grouped.match,
      matchConfidence: grouped.confidence,
      matchChildren: grouped.children,
    }
  })
  return fillActualPnl(decorated, { remittanceLines: opts.remittanceLines, showId: opts.showId })
}

export function applyCol3ToRunSheet(opts: {
  sections: Array<{ show: { id: string }; lines: SheetLine[] }>
  runLines: SheetLine[]
  actuals: SettlementActualLine[]
  remittanceLines?: KnownGstLine[] | null
}): {
  sections: Array<{ lines: DecoratedSheetLine[] }>
  runLines: DecoratedSheetLine[]
  actualSummary: ReturnType<typeof computePnlSummary> | null
} {
  const sections = opts.sections.map(sec => ({
    lines: applyCol3Actuals({
      lines: sec.lines,
      actuals: opts.actuals,
      showId: sec.show.id,
      remittanceLines: opts.remittanceLines,
    }),
  }))
  const runLines = applyCol3Actuals({
    lines: opts.runLines,
    actuals: opts.actuals,
    showId: null,
    remittanceLines: opts.remittanceLines,
  })
  const netRevenue = sections.reduce((n, sec) => {
    const row = sec.lines.find(l => l.key === 'net_revenue')
    return n + (row?.actual ?? 0)
  }, 0)
  const venueCosts = sections.reduce((n, sec) => n + sumGroupActual(sec.lines, 'venue_costs'), 0)
  const runCosts = sumGroupActual(runLines, 'run_costs')
  const anyTickets = sections.some(sec => sec.lines.some(l => l.key === 'tickets_sold' && l.actual != null))
  const actualSummary = anyTickets
    ? computePnlSummary({
        netRevenue,
        totalCosts: roundMoney(venueCosts + runCosts),
        remittanceLines: opts.remittanceLines,
      })
    : null
  return { sections, runLines, actualSummary }
}

export function harbourFixtureLinesForVenue(venueName: string): HarbourFixtureLine[] {
  return HARBOUR_FIXTURE_BY_VENUE[venueName] ?? []
}

export function operatorChallengeFlag(): VarianceFlag {
  return {
    code: 'sheet-challenge',
    severity: 'soft',
    kind: 'exact',
    message: 'Operator challenged this confirmed venue settlement line.',
  }
}

export function sheetLineToComparisonRow(opts: {
  line: DecoratedSheetLine
  showId: string | null
}): ComparisonRow {
  return sheetMatchToComparisonRow({
    key: opts.line.key,
    label: opts.line.label,
    expected: opts.line.expected,
    actual: opts.line.actual,
    variance: opts.line.variance,
    actualStatus: opts.line.actualStatus,
    match: opts.line.match,
    matchConfidence: opts.line.matchConfidence,
    matchChildren: opts.line.matchChildren,
    showId: opts.showId,
  })
}

export function formatSheetActualAuditCopy(opts: {
  actorName: string
  runCode: string
  label: string
  amount: number
  source: SettlementActualSource
  showLabel?: string | null
}): { fieldName: string; oldValue: string | null; newValue: string } {
  const actor = opts.actorName.trim() || 'Someone'
  const where = (opts.showLabel ?? '').trim() ? ` on ${opts.showLabel!.trim()}` : ''
  const via = opts.source === 'harbour_fixture' ? ' from Harbour fixture' : opts.source === 'advancing_copy' ? ' (copied from Advancing)' : ''
  return {
    fieldName: AUDIT_FIELD_SHEET_ACTUAL,
    oldValue: null,
    newValue: `${actor} entered confirmed sheet actual ${opts.label} ${formatAud(opts.amount)}${via}${where} (run ${opts.runCode}).`,
  }
}

export function formatSheetBandPaidAuditCopy(opts: {
  actorName: string
  runCode: string
  label: string
  status: 'paid' | 'open'
}): { fieldName: string; oldValue: string; newValue: string } {
  const actor = opts.actorName.trim() || 'Someone'
  const verb = opts.status === 'paid' ? 'marked sheet band cost as PAID' : 'reopened sheet band cost'
  return {
    fieldName: AUDIT_FIELD_SHEET_BAND_PAID,
    oldValue: opts.label,
    newValue: `${actor} ${verb} ${opts.label} (run ${opts.runCode}).`,
  }
}

function formatAud(n: number): string {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(n)
}

export function quoteInvoiceStubLabel(): string {
  return QUOTE_INVOICE_NOTE_LABEL
}

/**
 * Settlements v3 — four locked sections (Gareth / Lead SoT).
 * Canonical design: docs/settlements-due-to-hirer-v3.md (LOCKED 2026-09-10).
 *
 * §1 Settlement (Due to Hirer) — venue proposes to pay Hirer. NO Harbour 10%.
 *    +tickets − insides − hire − staff − marketing − Venue Production/AV − other
 *    + hire deposit (skip when PDF already nets it).
 *
 * §2 Remittance (Due to QF) — agreed Due to Hirer
 *    − Harbour 10% of (ticket sales − classic insides)
 *    − rare deductibles (not LPA/EIS/APRA as insides).
 *
 * §3 Pre-Distribution Margin — remittance − band costs − GST quarantine
 *    − 20% reserve on the ex-GST residual. No invented GST rates.
 *
 * §4 Owner Distribution — Gareth 40 / Brad 30 / Scott 30 + existing distribute gate.
 *
 * Expected stays bound to Advancing. Data model may keep expected/actual under roll-ups.
 */

import {
  DEFINED_RUN_COST_FIELDS,
  VENUE_PRODUCTION_AV_LABEL,
  displayCostFieldLabel,
} from './cost-fields.ts'
import {
  GST_QUARANTINE_MISSING_NOTE,
  OWNER_SPLIT,
  PNL_RESERVE_RATE,
  computeHarbourCommission,
  computeOwnerSplits,
  gstQuarantineLineLabel,
  resolveKnownGst,
  roundMoney,
  type KnownGstLine,
  type OwnerSplits,
} from './pnl-run-costing.ts'
import type { CostingSnapshotField } from './settlements.ts'
import type { DecoratedSheetLine, SettlementActualLine } from './settlements-sheet-actuals.ts'
import type { RemittanceLine } from './remittance.ts'
import {
  bucketLabel,
  classifySettlementLine,
  classifySettlementLines,
  extractHireDepositFromText,
  pdfInsideKnown,
  printedDueToHirer,
  resolveDepositNetting,
  resolveStatementInside,
  sumBuckets,
  type DepositNetting,
  type V3ClassifiedLine,
  type V3InsideSource,
  type V3RawLine,
} from './settlements-v3-buckets.ts'

export const V3_HEADING = 'Settlements'
export const V3_SECTION1_TITLE = '§1 Settlement — Due to Hirer'
export const V3_SECTION2_TITLE = '§2 Remittance — Due to QF'
export const V3_SECTION3_TITLE = '§3 Pre-Distribution Margin'
export const V3_SECTION4_TITLE = '§4 Owner Distribution'

export const V3_SECTION1_NOTE =
  'Venue proposes to pay the Hirer. Harbour 10% is not deducted here. Hire deposit is added only when the statement has not already netted it.'
export const V3_SECTION2_NOTE =
  'Agreed Due to Hirer minus Harbour 10% of (ticket sales − classic insides) minus rare deductibles. LPA / EIS / APRA are not insides.'
export const V3_SECTION3_NOTE =
  'Remittance minus QF band costs (crew / travel / Production Bought In — not §1 venue lines), then GST quarantine (stored only), then 20% reserve on the ex-GST residual.'
export const V3_SECTION4_NOTE =
  'Gareth 40 / Brad 30 / Scott 30 of Pre-Distribution Margin. Distribute gate is unchanged — figure-accuracy Confirmed is not enough.'

export const V3_COL_LINE = 'Line'
export const V3_COL_EXPECTED = 'Expected'
export const V3_COL_ACTUAL = 'Actual'
export const V3_COL_DELTA = 'Δ'

export const V3_NO_HARBOUR_IN_S1 = true as const

export type V3SectionId = 1 | 2 | 3 | 4

export type V3ChildLine = {
  key: string
  label: string
  expected: number | null
  actual: number | null
  note?: string
  sheetLine?: DecoratedSheetLine
}

export type V3RollupRow = {
  key: string
  section: V3SectionId
  label: string
  sign: '+' | '−' | '='
  expected: number | null
  actual: number | null
  delta: number | null
  kind: 'count' | 'money'
  note?: string
  children: V3ChildLine[]
  highlight?: boolean
  /** Keep sheet-row testids for Harbour / hire / marketing roll-ups. */
  testId?: string
}

export type V3SideMath = {
  tickets: number | null
  insides: number | null
  insideSource: V3InsideSource
  insideLabel: string
  hire: number | null
  staff: number | null
  marketing: number | null
  production: number | null
  other: number | null
  deposit: number
  depositApplied: number
  depositNetted: boolean
  depositResidual: string | null
  dueToHirer: number | null
  harbourCommission: number | null
  deductibles: number
  dueToQf: number | null
  bandCosts: number | null
  gstQuarantine: number
  gstKnown: boolean
  gstSourceLabel: string
  reserve: number | null
  preDistMargin: number | null
  ownerSplits: OwnerSplits | null
}

export type V3ShowModel = {
  dueToHirerExpected: number | null
  dueToHirerActual: number | null
  dueToQfExpected: number | null
  dueToQfActual: number | null
  preDistExpected: number | null
  preDistActual: number | null
  ownerSplitsExpected: OwnerSplits | null
  ownerSplitsActual: OwnerSplits | null
  expected: V3SideMath
  actual: V3SideMath
  depositNetting: DepositNetting | null
  statementLines: V3ClassifiedLine[]
  section1: V3RollupRow[]
  section2: V3RollupRow[]
  section3: V3RollupRow[]
  section4: V3RollupRow[]
}

function money(n: number | null | undefined): number | null {
  if (n == null || !Number.isFinite(Number(n))) return null
  return roundMoney(Number(n))
}

function deltaOf(expected: number | null, actual: number | null): number | null {
  if (expected == null || actual == null) return null
  return roundMoney(actual - expected)
}

function lineAmount(lines: DecoratedSheetLine[], key: string, side: 'expected' | 'actual'): number | null {
  const row = lines.find(l => l.key === key)
  if (!row) return null
  return money(side === 'expected' ? row.expected : row.actual)
}

function groupAmount(lines: DecoratedSheetLine[], group: DecoratedSheetLine['group'], side: 'expected' | 'actual'): number {
  return roundMoney(
    lines
      .filter(l => l.group === group)
      .reduce((n, l) => n + (Number(side === 'expected' ? l.expected : l.actual) || 0), 0),
  )
}

export function computeDueToHirer(opts: {
  tickets: number | null
  insides: number | null
  hire: number
  staff: number
  marketing: number
  production: number
  other: number
  appliedDeposit: number
}): number | null {
  if (opts.tickets == null || opts.insides == null) return null
  return roundMoney(
    opts.tickets
    - opts.insides
    - opts.hire
    - opts.staff
    - opts.marketing
    - opts.production
    - opts.other
    + opts.appliedDeposit,
  )
}

export function computeDueToQf(opts: {
  dueToHirer: number | null
  ticketSales: number | null
  classicInsides: number | null
  deductibles?: number
}): { harbourCommission: number | null; dueToQf: number | null } {
  if (opts.dueToHirer == null || opts.ticketSales == null || opts.classicInsides == null) {
    return { harbourCommission: null, dueToQf: null }
  }
  const commissionable = roundMoney(opts.ticketSales - opts.classicInsides)
  const harbourCommission = computeHarbourCommission(commissionable)
  const dueToQf = roundMoney(opts.dueToHirer - harbourCommission - (opts.deductibles ?? 0))
  return { harbourCommission, dueToQf }
}

/**
 * Locked §3 order: remittance → band costs → GST quarantine → 20% ex-GST reserve.
 * GST amount is stored/known only — never a rate.
 */
export function computeV3Margin(opts: {
  remittance: number | null
  bandCosts: number
  gstQuarantine?: number
  gstKnown?: boolean
  gstSourceLabel?: string
}): Pick<V3SideMath, 'bandCosts' | 'gstQuarantine' | 'gstKnown' | 'gstSourceLabel' | 'reserve' | 'preDistMargin' | 'ownerSplits'> {
  const gstQuarantine = roundMoney(opts.gstQuarantine ?? 0)
  const gstKnown = opts.gstKnown === true
  const gstSourceLabel = opts.gstSourceLabel
    ?? (gstKnown ? 'known — remittance / settlement (not QF money)' : GST_QUARANTINE_MISSING_NOTE)
  if (opts.remittance == null) {
    return {
      bandCosts: money(opts.bandCosts),
      gstQuarantine,
      gstKnown,
      gstSourceLabel,
      reserve: null,
      preDistMargin: null,
      ownerSplits: null,
    }
  }
  const afterBand = roundMoney(opts.remittance - opts.bandCosts)
  const afterGst = roundMoney(afterBand - gstQuarantine)
  const reserve = roundMoney(Math.max(0, afterGst) * PNL_RESERVE_RATE)
  const preDistMargin = roundMoney(afterGst - reserve)
  return {
    bandCosts: roundMoney(opts.bandCosts),
    gstQuarantine,
    gstKnown,
    gstSourceLabel,
    reserve,
    preDistMargin,
    ownerSplits: computeOwnerSplits(preDistMargin),
  }
}

export function extractExpectedHireDeposit(fields: CostingSnapshotField[], showId: string): {
  amount: number
  note: string
} {
  const hire = fields.find(f => f.field_key === 'venue_hire' && (f.show_id ?? null) === showId)
  const blobs: string[] = []
  if (hire?.source) blobs.push(hire.source)
  for (const entry of hire?.entries ?? []) {
    blobs.push(`${entry.description} ${entry.notes}`)
    if (looksLikeDepositEntry(entry.description, entry.notes)) {
      const fromText = extractHireDepositFromText(`${entry.description} ${entry.notes}`)
      if (fromText != null) return { amount: fromText, note: 'Advancing hire-deposit line' }
      if (entry.amount > 0) return { amount: roundMoney(entry.amount), note: 'Advancing hire-deposit line' }
    }
  }
  for (const blob of blobs) {
    const fromText = extractHireDepositFromText(blob)
    if (fromText != null) return { amount: fromText, note: 'Advancing hire source mentions deposit' }
  }
  return { amount: 0, note: 'No hire deposit on Advancing' }
}

function looksLikeDepositEntry(description?: string | null, notes?: string | null): boolean {
  return /\b(deposit|bond)\b/i.test(`${description ?? ''} ${notes ?? ''}`)
}

export function statementLinesFromActuals(
  actuals: SettlementActualLine[],
  showId: string,
): V3RawLine[] {
  return actuals
    .filter(a => (a.show_id ?? null) === showId && a.line_kind === 'venue_settlement')
    .map(a => ({
      id: a.id,
      description: a.notes?.trim() || a.line_key,
      amount: Number(a.amount) || 0,
      notes: a.notes,
      lineKey: a.line_key,
    }))
}

export function remittanceDeductibles(
  lines: RemittanceLine[] | null | undefined,
  showId: string,
): { amount: number; children: V3ChildLine[] } {
  const matched = (lines ?? []).filter(l => {
    if ((l.show_id ?? null) !== showId && l.show_id != null) return false
    if (l.line_type !== 'deduction') return false
    const kind = classifySettlementLine({
      description: l.description,
      amount: Number(l.amount) || 0,
      lineType: l.line_type,
    }, 'remittance')
    return kind.kind === 'deductible' || l.line_type === 'deduction'
  })
  const amount = roundMoney(matched.reduce((n, l) => n + Math.abs(Number(l.amount) || 0), 0))
  return {
    amount,
    children: matched.map(l => ({
      key: `deduct:${l.id}`,
      label: l.description,
      expected: Math.abs(Number(l.amount) || 0),
      actual: Math.abs(Number(l.amount) || 0),
      note: 'Rare remittance deductible — not an inside',
    })),
  }
}

function childrenForBucket(
  lines: DecoratedSheetLine[],
  key: string,
): V3ChildLine[] {
  const row = lines.find(l => l.key === key)
  if (!row) return []
  if (row.matchChildren?.length) {
    return row.matchChildren.map(child => ({
      key: child.lineKey,
      label: child.label,
      expected: null,
      actual: child.amount,
      note: child.status === 'challenged' ? 'Challenged' : undefined,
      sheetLine: row,
    }))
  }
  return [{
    key: row.key,
    label: row.label,
    expected: row.expected,
    actual: row.actual,
    note: row.note,
    sheetLine: row,
  }]
}

function bandChildren(lines: DecoratedSheetLine[]): V3ChildLine[] {
  return lines
    .filter(l => l.group === 'run_costs')
    .map(l => ({
      key: l.key,
      label: displayCostFieldLabel(l.key.replace(/^run:/, ''), l.label),
      expected: l.expected,
      actual: l.actual,
      note: l.actualPaid ? 'PAID' : l.note,
      sheetLine: l,
    }))
}

function sideMath(opts: {
  tickets: number | null
  insides: number | null
  insideSource: V3InsideSource
  insideLabel: string
  hire: number
  staff: number
  marketing: number
  production: number
  other: number
  deposit: number
  appliedDeposit: number
  depositNetted: boolean
  depositResidual: string | null
  deductibles: number
  bandCosts: number
  gstQuarantine: number
  gstKnown: boolean
  gstSourceLabel: string
}): V3SideMath {
  const dueToHirer = computeDueToHirer({
    tickets: opts.tickets,
    insides: opts.insides,
    hire: opts.hire,
    staff: opts.staff,
    marketing: opts.marketing,
    production: opts.production,
    other: opts.other,
    appliedDeposit: opts.appliedDeposit,
  })
  const remit = computeDueToQf({
    dueToHirer,
    ticketSales: opts.tickets,
    classicInsides: opts.insides,
    deductibles: opts.deductibles,
  })
  const margin = computeV3Margin({
    remittance: remit.dueToQf,
    bandCosts: opts.bandCosts,
    gstQuarantine: opts.gstQuarantine,
    gstKnown: opts.gstKnown,
    gstSourceLabel: opts.gstSourceLabel,
  })
  return {
    tickets: money(opts.tickets),
    insides: money(opts.insides),
    insideSource: opts.insideSource,
    insideLabel: opts.insideLabel,
    hire: opts.hire,
    staff: opts.staff,
    marketing: opts.marketing,
    production: opts.production,
    other: opts.other,
    deposit: opts.deposit,
    depositApplied: opts.appliedDeposit,
    depositNetted: opts.depositNetted,
    depositResidual: opts.depositResidual,
    dueToHirer,
    harbourCommission: remit.harbourCommission,
    deductibles: opts.deductibles,
    dueToQf: remit.dueToQf,
    ...margin,
  }
}

function row(
  partial: Omit<V3RollupRow, 'delta'> & { delta?: number | null },
): V3RollupRow {
  return {
    ...partial,
    delta: partial.delta ?? deltaOf(partial.expected, partial.actual),
  }
}

export function buildV3ShowModel(opts: {
  showId: string
  lines: DecoratedSheetLine[]
  runLines?: DecoratedSheetLine[]
  fields: CostingSnapshotField[]
  actuals: SettlementActualLine[]
  remittanceLines?: RemittanceLine[] | null
  gstLines?: KnownGstLine[] | null
  statementLines?: V3RawLine[] | null
}): V3ShowModel {
  const lines = opts.lines
  const runLines = opts.runLines ?? lines.filter(l => l.group === 'run_costs')
  const classified = classifySettlementLines(
    opts.statementLines ?? statementLinesFromActuals(opts.actuals, opts.showId),
    'venue_statement',
  )
  const buckets = sumBuckets(classified)
  const expectedDeposit = extractExpectedHireDeposit(opts.fields, opts.showId)
  const deduct = remittanceDeductibles(opts.remittanceLines, opts.showId)
  const gst = resolveKnownGst({
    lines: opts.gstLines,
    showId: opts.showId,
  })

  const expectedTickets = lineAmount(lines, 'gross_ticket_sales', 'expected')
  const expectedInsides = lineAmount(lines, 'inside_pre_commission', 'expected')
  const expectedHire = lineAmount(lines, 'show:venue_hire', 'expected') ?? 0
  const expectedStaff = lineAmount(lines, 'show:venue_staff', 'expected') ?? 0
  const expectedMarketing = lineAmount(lines, 'show:venue_marketing', 'expected') ?? 0
  const expectedProduction = lineAmount(lines, 'show:production_costs', 'expected') ?? 0
  const expectedBand = groupAmount(runLines, 'run_costs', 'expected')

  const actualTicketsStored = lineAmount(lines, 'gross_ticket_sales', 'actual')
  const actualTickets = buckets.tickets > 0
    ? buckets.tickets
    : actualTicketsStored
  const statementInside = resolveStatementInside({
    lines: classified,
    estimatedInside: lineAmount(lines, 'inside_pre_commission', 'actual')
      ?? expectedInsides,
  })
  const actualHire = classified.some(l => l.kind === 'hire')
    ? buckets.hire
    : (lineAmount(lines, 'show:venue_hire', 'actual') ?? 0)
  const actualStaff = classified.some(l => l.kind === 'staff')
    ? buckets.staff
    : (lineAmount(lines, 'show:venue_staff', 'actual') ?? 0)
  const actualMarketing = classified.some(l => l.kind === 'marketing')
    ? buckets.marketing
    : (lineAmount(lines, 'show:venue_marketing', 'actual') ?? 0)
  const actualProduction = classified.some(l => l.kind === 'production')
    ? buckets.production
    : (lineAmount(lines, 'show:production_costs', 'actual') ?? 0)
  const actualOther = buckets.other
  const actualDeposit = buckets.deposit
  const actualBand = groupAmount(runLines, 'run_costs', 'actual')

  const ticketsForNetting = actualTickets ?? expectedTickets ?? 0
  const insidesForNetting = statementInside.amount ?? 0
  const netting = resolveDepositNetting({
    tickets: ticketsForNetting,
    insides: insidesForNetting,
    hire: actualHire,
    staff: actualStaff,
    marketing: actualMarketing,
    production: actualProduction,
    other: actualOther,
    deposit: actualDeposit,
    printedDueToHirer: printedDueToHirer(classified),
    depositLooksLikeCredit: classified.some(l => l.kind === 'deposit' && (
      Number(l.amount) < 0 || /\b(credit|already\s*paid|less\s*:)/i.test(`${l.description} ${l.notes ?? ''}`)
    )),
  })

  const expected = sideMath({
    tickets: expectedTickets,
    insides: expectedInsides,
    insideSource: (lines.find(l => l.key === 'inside_pre_commission')?.note ?? '').includes('known')
      ? 'known'
      : expectedInsides == null ? 'missing' : 'estimated',
    insideLabel: lines.find(l => l.key === 'inside_pre_commission')?.note
      ?? 'estimated — Factors',
    hire: expectedHire,
    staff: expectedStaff,
    marketing: expectedMarketing,
    production: expectedProduction,
    other: 0,
    deposit: expectedDeposit.amount,
    appliedDeposit: expectedDeposit.amount,
    depositNetted: false,
    depositResidual: expectedDeposit.note,
    deductibles: deduct.amount,
    bandCosts: expectedBand,
    gstQuarantine: gst.amount ?? 0,
    gstKnown: gst.source === 'known',
    gstSourceLabel: gst.sourceLabel,
  })

  const actualHasVenue = classified.length > 0
    || lines.some(l => l.group === 'venue_costs' && l.actual != null)
  const actual = sideMath({
    tickets: actualHasVenue ? (actualTickets ?? expectedTickets) : expectedTickets,
    insides: statementInside.amount,
    insideSource: statementInside.source,
    insideLabel: statementInside.sourceLabel,
    hire: actualHire,
    staff: actualStaff,
    marketing: actualMarketing,
    production: actualProduction,
    other: actualOther,
    deposit: actualDeposit,
    appliedDeposit: netting.appliedDeposit,
    depositNetted: netting.alreadyNetted,
    depositResidual: netting.residual,
    deductibles: deduct.amount,
    bandCosts: actualBand,
    gstQuarantine: gst.amount ?? 0,
    gstKnown: gst.source === 'known',
    gstSourceLabel: gst.sourceLabel,
  })

  const ticketsSold = lines.find(l => l.key === 'tickets_sold')

  const section1: V3RollupRow[] = [
    row({
      key: 'tickets_sold',
      section: 1,
      label: 'Tickets sold (actual count)',
      sign: '+',
      expected: ticketsSold?.expected ?? null,
      actual: ticketsSold?.actual ?? null,
      kind: 'count',
      note: ticketsSold?.note,
      children: ticketsSold ? [{
        key: 'tickets_sold',
        label: ticketsSold.label,
        expected: ticketsSold.expected,
        actual: ticketsSold.actual,
        note: ticketsSold.note,
        sheetLine: ticketsSold,
      }] : [],
      testId: 'sheet-row-tickets_sold',
    }),
    row({
      key: 'tickets',
      section: 1,
      label: '+ Ticket sales',
      sign: '+',
      expected: expected.tickets,
      actual: actual.tickets,
      kind: 'money',
      children: childrenForBucket(lines, 'gross_ticket_sales'),
      testId: 'sheet-row-gross_ticket_sales',
    }),
    row({
      key: 'inside',
      section: 1,
      label: '− Inside (pre-commission)',
      sign: '−',
      expected: expected.insides,
      actual: actual.insides,
      kind: 'money',
      note: actual.insideLabel,
      children: childrenForBucket(lines, 'inside_pre_commission'),
      testId: 'sheet-row-inside_pre_commission',
    }),
    row({
      key: 'hire',
      section: 1,
      label: '− Venue Hire',
      sign: '−',
      expected: expected.hire,
      actual: actual.hire,
      kind: 'money',
      children: childrenForBucket(lines, 'show:venue_hire'),
      testId: 'sheet-actual-show:venue_hire',
    }),
    row({
      key: 'staff',
      section: 1,
      label: '− Venue Staff',
      sign: '−',
      expected: expected.staff,
      actual: actual.staff,
      kind: 'money',
      children: childrenForBucket(lines, 'show:venue_staff'),
    }),
    row({
      key: 'marketing',
      section: 1,
      label: '− Venue Marketing',
      sign: '−',
      expected: expected.marketing,
      actual: actual.marketing,
      kind: 'money',
      children: childrenForBucket(lines, 'show:venue_marketing'),
      testId: 'sheet-rollup-show:venue_marketing',
    }),
    row({
      key: 'production',
      section: 1,
      label: `− ${VENUE_PRODUCTION_AV_LABEL}`,
      sign: '−',
      expected: expected.production,
      actual: actual.production,
      kind: 'money',
      children: childrenForBucket(lines, 'show:production_costs'),
    }),
    row({
      key: 'other',
      section: 1,
      label: '− Other venue charges',
      sign: '−',
      expected: expected.other,
      actual: actual.other,
      kind: 'money',
      note: actual.other ? 'LPA / EIS / APRA and unclassified venue lines — not insides' : undefined,
      children: classified.filter(l => l.kind === 'other').map(l => ({
        key: l.id ?? l.description,
        label: l.description,
        expected: null,
        actual: Math.abs(Number(l.amount) || 0),
      })),
    }),
    row({
      key: 'deposit',
      section: 1,
      label: actual.depositNetted && actual.depositApplied === 0
        ? '+ Hire deposit (already netted — not added)'
        : actual.depositNetted
          ? '+ Hire deposit (netted in Due to Hirer — once)'
          : '+ Hire deposit',
      sign: '+',
      expected: expected.deposit,
      actual: actual.depositApplied,
      kind: 'money',
      note: actual.depositResidual ?? expected.depositResidual ?? undefined,
      children: classified.filter(l => l.kind === 'deposit').map(l => ({
        key: l.id ?? 'deposit',
        label: l.description,
        expected: expected.deposit,
        actual: Math.abs(Number(l.amount) || 0),
        note: actual.depositNetted ? 'Already in printed Due to Hirer' : undefined,
      })),
    }),
    row({
      key: 'due_to_hirer',
      section: 1,
      label: 'Due to Hirer',
      sign: '=',
      expected: expected.dueToHirer,
      actual: actual.dueToHirer,
      kind: 'money',
      highlight: true,
      children: [],
      testId: 'v3-due-to-hirer',
    }),
  ]

  const section2: V3RollupRow[] = [
    row({
      key: 's2_due_to_hirer',
      section: 2,
      label: '+ Agreed Due to Hirer',
      sign: '+',
      expected: expected.dueToHirer,
      actual: actual.dueToHirer,
      kind: 'money',
      children: [],
    }),
    row({
      key: 'harbour_commission',
      section: 2,
      label: '− Harbour Agency (10% of sales − classic insides)',
      sign: '−',
      expected: expected.harbourCommission,
      actual: actual.harbourCommission,
      kind: 'money',
      note: 'Locked 10%. Not LPA / EIS / APRA.',
      children: childrenForBucket(lines, 'harbour_commission'),
      testId: 'sheet-row-harbour_commission',
    }),
    row({
      key: 'deductibles',
      section: 2,
      label: '− Rare deductibles',
      sign: '−',
      expected: expected.deductibles,
      actual: actual.deductibles,
      kind: 'money',
      children: deduct.children,
    }),
    row({
      key: 'due_to_qf',
      section: 2,
      label: 'Due to QF (remittance)',
      sign: '=',
      expected: expected.dueToQf,
      actual: actual.dueToQf,
      kind: 'money',
      highlight: true,
      children: [],
      testId: 'v3-due-to-qf',
    }),
  ]

  const section3: V3RollupRow[] = [
    row({
      key: 's3_remittance',
      section: 3,
      label: '+ Remittance (Due to QF)',
      sign: '+',
      expected: expected.dueToQf,
      actual: actual.dueToQf,
      kind: 'money',
      children: [],
    }),
    row({
      key: 'band_costs',
      section: 3,
      label: '− Band costs (QF payables)',
      sign: '−',
      expected: expected.bandCosts,
      actual: actual.bandCosts,
      kind: 'money',
      note: 'Crew / travel / Production Bought In — not §1 venue lines',
      children: bandChildren(runLines),
      testId: 'settlements-sheet-run-costs',
    }),
    row({
      key: 'gst_quarantine',
      section: 3,
      label: gstQuarantineLineLabel(actual.gstKnown),
      sign: '−',
      expected: expected.gstQuarantine,
      actual: actual.gstQuarantine,
      kind: 'money',
      note: actual.gstSourceLabel,
      children: [],
      testId: 'pnl-gst-quarantine',
    }),
    row({
      key: 'reserve',
      section: 3,
      label: '− 20% Reserve (ex-GST)',
      sign: '−',
      expected: expected.reserve,
      actual: actual.reserve,
      kind: 'money',
      children: [],
      testId: 'pnl-reserve-ex-gst',
    }),
    row({
      key: 'pre_dist_margin',
      section: 3,
      label: 'Pre-Distribution Margin',
      sign: '=',
      expected: expected.preDistMargin,
      actual: actual.preDistMargin,
      kind: 'money',
      highlight: true,
      children: [],
      testId: 'v3-pre-dist-margin',
    }),
  ]

  const section4: V3RollupRow[] = [
    row({
      key: 'owner_gareth',
      section: 4,
      label: `Gareth ${Math.round(OWNER_SPLIT.gareth * 100)}%`,
      sign: '=',
      expected: expected.ownerSplits?.gareth ?? null,
      actual: actual.ownerSplits?.gareth ?? null,
      kind: 'money',
      children: [],
      testId: 'v3-owner-gareth',
    }),
    row({
      key: 'owner_brad',
      section: 4,
      label: `Brad ${Math.round(OWNER_SPLIT.brad * 100)}%`,
      sign: '=',
      expected: expected.ownerSplits?.brad ?? null,
      actual: actual.ownerSplits?.brad ?? null,
      kind: 'money',
      children: [],
      testId: 'v3-owner-brad',
    }),
    row({
      key: 'owner_scott',
      section: 4,
      label: `Scott ${Math.round(OWNER_SPLIT.scott * 100)}%`,
      sign: '=',
      expected: expected.ownerSplits?.scott ?? null,
      actual: actual.ownerSplits?.scott ?? null,
      kind: 'money',
      children: [],
      testId: 'v3-owner-scott',
    }),
  ]

  return {
    dueToHirerExpected: expected.dueToHirer,
    dueToHirerActual: actual.dueToHirer,
    dueToQfExpected: expected.dueToQf,
    dueToQfActual: actual.dueToQf,
    preDistExpected: expected.preDistMargin,
    preDistActual: actual.preDistMargin,
    ownerSplitsExpected: expected.ownerSplits,
    ownerSplitsActual: actual.ownerSplits,
    expected,
    actual,
    depositNetting: netting,
    statementLines: classified,
    section1,
    section2,
    section3,
    section4,
  }
}

export function v3SectionMeta(id: V3SectionId): { title: string; note: string; testId: string } {
  if (id === 1) return { title: V3_SECTION1_TITLE, note: V3_SECTION1_NOTE, testId: 'settlements-v3-s1' }
  if (id === 2) return { title: V3_SECTION2_TITLE, note: V3_SECTION2_NOTE, testId: 'settlements-v3-s2' }
  if (id === 3) return { title: V3_SECTION3_TITLE, note: V3_SECTION3_NOTE, testId: 'settlements-v3-s3' }
  return { title: V3_SECTION4_TITLE, note: V3_SECTION4_NOTE, testId: 'settlements-v3-s4' }
}

export function v3HarbourLivesInSection1(): boolean {
  return !V3_NO_HARBOUR_IN_S1
}

export function definedBandCostKeys(): string[] {
  return DEFINED_RUN_COST_FIELDS.map(f => f.key)
}

export { bucketLabel, pdfInsideKnown }

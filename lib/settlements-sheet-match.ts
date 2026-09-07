/**
 * Settlements Phase 5 — smart match / roll-up.
 *
 * One Col2 Expected bucket (e.g. Venue Marketing) may map to many Col3
 * actuals (EDM, banner, FB). Reuses Wave 1 remittance token score, labour /
 * marketing buckets, and variance flags. Challenge drafts stay on the
 * rolled-up ComparisonRow (never auto-sent).
 */

import {
  classifyProposedKind,
  labelBucket,
  labelMatchScore,
  moneyAbs,
  labourHardDollarFloor,
  labourSoftDollarFloor,
  looksLikeApra,
  type ComparisonRow,
  type VarianceFlag,
} from './remittance-variance.ts'
import { computePnlSummary, roundMoney, type PnlSummary } from './pnl-run-costing.ts'
import type { SheetLine } from './settlements-sheet.ts'

/** Minimal Col3 row — avoids a cycle with settlements-sheet-actuals. */
export type MatchableActual = {
  id: string
  show_id: string | null
  line_key: string
  amount: number
  status: 'confirmed' | 'challenged'
  source?: string | null
  paid?: boolean
  challenge_id?: string | null
  notes?: string | null
  quote_note?: string | null
}

export const CHILD_KEY_SEP = '::'

export const ROLLUP_LABEL = 'Roll-up'
export const SMART_MATCH_NOTE =
  'One Expected bucket can match many Actuals (e.g. Venue Marketing ← EDM + banner + FB). Variance uses Wave 1 remittance rules.'

export type SheetMatchKind = 'one' | 'rollup' | 'unmatched'

export type SheetMatchChild = {
  id: string
  lineKey: string
  label: string
  amount: number
  status: MatchableActual['status']
  paid: boolean
  challengeId: string | null
}

export type SheetLineMatch = {
  parentKey: string
  match: SheetMatchKind
  children: SheetMatchChild[]
  actual: number | null
  confidence: number
}

export function parentLineKey(lineKey: string): string {
  const idx = lineKey.indexOf(CHILD_KEY_SEP)
  return idx === -1 ? lineKey : lineKey.slice(0, idx)
}

export function childDetailKey(lineKey: string): string | null {
  const idx = lineKey.indexOf(CHILD_KEY_SEP)
  return idx === -1 ? null : lineKey.slice(idx + CHILD_KEY_SEP.length)
}

export function childLineKey(parentKey: string, detail: string): string {
  const slug = detail.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
  return `${parentKey}${CHILD_KEY_SEP}${slug || 'line'}`
}

export function childDisplayLabel(row: Pick<MatchableActual, 'line_key' | 'notes' | 'quote_note'>): string {
  const fromNotes = (row.notes ?? '').trim()
  if (fromNotes) return fromNotes
  const fromQuote = (row.quote_note ?? '').trim()
  if (fromQuote) return fromQuote
  const detail = childDetailKey(row.line_key)
  if (!detail) return row.line_key
  return detail.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

export function isChildOf(lineKey: string, parentKey: string): boolean {
  return lineKey === parentKey || lineKey.startsWith(`${parentKey}${CHILD_KEY_SEP}`)
}

function expectedBucket(line: Pick<SheetLine, 'key' | 'label'>): ReturnType<typeof labelBucket> {
  if (line.key === 'show:venue_marketing' || /marketing/i.test(line.label)) return 'marketing'
  if (line.key === 'show:venue_staff') return labelBucket(line.label) ?? 'tech'
  return labelBucket(line.label)
}

function actualBucket(label: string, lineKey: string): ReturnType<typeof labelBucket> {
  if (parentLineKey(lineKey) === 'show:venue_marketing') return 'marketing'
  return labelBucket(label)
}

function scoreActualToExpected(opts: {
  expected: Pick<SheetLine, 'key' | 'label'>
  actualKey: string
  actualLabel: string
}): number {
  if (opts.actualKey === opts.expected.key) return 1
  if (isChildOf(opts.actualKey, opts.expected.key)) return 0.96
  const parent = parentLineKey(opts.actualKey)
  if (parent === opts.expected.key) return 0.94

  const expBucket = expectedBucket(opts.expected)
  const actBucket = actualBucket(opts.actualLabel, opts.actualKey)
  if (expBucket && actBucket && expBucket === actBucket) {
    return Math.max(0.78, labelMatchScore(opts.expected.label, opts.actualLabel))
  }

  if (actBucket === 'marketing' && (opts.expected.key === 'show:venue_marketing' || /marketing/i.test(opts.expected.label))) {
    return 0.86
  }
  if (opts.expected.key === 'show:venue_staff' && (actBucket === 'usher' || actBucket === 'security' || actBucket === 'tech')) {
    return 0.84
  }
  if (opts.expected.key === 'show:production_costs' && /production|av|audio|lighting/i.test(opts.actualLabel)) {
    return 0.84
  }

  const token = labelMatchScore(opts.expected.label, opts.actualLabel)
  return token
}

const MATCH_FLOOR = 0.3

export function groupActualsForExpected(opts: {
  expected: Pick<SheetLine, 'key' | 'label'>
  actuals: MatchableActual[]
  showId: string | null
  claimedIds?: Set<string>
}): SheetLineMatch {
  const claimed = opts.claimedIds ?? new Set<string>()
  const scoped = opts.actuals.filter(row => (row.show_id ?? null) === opts.showId && !claimed.has(row.id))

  const exact = scoped.filter(row => row.line_key === opts.expected.key)
  const children = scoped.filter(row => row.line_key !== opts.expected.key && isChildOf(row.line_key, opts.expected.key))

  let picked: MatchableActual[] = children.length > 0 ? children : exact

  if (picked.length === 0) {
    const scored = scoped
      .map(row => ({
        row,
        score: scoreActualToExpected({
          expected: opts.expected,
          actualKey: row.line_key,
          actualLabel: childDisplayLabel(row),
        }),
      }))
      .filter(x => x.score >= MATCH_FLOOR)
      .sort((a, b) => b.score - a.score)
    if (scored.length > 0 && (expectedBucket(opts.expected) || scored[0]!.score >= 0.78)) {
      const bucket = expectedBucket(opts.expected)
      picked = scored
        .filter(x => !bucket || actualBucket(childDisplayLabel(x.row), x.row.line_key) === bucket || x.score >= 0.9)
        .map(x => x.row)
    }
  }

  for (const row of picked) claimed.add(row.id)

  const childrenOut: SheetMatchChild[] = picked.map(row => ({
    id: row.id,
    lineKey: row.line_key,
    label: childDisplayLabel(row),
    amount: roundMoney(Number(row.amount) || 0),
    status: row.status,
    paid: Boolean(row.paid),
    challengeId: row.challenge_id ?? null,
  }))

  if (childrenOut.length === 0) {
    return { parentKey: opts.expected.key, match: 'unmatched', children: [], actual: null, confidence: 0 }
  }

  const actual = roundMoney(childrenOut.reduce((n, c) => n + c.amount, 0))
  const match: SheetMatchKind = childrenOut.length >= 2 ? 'rollup' : 'one'
  const confidence = match === 'rollup' ? 0.78 : 0.95
  return { parentKey: opts.expected.key, match, children: childrenOut, actual, confidence }
}

export function rollupVarianceFlags(opts: {
  expected: number | null
  actual: number | null
  label: string
  fieldKey?: string | null
}): VarianceFlag[] {
  if (opts.expected == null || opts.actual == null) return []
  const kind = classifyProposedKind({ fieldKey: opts.fieldKey, label: opts.label })
  const delta = moneyAbs(opts.expected, opts.actual)
  if (kind === 'labour') {
    const hard = labourHardDollarFloor(opts.expected)
    const soft = labourSoftDollarFloor(opts.expected)
    if (delta >= hard) {
      return [{
        code: 'labour-dollar-hard',
        severity: 'hard',
        kind: 'labour',
        message: `Labour $ drift on roll-up — hard (≥ ${hard.toFixed(2)}).`,
      }]
    }
    if (delta >= soft) {
      return [{
        code: 'labour-dollar-soft',
        severity: 'soft',
        kind: 'labour',
        message: `Labour $ near-miss on roll-up — soft (≥ ${soft.toFixed(2)}).`,
      }]
    }
    return []
  }
  if (delta < 1) return []
  const signed = roundMoney(opts.actual - opts.expected)
  const sign = signed > 0 ? '+' : ''
  const exact: VarianceFlag = {
    code: 'exact-dollar',
    severity: 'hard',
    kind: looksLikeApra(opts.label) ? 'apra' : 'exact',
    message: `Exact $ field off by ${sign}${signed.toFixed(2)} (flag ≥ $1.00).`,
  }
  return [exact]
}

export function sheetMatchToComparisonRow(opts: {
  key: string
  label: string
  expected: number | null
  actual: number | null
  variance: number | null
  actualStatus?: 'confirmed' | 'challenged' | null
  match?: SheetMatchKind | null
  matchConfidence?: number | null
  matchChildren?: SheetMatchChild[]
  showId: string | null
}): ComparisonRow {
  const children = opts.matchChildren ?? []
  const flags = rollupVarianceFlags({
    expected: opts.expected,
    actual: opts.actual,
    label: opts.label,
    fieldKey: parentLineKey(opts.key).replace(/^(show|run):/, ''),
  })
  if (opts.actualStatus === 'challenged' && !flags.some(f => f.code === 'sheet-challenge')) {
    flags.push({
      code: 'sheet-challenge',
      severity: 'soft',
      kind: 'exact',
      message: 'Operator challenged this confirmed venue settlement line.',
    })
  }
  return {
    id: `sheet:${opts.showId ?? 'run'}:${opts.key}`,
    show_id: opts.showId,
    label: opts.label,
    proposed: opts.expected,
    paid: opts.actual,
    variance: opts.variance,
    proposedHours: null,
    paidHours: null,
    proposedRate: null,
    paidRate: null,
    confidence: opts.matchConfidence ?? (children.length >= 2 ? 0.78 : 1),
    match: children.length >= 2 || opts.match === 'rollup' ? 'rollup' : 'one',
    fedBy: children.length
      ? children.map(c => ({ id: c.id, label: c.label, amount: c.amount, source: 'agent_settlement' as const }))
      : [{
          id: opts.key,
          label: 'Expected (Advancing)',
          amount: opts.expected ?? 0,
          source: 'snapshot',
        }],
    remittanceLineIds: [],
    flags,
    lineType: 'payment',
  }
}

export type DualPnlFooter = {
  expectedLabel: string
  actualLabel: string
  expected: PnlSummary | null
  actual: PnlSummary | null
}

export const EXPECTED_PNL_LABEL = 'Expected P&L (Col2)'
export const ACTUAL_PNL_LABEL = 'Actual / true P&L (Col3)'

export function buildDualPnlFooters(opts: {
  expected: PnlSummary | null
  actual: PnlSummary | null
}): DualPnlFooter {
  return {
    expectedLabel: EXPECTED_PNL_LABEL,
    actualLabel: ACTUAL_PNL_LABEL,
    expected: opts.expected,
    actual: opts.actual,
  }
}

export function pnlFromSheetSides(opts: {
  netRevenueExpected: number | null
  netRevenueActual: number | null
  totalCostsExpected: number | null
  totalCostsActual: number | null
}): DualPnlFooter {
  const expected = opts.netRevenueExpected != null && opts.totalCostsExpected != null
    ? computePnlSummary({ netRevenue: opts.netRevenueExpected, totalCosts: opts.totalCostsExpected })
    : null
  const actual = opts.netRevenueActual != null && opts.totalCostsActual != null
    ? computePnlSummary({ netRevenue: opts.netRevenueActual, totalCosts: opts.totalCostsActual })
    : null
  return buildDualPnlFooters({ expected, actual })
}

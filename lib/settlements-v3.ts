/**
 * Settlements v3 — four locked sections (Gareth / Lead SoT).
 * Canonical design: docs/settlements-due-to-hirer-v3.md (LOCKED 2026-09-10).
 *
 * Multi-show HARD lock (Gareth 2026-09-10): one settlement **route** per run.
 * Venue tabs live inside that page. Never a combined Due to Hirer for two venues.
 *
 * §1 Settlement (Due to Hirer) — **per venue**. Full line list + own Due to Hirer total.
 *    +tickets − insides − hire − staff − marketing − Venue Production/AV − other
 *    + hire deposit (skip when that venue PDF already nets it). NO Harbour 10%.
 *
 * §2 Remittance (Due to QF) — **per venue** (same tabs). Harbour remits per venue cycle.
 *    − Harbour 10% of (ticket sales − classic insides)
 *    − rare deductibles (not LPA/EIS/APRA as insides).
 *
 * §3 Advancing Costs / Pre-Distribution Margin — **once per run** (sum of venue remittances
 *    − run band costs − GST quarantine − 20% ex-GST reserve). Never duplicated per show.
 *
 * §4 Owner Distribution — **once at run**, after venue remittances.
 *    Gareth 40 / Brad 30 / Scott 30 + existing distribute gate.
 *
 * Costs ≥0 Expected/Actual. Δ = Actual − Expected. No ± twins.
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
import { isSettledVenueActual } from './settlements-sheet-actuals.ts'
import type { RemittanceLine } from './remittance.ts'
import {
  bucketLabel,
  classifySettlementLine,
  classifySettlementLines,
  extractHireDepositFromText,
  pdfInsideKnown,
  parentFieldKey,
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
export const ADVANCING_COSTS_LABEL = 'Advancing Costs'
export const V3_SECTION4_TITLE = '§4 Owner Distribution'

export const V3_SECTION1_NOTE =
  'This venue’s own settlement cycle. Harbour 10% is not deducted here. Hire deposit is added only when this venue’s statement has not already netted it. Each venue has its own Due to Hirer total — never a combined figure for the run.'
export const V3_SECTION2_NOTE =
  'Harbour remits this venue’s settlement: agreed Due to Hirer minus Harbour 10% of (ticket sales − classic insides) minus rare deductibles. LPA / EIS / APRA are not insides.'
export const V3_SECTION3_NOTE =
  'Advancing Costs once per run (live from Advancing — PAID / confirmed / AUTO CALC). Sum of venue remittances minus those QF payables, then GST quarantine (stored only), then 20% reserve on the ex-GST residual. No Expected | Actual | Δ chrome here.'
export const V3_SECTION4_NOTE =
  'Gareth 40 / Brad 30 / Scott 30 of the run Pre-Distribution Margin after venue remittances. Distribute gate is unchanged — figure-accuracy Confirmed is not enough.'

/** HARD product lock: §1/§2 are venue cycles; §3/§4 are run-level once. */
export const V3_VENUE_CYCLE_SECTIONS = [1, 2] as const
export const V3_RUN_ONCE_SECTIONS = [3, 4] as const

export const V3_COL_LINE = 'Line'
export const V3_COL_EXPECTED = 'Expected'
export const V3_COL_ACTUAL = 'Actual'
export const V3_COL_DELTA = 'Δ'

export const V3_NO_HARBOUR_IN_S1 = true as const

export type V3SectionId = 1 | 2 | 3 | 4

export type V3SettlementGrain = 'show' | 'run'

export type V3ChildLine = {
  key: string
  label: string
  expected: number | null
  actual: number | null
  note?: string
  sheetLine?: DecoratedSheetLine
  showId?: string | null
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

export type V3VenueCycle = {
  show: { id: string; venue_name: string; venue_city?: string | null }
  model: V3ShowModel
}

/**
 * One settlement per run. §1/§2 live on `venues` (each venue is its own cycle).
 * `section3` / `section4` are run-level once. There is no combined Due to Hirer.
 */
export type V3RunModel = {
  venues: V3VenueCycle[]
  section3: V3RollupRow[]
  section4: V3RollupRow[]
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
}

export function isV3RunModel(model: V3ShowModel | V3RunModel): model is V3RunModel {
  return Array.isArray((model as V3RunModel).venues)
}

/** Sum only when every venue has a figure — never invent a partial run total. */
export function sumAllOrNull(values: Array<number | null | undefined>): number | null {
  if (values.length === 0) return null
  if (values.some(v => v == null || !Number.isFinite(Number(v)))) return null
  return roundMoney(values.reduce((n, v) => n + Number(v), 0))
}

function money(n: number | null | undefined): number | null {
  if (n == null || !Number.isFinite(Number(n))) return null
  return roundMoney(Number(n))
}

/**
 * Cost / deduction columns are unsigned. Sign lives on the row (`+` / `−`),
 * never as a mirrored amount that invents Δ = ±2X or a −X / +X twin pair.
 */
export function unsignedSettlementCost(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(Number(value))) return null
  return roundMoney(Math.abs(Number(value)))
}

/** Δ = Actual − Expected after both columns are already unsigned costs (or signed totals). */
export function settlementDelta(expected: number | null, actual: number | null): number | null {
  if (expected == null || actual == null) return null
  return roundMoney(actual - expected)
}

/**
 * Cost pair for Expected | Actual | Δ.
 * Both columns are unsigned (≥0) when present. A missing statement or a
 * placeholder `$0` is not a real Actual — never invent Δ = −Expected
 * (the Expected −X / Advancing +X twin on 26R0x).
 */
export function settlementCostColumns(opts: {
  expected: number | null | undefined
  actual: number | null | undefined
  actualIsReal?: boolean
}): { expected: number | null; actual: number | null; delta: number | null } {
  const expected = unsignedSettlementCost(opts.expected)
  const placeholder = opts.actualIsReal !== true && (opts.actual == null || Number(opts.actual) === 0)
  if (placeholder) {
    return { expected, actual: null, delta: null }
  }
  let actual = unsignedSettlementCost(opts.actual)
  if (expected != null && actual != null && amountsMirror(Number(opts.expected), Number(opts.actual))) {
    actual = expected
  }
  return { expected, actual, delta: settlementDelta(expected, actual) }
}

/** Run-level Advancing Cost rows — one row per key, never once-per-show. */
export function uniqueRunCostLines<T extends { key: string }>(lines: T[]): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const line of lines) {
    if (seen.has(line.key)) continue
    seen.add(line.key)
    out.push(line)
  }
  return out
}

function deltaOf(expected: number | null, actual: number | null): number | null {
  return settlementDelta(expected, actual)
}

function costOrFallback(
  realActual: number | null | undefined,
  expected: number | null | undefined,
): number {
  return unsignedSettlementCost(realActual) ?? unsignedSettlementCost(expected) ?? 0
}

function normalizeLineKey(key: string): string {
  return parentFieldKey(key).toLowerCase()
}

function normalizeLineLabel(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function sameSettlementLine(
  a: { key: string; label: string },
  b: { key: string; label: string },
): boolean {
  if (normalizeLineKey(a.key) && normalizeLineKey(a.key) === normalizeLineKey(b.key)) return true
  const la = normalizeLineLabel(a.label)
  const lb = normalizeLineLabel(b.label)
  return Boolean(la) && la === lb
}

function amountsMirror(a: number | null, b: number | null): boolean {
  if (a == null || b == null) return false
  return Math.abs(roundMoney(a + b)) < 0.005 && Math.abs(a) >= 0.005
}

/**
 * Drop invented −X / +X twins for the same line. Remaining cost amounts are unsigned.
 * Same-line expected-only X + actual-only ±X becomes one unsigned X / X row (Δ 0).
 */
export function collapseMirrorPairs<T extends {
  key: string
  label: string
  expected: number | null
  actual: number | null
}>(rows: T[]): T[] {
  const remaining = [...rows]
  const out: T[] = []
  while (remaining.length) {
    const a = remaining.shift()!
    const twinAt = remaining.findIndex(b => sameSettlementLine(a, b) && (
      amountsMirror(a.expected, b.expected)
      || amountsMirror(a.actual, b.actual)
      || amountsMirror(a.expected, b.actual)
      || amountsMirror(a.actual, b.expected)
      || (
        a.expected != null && a.actual == null
        && b.actual != null && b.expected == null
        && Math.abs(Math.abs(a.expected) - Math.abs(b.actual)) < 0.005
      )
      || (
        b.expected != null && b.actual == null
        && a.actual != null && a.expected == null
        && Math.abs(Math.abs(b.expected) - Math.abs(a.actual)) < 0.005
      )
    ))
    if (twinAt >= 0) {
      const b = remaining.splice(twinAt, 1)[0]!
      const amount = unsignedSettlementCost(a.expected)
        ?? unsignedSettlementCost(a.actual)
        ?? unsignedSettlementCost(b.expected)
        ?? unsignedSettlementCost(b.actual)
      out.push({
        ...a,
        expected: amount,
        actual: amount,
      })
      continue
    }
    const sameRowMirror = amountsMirror(a.expected, a.actual)
    const unsignedExpected = unsignedSettlementCost(a.expected)
    const unsignedActual = unsignedSettlementCost(a.actual)
    out.push({
      ...a,
      expected: unsignedExpected,
      actual: sameRowMirror ? unsignedExpected : unsignedActual,
    })
  }
  return out
}

/** Same-line Δ twins only (not a cost row vs its total). Used in tests + sanity checks. */
export function findCancelingDeltaTwins(rows: Array<{
  key: string
  label: string
  delta: number | null
}>): Array<{ keyA: string; keyB: string; amount: number }> {
  const twins: Array<{ keyA: string; keyB: string; amount: number }> = []
  for (let i = 0; i < rows.length; i++) {
    const a = rows[i]!
    if (a.delta == null || Math.abs(a.delta) < 1) continue
    for (let j = i + 1; j < rows.length; j++) {
      const b = rows[j]!
      if (b.delta == null || !sameSettlementLine(a, b)) continue
      if (amountsMirror(a.delta, b.delta)) {
        twins.push({ keyA: a.key, keyB: b.key, amount: Math.abs(a.delta) })
      }
    }
  }
  return twins
}

export type V3ShowSheet = {
  show: { id: string; venue_name: string; venue_city?: string | null }
  lines: DecoratedSheetLine[]
}

/** Roll per-show sheet lines into one run-grained sheet. Run costs stay on `runLines`. */
export function mergeShowSheetLines(sheets: V3ShowSheet[]): DecoratedSheetLine[] {
  if (sheets.length === 0) return []
  const keyOrder: string[] = []
  const seen = new Set<string>()
  for (const sheet of sheets) {
    for (const line of sheet.lines) {
      if (line.group === 'run_costs') continue
      if (seen.has(line.key)) continue
      seen.add(line.key)
      keyOrder.push(line.key)
    }
  }
  return keyOrder.map(key => {
    const parts = sheets.flatMap(sheet => {
      const line = sheet.lines.find(l => l.key === key)
      return line ? [{ show: sheet.show, line }] : []
    })
    const first = parts[0]!.line
    const isCount = first.kind === 'count'
    const expected = money(parts.reduce((n, p) => {
      const value = isCount ? p.line.expected : unsignedSettlementCost(p.line.expected)
      return n + (value ?? 0)
    }, 0))
    const anyReal = parts.some(p => isCount
      ? p.line.actual != null
      : isSettledVenueActual(p.line) || Boolean(p.line.matchChildren?.some(c => !c.expectedOnly)))
    const actual = anyReal
      ? money(parts.reduce((n, p) => {
        const raw = isCount
          ? p.line.actual
          : (isSettledVenueActual(p.line) ? unsignedSettlementCost(p.line.actual) : null)
        return n + (raw ?? 0)
      }, 0))
      : null
    const children = parts.flatMap(({ show, line }) => {
      const venue = show.venue_city ? `${show.venue_name} · ${show.venue_city}` : show.venue_name
      if (line.matchChildren?.length) {
        return line.matchChildren.map(child => ({
          ...child,
          label: `${venue}: ${child.label}`,
          amount: unsignedSettlementCost(child.amount) ?? 0,
          expected: child.expected ?? null,
          expectedOnly: Boolean(child.expectedOnly),
        }))
      }
      const real = isCount ? line.actual != null : isSettledVenueActual(line)
      return [{
        id: `${show.id}:${line.key}`,
        lineKey: `${line.key}:${show.id}`,
        label: venue,
        amount: (real
          ? (isCount ? line.actual : unsignedSettlementCost(line.actual))
          : 0) ?? 0,
        expected: isCount ? line.expected : unsignedSettlementCost(line.expected),
        expectedOnly: !real,
        status: line.actualStatus === 'challenged' ? 'challenged' as const : 'confirmed' as const,
        paid: Boolean(line.actualPaid),
        challengeId: line.challengeId,
      }]
    })
    return {
      ...first,
      expected,
      actual,
      variance: settlementDelta(expected, actual),
      match: children.length >= 2 ? 'rollup' : first.match,
      matchChildren: children,
    }
  })
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

export function extractExpectedHireDeposits(
  fields: CostingSnapshotField[],
  showIds: string[],
): { amount: number; note: string } {
  const notes: string[] = []
  let amount = 0
  for (const showId of showIds) {
    const one = extractExpectedHireDeposit(fields, showId)
    amount = roundMoney(amount + one.amount)
    if (one.amount > 0) notes.push(one.note)
  }
  return {
    amount,
    note: notes[0] ?? 'No hire deposit on Advancing',
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
  grain: V3SettlementGrain = 'show',
): V3RawLine[] {
  return actuals
    .filter(a => {
      if (a.line_kind !== 'venue_settlement') return false
      if (grain === 'run') return true
      return (a.show_id ?? null) === showId
    })
    .map(a => ({
      id: a.id,
      description: a.notes?.trim() || a.line_key,
      amount: unsignedSettlementCost(a.amount) ?? 0,
      notes: a.notes,
      lineKey: a.line_key,
    }))
}

export function remittanceDeductibles(
  lines: RemittanceLine[] | null | undefined,
  showId: string,
  grain: V3SettlementGrain = 'show',
): { amount: number; children: V3ChildLine[] } {
  const matched = (lines ?? []).filter(l => {
    if (grain === 'show' && (l.show_id ?? null) !== showId && l.show_id != null) return false
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
    children: collapseMirrorPairs(matched.map(l => ({
      key: `deduct:${l.id}`,
      label: l.description,
      expected: unsignedSettlementCost(l.amount),
      actual: unsignedSettlementCost(l.amount),
      note: 'Rare remittance deductible — not an inside',
    }))),
  }
}

function childrenForBucket(
  lines: DecoratedSheetLine[],
  key: string,
  showId?: string | null,
): V3ChildLine[] {
  const row = lines.find(l => l.key === key)
  if (!row) return []
  if (row.matchChildren?.length) {
    return collapseMirrorPairs(row.matchChildren.map(child => {
      const showFromKey = child.lineKey.includes(':')
        ? child.lineKey.slice(child.lineKey.lastIndexOf(':') + 1)
        : showId ?? null
      const expectedOnly = Boolean(child.expectedOnly)
      return {
        key: child.lineKey,
        label: child.label,
        expected: unsignedSettlementCost(child.expected) ?? (expectedOnly ? unsignedSettlementCost(child.amount) : null),
        actual: expectedOnly ? null : unsignedSettlementCost(child.amount),
        note: child.status === 'challenged' ? 'Challenged' : undefined,
        sheetLine: row,
        showId: showFromKey,
      }
    }))
  }
  const real = isSettledVenueActual(row)
  return collapseMirrorPairs([{
    key: row.key,
    label: row.label,
    expected: unsignedSettlementCost(row.expected),
    actual: real ? unsignedSettlementCost(row.actual) : null,
    note: row.note,
    sheetLine: row,
    showId: showId ?? null,
  }])
}

function bandChildren(lines: DecoratedSheetLine[]): V3ChildLine[] {
  return collapseMirrorPairs(lines
    .filter(l => l.group === 'run_costs')
    .map(l => ({
      key: l.key,
      label: displayCostFieldLabel(l.key.replace(/^run:/, ''), l.label),
      expected: unsignedSettlementCost(l.expected),
      actual: unsignedSettlementCost(l.actual) ?? unsignedSettlementCost(l.expected),
      note: l.actualPaid ? 'PAID' : l.note,
      sheetLine: l,
      showId: null,
    })))
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
  grain?: V3SettlementGrain
  venueLabel?: string
  /** When true, skip §3/§4 on this venue model — run grain owns those once. */
  omitRunSections?: boolean
  lines: DecoratedSheetLine[]
  runLines?: DecoratedSheetLine[]
  fields: CostingSnapshotField[]
  actuals: SettlementActualLine[]
  remittanceLines?: RemittanceLine[] | null
  gstLines?: KnownGstLine[] | null
  statementLines?: V3RawLine[] | null
}): V3ShowModel {
  const grain: V3SettlementGrain = opts.grain ?? 'show'
  const lines = opts.lines.filter(l => l.group !== 'run_costs')
  const runLines = opts.omitRunSections
    ? []
    : uniqueRunCostLines(opts.runLines ?? opts.lines.filter(l => l.group === 'run_costs'))
  const classified = classifySettlementLines(
    opts.statementLines ?? statementLinesFromActuals(opts.actuals, opts.showId, grain),
    'venue_statement',
  )
  const buckets = sumBuckets(classified)
  const showIds = grain === 'run'
    ? [...new Set(opts.fields.map(f => f.show_id).filter((id): id is string => Boolean(id)))]
    : [opts.showId]
  const expectedDeposit = grain === 'run'
    ? extractExpectedHireDeposits(opts.fields, showIds)
    : extractExpectedHireDeposit(opts.fields, opts.showId)
  const deduct = remittanceDeductibles(opts.remittanceLines, opts.showId, grain)
  const gst = resolveKnownGst({
    lines: opts.gstLines,
    showId: grain === 'run' ? undefined : opts.showId,
  })

  const expectedTickets = unsignedSettlementCost(lineAmount(lines, 'gross_ticket_sales', 'expected'))
  const expectedInsides = unsignedSettlementCost(lineAmount(lines, 'inside_pre_commission', 'expected'))
  const expectedHire = unsignedSettlementCost(lineAmount(lines, 'show:venue_hire', 'expected')) ?? 0
  const expectedStaff = unsignedSettlementCost(lineAmount(lines, 'show:venue_staff', 'expected')) ?? 0
  const expectedMarketing = unsignedSettlementCost(lineAmount(lines, 'show:venue_marketing', 'expected')) ?? 0
  const expectedProduction = unsignedSettlementCost(lineAmount(lines, 'show:production_costs', 'expected')) ?? 0
  const expectedBand = unsignedSettlementCost(groupAmount(runLines, 'run_costs', 'expected')) ?? 0

  const actualTicketsStored = unsignedSettlementCost(lineAmount(lines, 'gross_ticket_sales', 'actual'))
  const ticketsDisplay = buckets.tickets > 0 ? buckets.tickets : actualTicketsStored
  const actualTickets = ticketsDisplay ?? expectedTickets
  const statementInside = resolveStatementInside({
    lines: classified,
    estimatedInside: unsignedSettlementCost(lineAmount(lines, 'inside_pre_commission', 'actual'))
      ?? expectedInsides,
  })
  const hireLine = lines.find(l => l.key === 'show:venue_hire')
  const staffLine = lines.find(l => l.key === 'show:venue_staff')
  const marketingLine = lines.find(l => l.key === 'show:venue_marketing')
  const productionLine = lines.find(l => l.key === 'show:production_costs')
  const hireDisplay = classified.some(l => l.kind === 'hire')
    ? (unsignedSettlementCost(buckets.hire) ?? 0)
    : (hireLine && isSettledVenueActual(hireLine) ? unsignedSettlementCost(hireLine.actual) : null)
  const staffDisplay = classified.some(l => l.kind === 'staff')
    ? (unsignedSettlementCost(buckets.staff) ?? 0)
    : (staffLine && isSettledVenueActual(staffLine) ? unsignedSettlementCost(staffLine.actual) : null)
  const marketingDisplay = classified.some(l => l.kind === 'marketing')
    ? (unsignedSettlementCost(buckets.marketing) ?? 0)
    : (marketingLine && isSettledVenueActual(marketingLine) ? unsignedSettlementCost(marketingLine.actual) : null)
  const productionDisplay = classified.some(l => l.kind === 'production')
    ? (unsignedSettlementCost(buckets.production) ?? 0)
    : (productionLine && isSettledVenueActual(productionLine) ? unsignedSettlementCost(productionLine.actual) : null)
  const actualHire = costOrFallback(hireDisplay, expectedHire)
  const actualStaff = costOrFallback(staffDisplay, expectedStaff)
  const actualMarketing = costOrFallback(marketingDisplay, expectedMarketing)
  const actualProduction = costOrFallback(productionDisplay, expectedProduction)
  const actualOther = unsignedSettlementCost(buckets.other) ?? 0
  const hasDepositStatement = classified.some(l => l.kind === 'deposit')
  const actualDeposit = unsignedSettlementCost(buckets.deposit) ?? 0
  const actualBand = costOrFallback(groupAmount(runLines, 'run_costs', 'actual'), expectedBand)

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
    || lines.some(l => l.group === 'venue_costs' && isSettledVenueActual(l))
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
    deposit: hasDepositStatement ? actualDeposit : expectedDeposit.amount,
    appliedDeposit: hasDepositStatement ? netting.appliedDeposit : expectedDeposit.amount,
    depositNetted: hasDepositStatement ? netting.alreadyNetted : false,
    depositResidual: hasDepositStatement ? netting.residual : expectedDeposit.note,
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
      children: childrenForBucket(lines, 'gross_ticket_sales', grain === 'run' ? null : opts.showId),
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
      children: childrenForBucket(lines, 'inside_pre_commission', grain === 'run' ? null : opts.showId),
      testId: 'sheet-row-inside_pre_commission',
    }),
    row({
      key: 'hire',
      section: 1,
      label: '− Venue Hire',
      sign: '−',
      ...settlementCostColumns({ expected: expected.hire, actual: hireDisplay, actualIsReal: hireDisplay != null }),
      kind: 'money',
      children: childrenForBucket(lines, 'show:venue_hire', grain === 'run' ? null : opts.showId),
      testId: 'sheet-actual-show:venue_hire',
    }),
    row({
      key: 'staff',
      section: 1,
      label: '− Venue Staff',
      sign: '−',
      ...settlementCostColumns({ expected: expected.staff, actual: staffDisplay, actualIsReal: staffDisplay != null }),
      kind: 'money',
      children: childrenForBucket(lines, 'show:venue_staff', grain === 'run' ? null : opts.showId),
    }),
    row({
      key: 'marketing',
      section: 1,
      label: '− Venue Marketing',
      sign: '−',
      ...settlementCostColumns({ expected: expected.marketing, actual: marketingDisplay, actualIsReal: marketingDisplay != null }),
      kind: 'money',
      children: childrenForBucket(lines, 'show:venue_marketing', grain === 'run' ? null : opts.showId),
      testId: 'sheet-rollup-show:venue_marketing',
    }),
    row({
      key: 'production',
      section: 1,
      label: `− ${VENUE_PRODUCTION_AV_LABEL}`,
      sign: '−',
      ...settlementCostColumns({ expected: expected.production, actual: productionDisplay, actualIsReal: productionDisplay != null }),
      kind: 'money',
      children: childrenForBucket(lines, 'show:production_costs', grain === 'run' ? null : opts.showId),
    }),
    row({
      key: 'other',
      section: 1,
      label: '− Other venue charges',
      sign: '−',
      expected: expected.other,
      actual: actualOther > 0 ? actualOther : null,
      kind: 'money',
      note: actual.other ? 'LPA / EIS / APRA and unclassified venue lines — not insides' : undefined,
      children: collapseMirrorPairs(classified.filter(l => l.kind === 'other').map(l => ({
        key: l.id ?? l.description,
        label: l.description,
        expected: null,
        actual: unsignedSettlementCost(l.amount),
      }))),
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
      expected: unsignedSettlementCost(expected.deposit),
      actual: hasDepositStatement ? unsignedSettlementCost(actual.depositApplied) : null,
      kind: 'money',
      note: hasDepositStatement
        ? (actual.depositResidual ?? expected.depositResidual ?? undefined)
        : (expected.depositResidual ?? 'Deposit applied once from Advancing until a venue PDF nets or credits it.'),
      children: collapseMirrorPairs(classified.filter(l => l.kind === 'deposit').map(l => ({
        key: l.id ?? 'deposit',
        label: l.description,
        expected: unsignedSettlementCost(expected.deposit),
        actual: unsignedSettlementCost(l.amount),
        note: actual.depositNetted ? 'Already in printed Due to Hirer' : undefined,
      }))),
    }),
    row({
      key: 'due_to_hirer',
      section: 1,
      label: opts.venueLabel ? `Due to Hirer — ${opts.venueLabel}` : 'Due to Hirer',
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
      children: childrenForBucket(lines, 'harbour_commission', grain === 'run' ? null : opts.showId),
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
      label: opts.venueLabel ? `Due to QF (remittance) — ${opts.venueLabel}` : 'Due to QF (remittance)',
      sign: '=',
      expected: expected.dueToQf,
      actual: actual.dueToQf,
      kind: 'money',
      highlight: true,
      children: [],
      testId: 'v3-due-to-qf',
    }),
  ]

  const runSections = opts.omitRunSections
    ? { section3: [] as V3RollupRow[], section4: [] as V3RollupRow[] }
    : buildV3RunLevelSections({
      expected,
      actual,
      runLines,
      remittanceLabel: '+ Remittance (Due to QF)',
    })

  return {
    dueToHirerExpected: expected.dueToHirer,
    dueToHirerActual: actual.dueToHirer,
    dueToQfExpected: expected.dueToQf,
    dueToQfActual: actual.dueToQf,
    preDistExpected: opts.omitRunSections ? null : expected.preDistMargin,
    preDistActual: opts.omitRunSections ? null : actual.preDistMargin,
    ownerSplitsExpected: opts.omitRunSections ? null : expected.ownerSplits,
    ownerSplitsActual: opts.omitRunSections ? null : actual.ownerSplits,
    expected,
    actual,
    depositNetting: netting,
    statementLines: classified,
    section1,
    section2,
    section3: runSections.section3,
    section4: runSections.section4,
  }
}

function buildV3RunLevelSections(opts: {
  expected: V3SideMath
  actual: V3SideMath
  runLines: DecoratedSheetLine[]
  remittanceLabel?: string
}): { section3: V3RollupRow[]; section4: V3RollupRow[] } {
  const { expected, actual, runLines } = opts
  const section3: V3RollupRow[] = [
    row({
      key: 's3_remittance',
      section: 3,
      label: opts.remittanceLabel ?? '+ Remittance (Due to QF)',
      sign: '+',
      expected: expected.dueToQf,
      actual: actual.dueToQf,
      kind: 'money',
      children: [],
    }),
    row({
      key: 'band_costs',
      section: 3,
      label: `− ${ADVANCING_COSTS_LABEL}`,
      sign: '−',
      expected: expected.bandCosts,
      actual: actual.bandCosts,
      kind: 'money',
      note: (() => {
        const paid = runLines.filter(l => l.group === 'run_costs' && l.actualPaid).length
        const base = 'Crew / travel / Production Bought In from Advancing — not §1 venue lines. Once per run.'
        return paid ? `${paid} PAID from Advancing · ${base}` : base
      })(),
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
  return { section3, section4 }
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

/**
 * One Settlements model per run. Each venue is its own §1/§2 cycle (full
 * lines + own Due to Hirer / remittance). §3 Advancing Costs and §4 owners
 * are computed once from the sum of venue remittances. Never a combined
 * Due to Hirer, and never a duplicated §3 per show.
 */
export function buildV3RunModel(opts: {
  shows: Array<{ id: string; venue_name: string; venue_city?: string | null }>
  showSheets: V3ShowSheet[]
  runLines: DecoratedSheetLine[]
  fields: CostingSnapshotField[]
  actuals: SettlementActualLine[]
  remittanceLines?: RemittanceLine[] | null
  gstLines?: KnownGstLine[] | null
  statementLines?: V3RawLine[] | null
}): V3RunModel {
  const runLines = uniqueRunCostLines(opts.runLines)
  const sheetById = new Map(opts.showSheets.map(sheet => [sheet.show.id, sheet]))
  const venues: V3VenueCycle[] = opts.shows.map(show => {
    const sheet = sheetById.get(show.id)
    const venueLabel = show.venue_city ? `${show.venue_name} · ${show.venue_city}` : show.venue_name
    return {
      show,
      model: buildV3ShowModel({
        showId: show.id,
        grain: 'show',
        venueLabel,
        omitRunSections: true,
        lines: (sheet?.lines ?? []).filter(l => l.group !== 'run_costs'),
        runLines: [],
        fields: opts.fields,
        actuals: opts.actuals,
        remittanceLines: opts.remittanceLines,
        gstLines: opts.gstLines,
        statementLines: opts.statementLines?.length && opts.shows.length === 1
          ? opts.statementLines
          : undefined,
      }),
    }
  })

  const gst = resolveKnownGst({ lines: opts.gstLines })
  const expectedBand = unsignedSettlementCost(groupAmount(runLines, 'run_costs', 'expected')) ?? 0
  const actualBand = costOrFallback(groupAmount(runLines, 'run_costs', 'actual'), expectedBand)
  const dueToQfExpected = sumAllOrNull(venues.map(v => v.model.dueToQfExpected))
  const dueToQfActual = sumAllOrNull(venues.map(v => v.model.dueToQfActual))
  const expectedMargin = computeV3Margin({
    remittance: dueToQfExpected,
    bandCosts: expectedBand,
    gstQuarantine: gst.amount ?? 0,
    gstKnown: gst.source === 'known',
    gstSourceLabel: gst.sourceLabel,
  })
  const actualMargin = computeV3Margin({
    remittance: dueToQfActual,
    bandCosts: actualBand,
    gstQuarantine: gst.amount ?? 0,
    gstKnown: gst.source === 'known',
    gstSourceLabel: gst.sourceLabel,
  })

  const expected: V3SideMath = {
    tickets: sumAllOrNull(venues.map(v => v.model.expected.tickets)),
    insides: sumAllOrNull(venues.map(v => v.model.expected.insides)),
    insideSource: venues.some(v => v.model.expected.insideSource === 'known')
      ? 'known'
      : venues.some(v => v.model.expected.insideSource === 'estimated')
        ? 'estimated'
        : 'missing',
    insideLabel: 'Sum of venue insides — Harbour 10% is taken per venue, not on this roll-up.',
    hire: sumAllOrNull(venues.map(v => v.model.expected.hire)),
    staff: sumAllOrNull(venues.map(v => v.model.expected.staff)),
    marketing: sumAllOrNull(venues.map(v => v.model.expected.marketing)),
    production: sumAllOrNull(venues.map(v => v.model.expected.production)),
    other: sumAllOrNull(venues.map(v => v.model.expected.other)) ?? 0,
    deposit: sumAllOrNull(venues.map(v => v.model.expected.deposit)) ?? 0,
    depositApplied: sumAllOrNull(venues.map(v => v.model.expected.depositApplied)) ?? 0,
    depositNetted: venues.some(v => v.model.expected.depositNetted),
    depositResidual: venues.find(v => v.model.expected.depositResidual)?.model.expected.depositResidual ?? null,
    dueToHirer: null,
    harbourCommission: sumAllOrNull(venues.map(v => v.model.expected.harbourCommission)),
    deductibles: roundMoney(venues.reduce((n, v) => n + (v.model.expected.deductibles ?? 0), 0)),
    dueToQf: dueToQfExpected,
    ...expectedMargin,
  }
  const actual: V3SideMath = {
    tickets: sumAllOrNull(venues.map(v => v.model.actual.tickets)),
    insides: sumAllOrNull(venues.map(v => v.model.actual.insides)),
    insideSource: venues.some(v => v.model.actual.insideSource === 'known')
      ? 'known'
      : venues.some(v => v.model.actual.insideSource === 'estimated')
        ? 'estimated'
        : 'missing',
    insideLabel: 'Sum of venue insides — Harbour 10% is taken per venue, not on this roll-up.',
    hire: sumAllOrNull(venues.map(v => v.model.actual.hire)),
    staff: sumAllOrNull(venues.map(v => v.model.actual.staff)),
    marketing: sumAllOrNull(venues.map(v => v.model.actual.marketing)),
    production: sumAllOrNull(venues.map(v => v.model.actual.production)),
    other: sumAllOrNull(venues.map(v => v.model.actual.other)) ?? 0,
    deposit: sumAllOrNull(venues.map(v => v.model.actual.deposit)) ?? 0,
    depositApplied: sumAllOrNull(venues.map(v => v.model.actual.depositApplied)) ?? 0,
    depositNetted: venues.some(v => v.model.actual.depositNetted),
    depositResidual: venues.find(v => v.model.actual.depositResidual)?.model.actual.depositResidual ?? null,
    dueToHirer: null,
    harbourCommission: sumAllOrNull(venues.map(v => v.model.actual.harbourCommission)),
    deductibles: roundMoney(venues.reduce((n, v) => n + (v.model.actual.deductibles ?? 0), 0)),
    dueToQf: dueToQfActual,
    ...actualMargin,
  }

  const { section3, section4 } = buildV3RunLevelSections({
    expected,
    actual,
    runLines,
    remittanceLabel: venues.length > 1
      ? '+ Remittance (sum of venue Due to QF)'
      : '+ Remittance (Due to QF)',
  })

  return {
    venues,
    section3,
    section4,
    dueToQfExpected,
    dueToQfActual,
    preDistExpected: expected.preDistMargin,
    preDistActual: actual.preDistMargin,
    ownerSplitsExpected: expected.ownerSplits,
    ownerSplitsActual: actual.ownerSplits,
    expected,
    actual,
    depositNetting: null,
    statementLines: venues.flatMap(v => v.model.statementLines),
  }
}

export function definedBandCostKeys(): string[] {
  return DEFINED_RUN_COST_FIELDS.map(f => f.key)
}

export { bucketLabel, pdfInsideKnown }

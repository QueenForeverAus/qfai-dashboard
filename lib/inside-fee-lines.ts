/**
 * Wave A2 — itemised Inside fee lines on Costings / Advancing.
 *
 * Standard lines seed from Factors (or silent Estimate defaults).
 * Edit rate → $ recalculates from that show's payers / ticket gross.
 * Custom add = label + $ only. Still tagged inside.
 * Settlement remittance never overwrites Costings/Advancing figure-source.
 * Contract known → Confirmed on Costings/Advancing.
 */

import type { CostEntry } from './cost-fields.ts'
import {
  SILENT_BOOKING_FEE_PER_PAYER,
  SILENT_BUNDLED_PER_PAYER,
  SILENT_CC_FEE_PCT,
  classifyInsidePlacement,
  firstNumberOrNull,
  remittanceHasCcSplit,
  resolveInsideCosts,
  roundMoney,
  type InsideBreakdown,
  type InsideFactorValues,
  type KnownInsideLine,
  type VenueInsideOverride,
} from './pnl-run-costing.ts'

export const INSIDE_FEES_FIELD_KEY = 'inside_fees' as const
export const INSIDE_FEES_CATEGORY = 'Inside fees' as const
export const INSIDE_FEES_LABEL = 'Inside fees (come off gross before Harbour 10%)'

export const INSIDE_SEED_KEYS = {
  bookingFee: 'booking_fee',
  ccFee: 'cc_fee',
  ticketingInside: 'ticketing_inside',
  compTickets: 'comp_tickets',
} as const

export type InsideSeedKey = (typeof INSIDE_SEED_KEYS)[keyof typeof INSIDE_SEED_KEYS]
export type InsideKind = InsideSeedKey | 'custom'
export type InsideRateUnit = 'per_payer' | 'pct_gross'

export const STANDARD_INSIDE_SEED_KEYS: readonly InsideSeedKey[] = [
  INSIDE_SEED_KEYS.bookingFee,
  INSIDE_SEED_KEYS.ccFee,
  INSIDE_SEED_KEYS.ticketingInside,
  INSIDE_SEED_KEYS.compTickets,
]

export function isInsideFeesFieldKey(fieldKey: string | null | undefined): boolean {
  return fieldKey === INSIDE_FEES_FIELD_KEY
}

export function isInsideSeedKey(value: string | null | undefined): value is InsideSeedKey {
  return (STANDARD_INSIDE_SEED_KEYS as readonly string[]).includes(String(value ?? ''))
}

export function parseInsideKind(raw: unknown): InsideKind | null {
  const key = String(raw ?? '').trim()
  if (key === 'custom') return 'custom'
  return isInsideSeedKey(key) ? key : null
}

export function parseInsideRateUnit(raw: unknown): InsideRateUnit | null {
  return raw === 'per_payer' || raw === 'pct_gross' ? raw : null
}

export function parseOptionalRate(raw: unknown): number | null {
  if (raw == null || raw === '') return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

export type InsideCalcBase = {
  payerCount: number
  grossTicketSales: number
}

export function amountFromInsideRate(
  rate: number | null | undefined,
  unit: InsideRateUnit | null | undefined,
  base: InsideCalcBase,
): number {
  if (rate == null || !Number.isFinite(Number(rate)) || !unit) return 0
  const n = Number(rate)
  if (unit === 'per_payer') return roundMoney(Math.max(0, Number(base.payerCount) || 0) * n)
  return roundMoney(Math.max(0, Number(base.grossTicketSales) || 0) * (n / 100))
}

export function liveRecalcInsideEntry<T extends {
  seed_key?: string | null
  inside_kind?: InsideKind | null
  rate?: number | null
  rate_unit?: InsideRateUnit | null
  amount: number
}>(entry: T, base: InsideCalcBase): T {
  if (entry.rate == null || !entry.rate_unit) return entry
  if (entry.inside_kind === 'custom') return entry
  return { ...entry, amount: amountFromInsideRate(entry.rate, entry.rate_unit, base) }
}

export function liveRecalcInsideEntries<T extends {
  seed_key?: string | null
  inside_kind?: InsideKind | null
  rate?: number | null
  rate_unit?: InsideRateUnit | null
  amount: number
}>(entries: T[] | null | undefined, base: InsideCalcBase): T[] {
  return (entries ?? []).map(entry => liveRecalcInsideEntry(entry, base))
}

export function insideEntriesTotal(
  entries: Array<{ amount?: number | null }> | null | undefined,
): number {
  return roundMoney((entries ?? []).reduce((sum, e) => sum + (Number(e.amount) || 0), 0))
}

function newEntryId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `e-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function insideLineDescription(kind: InsideKind): string {
  switch (kind) {
    case INSIDE_SEED_KEYS.bookingFee:
      return 'Booking fee'
    case INSIDE_SEED_KEYS.ccFee:
      return 'CC / merchant / inside CC'
    case INSIDE_SEED_KEYS.ticketingInside:
      return 'Ticketing / inside %'
    case INSIDE_SEED_KEYS.compTickets:
      return 'Comp ticket fees'
    default:
      return 'Inside fee'
  }
}

export function insideLineNotes(kind: InsideKind, usedFactors: boolean): string {
  const source = usedFactors
    ? 'Source: Factors (Estimate — not known)'
    : 'Source: silent default (Estimate — not known)'
  switch (kind) {
    case INSIDE_SEED_KEYS.bookingFee:
      return `${source}. $/payer × paying tickets.`
    case INSIDE_SEED_KEYS.ccFee:
      return `${source}. % of ticket gross.`
    case INSIDE_SEED_KEYS.ticketingInside:
      return `${source}. Optional Factors % of ticket gross.`
    case INSIDE_SEED_KEYS.compTickets:
      return `${source}. Same inside bucket when applicable.`
    default:
      return 'Custom inside line — comes off gross before Harbour 10%.'
  }
}

export type StandardInsideSpec = {
  seedKey: InsideSeedKey
  kind: InsideKind
  rate: number
  rateUnit: InsideRateUnit
  usedFactors: boolean
}

/**
 * Standard Estimate lines for a new/unbooked show.
 * Never invent known. Comp line only when an applicable amount exists.
 */
export function standardInsideSpecs(opts: {
  factors?: InsideFactorValues | null
  venueOverride?: VenueInsideOverride | null
  hasCcSplitHistory?: boolean
  includeComp?: boolean
  compRatePerPayer?: number | null
}): StandardInsideSpec[] {
  const bookingPerPayer = firstNumberOrNull(
    opts.venueOverride?.bookingFeePerPayer,
    opts.factors?.bookingFeePerPayer,
  )
  const ccPct = firstNumberOrNull(
    opts.venueOverride?.ccFeePct,
    opts.factors?.ccFeePct,
  )
  const ticketingPct = firstNumberOrNull(opts.factors?.ticketingInsidePct)
  const compRate = firstNumberOrNull(opts.compRatePerPayer, opts.factors?.compTicketFeePerPayer)
  const includeComp = opts.includeComp === true || (opts.includeComp !== false && compRate != null)
  const hasCcSplit = Boolean(opts.hasCcSplitHistory) || ccPct != null
  const usedFactors = bookingPerPayer != null || ccPct != null || ticketingPct != null || compRate != null

  const specs: StandardInsideSpec[] = []
  if (hasCcSplit) {
    specs.push({
      seedKey: INSIDE_SEED_KEYS.bookingFee,
      kind: INSIDE_SEED_KEYS.bookingFee,
      rate: bookingPerPayer ?? SILENT_BOOKING_FEE_PER_PAYER,
      rateUnit: 'per_payer',
      usedFactors,
    })
    specs.push({
      seedKey: INSIDE_SEED_KEYS.ccFee,
      kind: INSIDE_SEED_KEYS.ccFee,
      rate: ccPct ?? SILENT_CC_FEE_PCT,
      rateUnit: 'pct_gross',
      usedFactors,
    })
  } else {
    specs.push({
      seedKey: INSIDE_SEED_KEYS.bookingFee,
      kind: INSIDE_SEED_KEYS.bookingFee,
      rate: bookingPerPayer ?? SILENT_BUNDLED_PER_PAYER,
      rateUnit: 'per_payer',
      usedFactors,
    })
  }

  if (ticketingPct != null) {
    specs.push({
      seedKey: INSIDE_SEED_KEYS.ticketingInside,
      kind: INSIDE_SEED_KEYS.ticketingInside,
      rate: ticketingPct,
      rateUnit: 'pct_gross',
      usedFactors: true,
    })
  }

  if (includeComp && compRate != null) {
    specs.push({
      seedKey: INSIDE_SEED_KEYS.compTickets,
      kind: INSIDE_SEED_KEYS.compTickets,
      rate: compRate,
      rateUnit: 'per_payer',
      usedFactors,
    })
  }

  return specs
}

export function buildInsideFeeEntry(opts: {
  spec?: StandardInsideSpec
  kind?: InsideKind
  description?: string
  notes?: string
  amount?: number
  rate?: number | null
  rateUnit?: InsideRateUnit | null
  seedKey?: string | null
  base?: InsideCalcBase
  stateConfirmed?: boolean
}): CostEntry {
  const kind = opts.spec?.kind ?? opts.kind ?? 'custom'
  const rate = opts.spec?.rate ?? opts.rate ?? null
  const rateUnit = opts.spec?.rateUnit ?? opts.rateUnit ?? null
  const amount = opts.base && rate != null && rateUnit
    ? amountFromInsideRate(rate, rateUnit, opts.base)
    : roundMoney(opts.amount ?? 0)
  return {
    id: newEntryId(),
    description: opts.description ?? insideLineDescription(kind),
    notes: opts.notes ?? (opts.spec ? insideLineNotes(kind, opts.spec.usedFactors) : insideLineNotes('custom', false)),
    amount,
    gst_included: true,
    confirmed: opts.stateConfirmed === true,
    paid: false,
    paid_at: null,
    seed_key: opts.spec?.seedKey ?? opts.seedKey ?? (kind === 'custom' ? null : kind),
    rate,
    rate_unit: rateUnit,
    inside_kind: kind,
  }
}

export function seedStandardInsideEntries(opts: {
  factors?: InsideFactorValues | null
  venueOverride?: VenueInsideOverride | null
  hasCcSplitHistory?: boolean
  includeComp?: boolean
  compRatePerPayer?: number | null
  payerCount: number
  grossTicketSales: number
  tombstonedSeedKeys?: Iterable<string>
}): CostEntry[] {
  const blocked = new Set(
    [...(opts.tombstonedSeedKeys ?? [])].map(k => String(k).trim()).filter(Boolean),
  )
  const base = { payerCount: opts.payerCount, grossTicketSales: opts.grossTicketSales }
  return standardInsideSpecs(opts)
    .filter(spec => !blocked.has(spec.seedKey))
    .map(spec => buildInsideFeeEntry({ spec, base }))
}

export function buildCustomInsideEntry(opts: {
  description: string
  amount: number
  notes?: string
}): CostEntry {
  return buildInsideFeeEntry({
    kind: 'custom',
    description: opts.description.trim() || 'Inside fee',
    amount: roundMoney(opts.amount),
    notes: opts.notes ?? insideLineNotes('custom', false),
    rate: null,
    rateUnit: null,
    seedKey: null,
  })
}

export function isContractKnownInsideSource(source: string | null | undefined): boolean {
  return String(source ?? '').trim().toLowerCase() === 'contract'
}

export function contractKnownInsideLines(
  lines: KnownInsideLine[] | null | undefined,
  showId?: string | null,
): KnownInsideLine[] {
  return (lines ?? []).filter(line => {
    if (!isContractKnownInsideSource(line.source)) return false
    if (showId && (line.showId ?? null) !== showId) return false
    return classifyInsidePlacement(line.description) === 'inside'
  })
}

export function matchContractLineToSeedKey(description: string): InsideSeedKey | 'custom' {
  const text = String(description ?? '')
  if (/\bcomp\s*ticket/i.test(text)) return INSIDE_SEED_KEYS.compTickets
  if (/\b(credit\s*card|cc\s*fee|merchant|processing)\b/i.test(text)) return INSIDE_SEED_KEYS.ccFee
  if (/\bbooking\s*fee\b/i.test(text)) return INSIDE_SEED_KEYS.bookingFee
  if (/\b(ticketing\s*(inside|fee)|inside\s*(cost|fee)|bo\s*ticketing|box[\s-]*office\s*ticketing)\b/i.test(text)) {
    return INSIDE_SEED_KEYS.ticketingInside
  }
  return 'custom'
}

/**
 * Contract known insides → Confirmed lines on Costings/Advancing.
 * Does not consume settlement/remittance lines.
 */
export function applyContractKnownInsideEntries(opts: {
  existing: CostEntry[] | null | undefined
  contractLines: KnownInsideLine[]
  tombstonedSeedKeys?: Iterable<string>
}): { entries: CostEntry[]; changed: boolean } {
  const blocked = new Set(
    [...(opts.tombstonedSeedKeys ?? [])].map(k => String(k).trim()).filter(Boolean),
  )
  const existing = [...(opts.existing ?? [])]
  let changed = false

  for (const line of opts.contractLines) {
    const kind = matchContractLineToSeedKey(line.description)
    const seedKey = kind === 'custom' ? null : kind
    if (seedKey && blocked.has(seedKey)) continue

    const amount = roundMoney(Math.abs(Number(line.amount) || 0))
    const idx = seedKey
      ? existing.findIndex(e => (e.seed_key ?? e.inside_kind) === seedKey)
      : existing.findIndex(e =>
        e.inside_kind === 'custom'
        && e.description.trim().toLowerCase() === String(line.description).trim().toLowerCase(),
      )

    if (idx >= 0) {
      const prev = existing[idx]!
      if (prev.amount !== amount || prev.description !== (line.description || prev.description)) {
        existing[idx] = {
          ...prev,
          description: line.description || prev.description,
          amount,
          notes: prev.notes || 'Known — contract (Confirmed). Not a settlement remittance.',
          confirmed: true,
        }
        changed = true
      }
      continue
    }

    existing.push(buildInsideFeeEntry({
      kind,
      description: line.description || insideLineDescription(kind),
      amount,
      notes: 'Known — contract (Confirmed). Not a settlement remittance.',
      seedKey,
      rate: null,
      rateUnit: null,
      stateConfirmed: true,
    }))
    changed = true
  }

  return { entries: existing, changed }
}

export function insideBreakdownFromEntries(
  entries: CostEntry[] | null | undefined,
  source: InsideBreakdown['source'] = 'estimated',
  sourceLabel?: string,
): InsideBreakdown {
  const rows = entries ?? []
  const byKind = (kind: InsideKind) =>
    roundMoney(rows.filter(e => (e.inside_kind ?? e.seed_key) === kind).reduce((s, e) => s + (Number(e.amount) || 0), 0))
  const bookingFee = byKind(INSIDE_SEED_KEYS.bookingFee)
  const ccFee = byKind(INSIDE_SEED_KEYS.ccFee)
  const ticketingInside = byKind(INSIDE_SEED_KEYS.ticketingInside)
  const namedInside = roundMoney(
    rows
      .filter(e => {
        const kind = e.inside_kind ?? e.seed_key
        return kind === 'custom' || kind === INSIDE_SEED_KEYS.compTickets || !kind
      })
      .reduce((s, e) => s + (Number(e.amount) || 0), 0),
  )
  return {
    bookingFee,
    ccFee,
    ticketingInside,
    namedInside,
    total: roundMoney(bookingFee + ccFee + ticketingInside + namedInside),
    source,
    sourceLabel: sourceLabel ?? (source === 'known'
      ? 'known — contract'
      : 'estimated — Inside fee lines (not known)'),
  }
}

/**
 * Costings / Advancing waterfall insides.
 * Prefer itemised lines (live-recalc). Never let settlement remittance overwrite.
 * Empty / missing lines fall back to Factors / silent Estimate math.
 */
export function resolveSheetInsideCosts(opts: {
  grossTicketSales: number
  payerCount: number
  factors?: InsideFactorValues | null
  venueOverride?: VenueInsideOverride | null
  entries?: CostEntry[] | null
  fieldState?: string | null
  contractLines?: KnownInsideLine[] | null
  showId?: string | null
}): InsideBreakdown {
  const base = {
    payerCount: opts.payerCount,
    grossTicketSales: opts.grossTicketSales,
  }
  const live = liveRecalcInsideEntries(opts.entries ?? [], base)
  if (live.length > 0) {
    const known = opts.fieldState === 'known' || live.every(e => e.confirmed)
    return insideBreakdownFromEntries(
      live,
      known ? 'known' : 'estimated',
      known
        ? 'known — contract / Confirmed lines'
        : 'estimated — itemised Inside fee lines (not known)',
    )
  }

  const contract = contractKnownInsideLines(opts.contractLines, opts.showId)
  if (contract.length) {
    const applied = applyContractKnownInsideEntries({ existing: [], contractLines: contract })
    return insideBreakdownFromEntries(applied.entries, 'known', 'known — contract')
  }

  return resolveInsideCosts({
    grossTicketSales: opts.grossTicketSales,
    payerCount: opts.payerCount,
    factors: opts.factors,
    venueOverride: opts.venueOverride,
    remittanceKnownTotal: null,
    remittanceKnownLines: null,
    hasCcSplitHistory: remittanceHasCcSplit(opts.contractLines ?? [], opts.showId ?? undefined),
  })
}

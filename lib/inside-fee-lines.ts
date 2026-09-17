/**
 * Wave A2.1 — itemised Inside fee lines on Costings / Advancing (Revenue).
 *
 * Seed from contract and/or Harbour Draft when available — never from Factors
 * standing rates or silent $4.50 / 1.6% / $5 defaults. Prefer empty until known.
 * Operator may add / delete / edit booking, CC, comps, or custom lines.
 * Edit rate → $ recalculates from that show's payers / ticket gross.
 * Settlement remittance never overwrites Costings/Advancing figure-source.
 * Contract / Harbour Draft known → Confirmed on Costings/Advancing.
 */

import type { CostEntry } from './cost-fields.ts'
import {
  classifyInsidePlacement,
  firstNumberOrNull,
  roundMoney,
  type InsideBreakdown,
  type KnownInsideLine,
} from './pnl-run-costing.ts'

export const INSIDE_FEES_FIELD_KEY = 'inside_fees' as const
export const INSIDE_FEES_CATEGORY = 'Inside fees' as const
export const INSIDE_FEES_LABEL = 'Inside Fees'

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

export function insideLineNotes(kind: InsideKind, source: 'operator' | 'contract' | 'harbour_draft' = 'operator'): string {
  const from = source === 'contract'
    ? 'Known — contract (Confirmed). Not a settlement remittance.'
    : source === 'harbour_draft'
      ? 'Known — Harbour Draft (Confirmed). Not a settlement remittance.'
      : 'Operator-entered (Estimate — not known). Not from Factors.'
  switch (kind) {
    case INSIDE_SEED_KEYS.bookingFee:
      return `${from} $/payer × paying tickets.`
    case INSIDE_SEED_KEYS.ccFee:
      return `${from} % of ticket gross.`
    case INSIDE_SEED_KEYS.ticketingInside:
      return `${from} % of ticket gross.`
    case INSIDE_SEED_KEYS.compTickets:
      return `${from} Same inside bucket when applicable.`
    default:
      return source === 'operator'
        ? 'Custom inside line — comes off gross before Harbour 10%.'
        : from
  }
}

/** Standard kinds an owner can add under Revenue → Inside Fees. */
export const OPERATOR_INSIDE_ADD_KINDS: ReadonlyArray<{
  kind: InsideKind
  label: string
  rateUnit: InsideRateUnit | null
}> = [
  { kind: INSIDE_SEED_KEYS.bookingFee, label: 'Booking fee', rateUnit: 'per_payer' },
  { kind: INSIDE_SEED_KEYS.ccFee, label: 'CC / merchant', rateUnit: 'pct_gross' },
  { kind: INSIDE_SEED_KEYS.compTickets, label: 'Comp ticket fees', rateUnit: 'per_payer' },
  { kind: 'custom', label: 'Custom', rateUnit: null },
]

export type StandardInsideSpec = {
  seedKey: InsideSeedKey
  kind: InsideKind
  rate: number
  rateUnit: InsideRateUnit
  usedFactors: boolean
}

/**
 * Build operator-entered standard specs from explicit rates only.
 * Wave A2.1: never read Factors standing keys or silent $4.50 / 1.6% / $5.
 */
export function standardInsideSpecs(opts: {
  bookingFeePerPayer?: number | null
  ccFeePct?: number | null
  ticketingInsidePct?: number | null
  includeComp?: boolean
  compRatePerPayer?: number | null
}): StandardInsideSpec[] {
  const bookingPerPayer = firstNumberOrNull(opts.bookingFeePerPayer)
  const ccPct = firstNumberOrNull(opts.ccFeePct)
  const ticketingPct = firstNumberOrNull(opts.ticketingInsidePct)
  const compRate = firstNumberOrNull(opts.compRatePerPayer)
  const specs: StandardInsideSpec[] = []

  if (bookingPerPayer != null) {
    specs.push({
      seedKey: INSIDE_SEED_KEYS.bookingFee,
      kind: INSIDE_SEED_KEYS.bookingFee,
      rate: bookingPerPayer,
      rateUnit: 'per_payer',
      usedFactors: false,
    })
  }
  if (ccPct != null) {
    specs.push({
      seedKey: INSIDE_SEED_KEYS.ccFee,
      kind: INSIDE_SEED_KEYS.ccFee,
      rate: ccPct,
      rateUnit: 'pct_gross',
      usedFactors: false,
    })
  }
  if (ticketingPct != null) {
    specs.push({
      seedKey: INSIDE_SEED_KEYS.ticketingInside,
      kind: INSIDE_SEED_KEYS.ticketingInside,
      rate: ticketingPct,
      rateUnit: 'pct_gross',
      usedFactors: false,
    })
  }
  if (opts.includeComp !== false && compRate != null) {
    specs.push({
      seedKey: INSIDE_SEED_KEYS.compTickets,
      kind: INSIDE_SEED_KEYS.compTickets,
      rate: compRate,
      rateUnit: 'per_payer',
      usedFactors: false,
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
    notes: opts.notes ?? (opts.spec ? insideLineNotes(kind, 'operator') : insideLineNotes(kind === 'custom' ? 'custom' : kind, 'operator')),
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

/**
 * Seed Inside Fees for a show.
 * Contract / Harbour Draft known lines → Confirmed entries.
 * Otherwise empty (operator adds). Never Factors or silent $ defaults.
 */
export function seedStandardInsideEntries(opts: {
  payerCount?: number
  grossTicketSales?: number
  tombstonedSeedKeys?: Iterable<string>
  contractLines?: KnownInsideLine[] | null
  showId?: string | null
  bookingFeePerPayer?: number | null
  ccFeePct?: number | null
  ticketingInsidePct?: number | null
  includeComp?: boolean
  compRatePerPayer?: number | null
}): CostEntry[] {
  const known = knownInsideSeedLines(opts.contractLines, opts.showId)
  if (known.length) {
    return applyContractKnownInsideEntries({
      existing: [],
      contractLines: known,
      tombstonedSeedKeys: opts.tombstonedSeedKeys,
    }).entries
  }

  const blocked = new Set(
    [...(opts.tombstonedSeedKeys ?? [])].map(k => String(k).trim()).filter(Boolean),
  )
  const base = {
    payerCount: opts.payerCount ?? 0,
    grossTicketSales: opts.grossTicketSales ?? 0,
  }
  return standardInsideSpecs({
    bookingFeePerPayer: opts.bookingFeePerPayer,
    ccFeePct: opts.ccFeePct,
    ticketingInsidePct: opts.ticketingInsidePct,
    includeComp: opts.includeComp,
    compRatePerPayer: opts.compRatePerPayer,
  })
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
    notes: opts.notes ?? insideLineNotes('custom', 'operator'),
    rate: null,
    rateUnit: null,
    seedKey: null,
  })
}

export function isContractKnownInsideSource(source: string | null | undefined): boolean {
  return String(source ?? '').trim().toLowerCase() === 'contract'
}

export function isHarbourDraftInsideSource(source: string | null | undefined): boolean {
  const s = String(source ?? '').trim().toLowerCase()
  return s === 'harbour_draft' || s === 'draft'
}

export function isKnownInsideSeedSource(source: string | null | undefined): boolean {
  return isContractKnownInsideSource(source) || isHarbourDraftInsideSource(source)
}

export function contractKnownInsideLines(
  lines: KnownInsideLine[] | null | undefined,
  showId?: string | null,
): KnownInsideLine[] {
  return knownInsideSeedLines(lines, showId).filter(l => isContractKnownInsideSource(l.source))
}

/** Contract and/or Harbour Draft insides that may Confirm Costings/Advancing. */
export function knownInsideSeedLines(
  lines: KnownInsideLine[] | null | undefined,
  showId?: string | null,
): KnownInsideLine[] {
  return (lines ?? []).filter(line => {
    if (!isKnownInsideSeedSource(line.source)) return false
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
          notes: prev.notes || insideLineNotes(kind, isHarbourDraftInsideSource(line.source) ? 'harbour_draft' : 'contract'),
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
      notes: insideLineNotes(kind, isHarbourDraftInsideSource(line.source) ? 'harbour_draft' : 'contract'),
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

export function emptyInsideBreakdown(sourceLabel = 'empty — add Inside Fees or seed from contract / Harbour Draft'): InsideBreakdown {
  return {
    bookingFee: 0,
    ccFee: 0,
    ticketingInside: 0,
    namedInside: 0,
    total: 0,
    source: 'estimated',
    sourceLabel,
  }
}

/**
 * Costings / Advancing waterfall insides.
 * Prefer itemised lines (live-recalc). Never let settlement remittance overwrite.
 * Empty / missing lines stay $0 — no Factors or silent-default fallback.
 */
export function resolveSheetInsideCosts(opts: {
  grossTicketSales: number
  payerCount: number
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
        ? 'known — contract / Harbour Draft / Confirmed lines'
        : 'estimated — itemised Inside fee lines (not known)',
    )
  }

  const knownLines = knownInsideSeedLines(opts.contractLines, opts.showId)
  if (knownLines.length) {
    const applied = applyContractKnownInsideEntries({ existing: [], contractLines: knownLines })
    const draft = knownLines.some(l => isHarbourDraftInsideSource(l.source))
    return insideBreakdownFromEntries(
      applied.entries,
      'known',
      draft && !knownLines.every(l => isContractKnownInsideSource(l.source))
        ? 'known — Harbour Draft'
        : 'known — contract',
    )
  }

  return emptyInsideBreakdown()
}

/**
 * Run Costing owner P&L — Gareth LOCKED math (staging).
 *
 * HARD:
 *   commissionable = gross − inside
 *   harbour        = 0.10 × commissionable  (never editable; ignore Factors harbour_agency_pct)
 *   net_revenue    = commissionable − harbour
 *
 * Dual-model silent insides (Finance staging):
 *   inside ≈ booking_fee_per_payer × payers + cc_fee_pct% × gross
 *   booking_fee_per_payer = 4.50 (Ticketing/Inside Costs, estimated)
 *   cc_fee_pct            = 1.0  (Revenue — READ, do not bump to 1.6)
 *   Do NOT use $5/payer alone as the primary path.
 *
 * `inside_cc_fee_pct` is an optional later stub. Do not require a seed.
 * Auto-calc does not read it until Lead/Gareth decide.
 *
 * Factors = estimated only. Remittance / contract known wins.
 * Never mark known from a Factor alone. Never treat historic 7.3% as known.
 */

export const HARBOUR_COMMISSION_RATE = 0.10
export const OWNER_RESERVE_RATE = 0.20

/** Revenue-category Factor — READ for silent insides. Do not change its stored value. */
export const REVENUE_CC_FEE_PCT_KEY = 'cc_fee_pct'

export const INSIDE_FACTOR_KEYS = {
  bookingFeePerPayer: 'booking_fee_per_payer',
  /** Optional later stub — unused until Lead/Gareth decide. */
  insideCcFeePct: 'inside_cc_fee_pct',
  ticketingInsidePct: 'ticketing_inside_pct',
} as const

export const INSIDE_FACTOR_CATEGORY = 'Ticketing/Inside Costs'
export const INSIDE_FACTOR_CATEGORY_ALIASES = [
  'Ticketing/Inside Costs',
  'Ticketing / Inside Costs',
] as const

export const DEFAULT_BOOKING_FEE_PER_PAYER = 4.5
/** Staging Revenue `cc_fee_pct`. Do not bump to 1.6. */
export const DEFAULT_CC_FEE_PCT = 1.0
/** Rejected alternate — never the primary silent path. */
export const ALTERNATE_BOOKING_FEE_PER_PAYER_ALONE = 5

/** Revenue / auto-calc keys — FIGURES NEEDED here does not lock sliders. */
export const PNL_UNLOCK_EXCLUDED_FIELD_KEYS = new Set(['social_ads_var', 'gross_box_office'])
export const REVENUE_FIELD_KEYS = new Set(['gross_box_office'])

export type InsideFactors = {
  booking_fee_per_payer: number
  /** Revenue `cc_fee_pct` — whole percent (1.0 = 1.0%). Used for silent insides. */
  cc_fee_pct: number
  /**
   * Optional later stub. Parsed if present but NOT used for auto-calc
   * until Lead/Gareth decide a separate insides CC rate.
   */
  inside_cc_fee_pct: number | null
  /** Optional later stub. Null / 0 = unused. */
  ticketing_inside_pct: number | null
}

export type RevenueWaterfall = {
  gross: number
  inside: number
  commissionable: number
  harbour: number
  netRevenue: number
}

export type PnlSummary = {
  netRevenue: number
  totalCosts: number
  netPl: number
  reserve: number
  preDistMargin: number
}

export type InsideSource = 'known' | 'factors'

export type UnlockField = {
  field_key: string
  category?: string | null
  state: string | null | undefined
  label?: string | null
  showLabel?: string | null
  /** All payable lines on the section are PAID — unlocks even if state is still pending. */
  paidAll?: boolean
}

const FIGURES_NEEDED_STATES = new Set(['pending', 'figures_needed'])

export function normalizeFactorCategory(category: string): string {
  if (INSIDE_FACTOR_CATEGORY_ALIASES.includes(category as (typeof INSIDE_FACTOR_CATEGORY_ALIASES)[number])) {
    return INSIDE_FACTOR_CATEGORY
  }
  return category
}

export function parseFactorNumber(value: unknown): number | null {
  if (value == null || value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

export function parseInsideFactors(
  rows: Array<{ key?: string | null; value?: unknown } | null | undefined> | null | undefined,
): InsideFactors {
  const map = new Map<string, number>()
  for (const row of rows ?? []) {
    if (!row?.key) continue
    const n = parseFactorNumber(row.value)
    if (n == null) continue
    map.set(row.key, n)
  }
  const ticketing = map.get(INSIDE_FACTOR_KEYS.ticketingInsidePct)
  const insideCc = map.get(INSIDE_FACTOR_KEYS.insideCcFeePct)
  return {
    booking_fee_per_payer: map.get(INSIDE_FACTOR_KEYS.bookingFeePerPayer) ?? DEFAULT_BOOKING_FEE_PER_PAYER,
    cc_fee_pct: map.get(REVENUE_CC_FEE_PCT_KEY) ?? DEFAULT_CC_FEE_PCT,
    inside_cc_fee_pct: insideCc != null && insideCc !== 0 ? insideCc : null,
    ticketing_inside_pct: ticketing != null && ticketing !== 0 ? ticketing : null,
  }
}

/**
 * Silent estimated insides — dual model only.
 * inside ≈ booking_fee_per_payer × payers + cc_fee_pct% × gross
 * Does not use $5/payer alone. Does not read `inside_cc_fee_pct`.
 */
export function silentInsideDefault(opts: {
  gross: number
  payers: number
  factors?: Partial<InsideFactors> | null
}): number {
  const booking = opts.factors?.booking_fee_per_payer ?? DEFAULT_BOOKING_FEE_PER_PAYER
  const ccPct = opts.factors?.cc_fee_pct ?? DEFAULT_CC_FEE_PCT
  const ticketingPct = opts.factors?.ticketing_inside_pct ?? null
  const gross = Number(opts.gross) || 0
  const payers = Math.max(0, Number(opts.payers) || 0)
  const bookingAmt = booking * payers
  const ccAmt = (ccPct / 100) * gross
  const ticketingAmt = ticketingPct != null ? (ticketingPct / 100) * gross : 0
  return roundCents(bookingAmt + ccAmt + ticketingAmt)
}

export function resolveInside(opts: {
  gross: number
  payers: number
  factors?: Partial<InsideFactors> | null
  /** Remittance / contract known insides. Null = silent (use Factors). */
  knownInside?: number | null
}): { inside: number; source: InsideSource } {
  if (opts.knownInside != null && Number.isFinite(opts.knownInside)) {
    return { inside: roundCents(Math.max(0, opts.knownInside)), source: 'known' }
  }
  return {
    inside: Math.max(0, silentInsideDefault(opts)),
    source: 'factors',
  }
}

export function revenueWaterfall(gross: number, inside: number): RevenueWaterfall {
  const g = roundCents(Math.max(0, Number(gross) || 0))
  const i = roundCents(Math.max(0, Number(inside) || 0))
  const commissionable = roundCents(Math.max(0, g - i))
  const harbour = roundCents(commissionable * HARBOUR_COMMISSION_RATE)
  const netRevenue = roundCents(commissionable - harbour)
  return { gross: g, inside: i, commissionable, harbour, netRevenue }
}

export function pnlSummary(netRevenue: number, totalCosts: number): PnlSummary {
  const nr = roundCents(Number(netRevenue) || 0)
  const costs = roundCents(Number(totalCosts) || 0)
  const netPl = roundCents(nr - costs)
  const reserve = roundCents(Math.max(0, netPl) * OWNER_RESERVE_RATE)
  const preDistMargin = roundCents(netPl - reserve)
  return { netRevenue: nr, totalCosts: costs, netPl, reserve, preDistMargin }
}

export function roundCents(value: number): number {
  return Math.round((Number(value) || 0) * 100) / 100
}

export function isFiguresNeededState(state: string | null | undefined): boolean {
  return FIGURES_NEEDED_STATES.has(String(state ?? '').trim().toLowerCase())
}

export function isRevenueUnlockExempt(fieldKey: string, category?: string | null): boolean {
  if (PNL_UNLOCK_EXCLUDED_FIELD_KEYS.has(fieldKey)) return true
  if (REVENUE_FIELD_KEYS.has(fieldKey)) return true
  return String(category ?? '').trim().toLowerCase() === 'revenue'
}

/**
 * Sliders unlock when no *cost* lines are FIGURES NEEDED.
 * ESTIMATE / GUESS / CONFIRMED / PAID / AUTO CALC are OK.
 * Ignore FIGURES NEEDED on Gross Box Office / revenue — sliders supply revenue.
 */
export function sliderUnlock(fields: UnlockField[]): { unlocked: boolean; blocking: string[] } {
  const blocking: string[] = []
  for (const field of fields) {
    if (isRevenueUnlockExempt(field.field_key, field.category)) continue
    if (field.paidAll) continue
    if (!isFiguresNeededState(field.state)) continue
    const label = (field.label ?? field.field_key).trim()
    const show = (field.showLabel ?? '').trim()
    blocking.push(show ? `${show} – ${label}` : label)
  }
  return { unlocked: blocking.length === 0, blocking }
}

/** Owner / admin only. Preview-as production/crew/external must hide top+bottom. */
export function canSeeOwnerPnlSheet(role: string | undefined | null): boolean {
  return role === 'owner' || role === 'admin'
}

/**
 * Inside (pre-commission) vs outside (after 10%) placement.
 * Outside wins on LPA / EIS / APRA / BO setup / ticketing build / admin / printing.
 */
export function classifyInsidePlacement(
  description?: string | null,
  notes?: string | null,
): 'inside' | 'outside' {
  const text = `${description ?? ''} ${notes ?? ''}`.trim()
  if (!text) return 'outside'

  if (OUTSIDE_LOCKED_RE.test(text)) return 'outside'
  if (INSIDE_YES_RE.test(text)) return 'inside'
  return 'outside'
}

const INSIDE_YES_RE =
  /\b(booking\s*fees?|credit\s*card|cc\s*fees?|merchant(?:\s*fees?)?|processing\s*fees?|card\s*(?:process(?:ing)?|fees?)|inside\s*(?:fees?|costs?|ticketing)|(?:box\s*office|bo)\s*ticketing\s*fees?|ticketing\s*fees?|comp(?:limentary)?\s*ticket(?:ing)?\s*fees?)\b/i

const OUTSIDE_LOCKED_RE =
  /\b(venue\s*hire|hire\b|staff(?:ing)?|usher|security|production|marketing|catering|merch(?:andise)?|lpa|eis|apra|one\s*music|onemusic|box\s*office\s*setup|bo\s*setup|ticketing\s*build|ticketing\s*admin|print(?:ing)?)\b/i

export type KnownInsideLine = {
  description?: string | null
  notes?: string | null
  amount?: number | null
  line_type?: string | null
  /** When false, skip (e.g. remittance payment vs deduction). Default true for contract lines. */
  count?: boolean
}

/**
 * Sum remittance / contract lines that are insides.
 * Does not invent amounts. Returns null when no matching lines (caller uses Factors).
 */
export function sumKnownInside(lines: KnownInsideLine[] | null | undefined): number | null {
  if (!lines?.length) return null
  let found = false
  let sum = 0
  for (const line of lines) {
    if (line.count === false) continue
    if (classifyInsidePlacement(line.description, line.notes) !== 'inside') continue
    found = true
    sum += Math.abs(Number(line.amount) || 0)
  }
  return found ? roundCents(sum) : null
}

/** Remittance deductions / adjustments that look like insides. Payments are not insides. */
export function remittanceLineCountsAsKnownInside(line: {
  line_type?: string | null
  description?: string | null
  notes?: string | null
}): boolean {
  const type = String(line.line_type ?? '').toLowerCase()
  if (type !== 'deduction' && type !== 'adjustment') return false
  return classifyInsidePlacement(line.description, line.notes) === 'inside'
}

export function knownInsideFromRemittance(
  lines: Array<{
    show_id?: string | null
    line_type?: string | null
    description?: string | null
    notes?: string | null
    amount?: number | null
  }> | null | undefined,
  showId?: string | null,
): number | null {
  const scoped = (lines ?? []).filter(line => {
    if (showId != null && line.show_id != null && line.show_id !== showId) return false
    return remittanceLineCountsAsKnownInside(line)
  })
  return sumKnownInside(scoped.map(line => ({ ...line, count: true })))
}

export const INSIDE_FACTOR_SEED = [
  {
    key: INSIDE_FACTOR_KEYS.bookingFeePerPayer,
    label: 'Booking fee (per payer)',
    category: INSIDE_FACTOR_CATEGORY,
    value: DEFAULT_BOOKING_FEE_PER_PAYER,
    unit: '$/payer',
    description:
      'Silent estimated default for P&L insides when remittance/contract silent. Dual model with Revenue cc_fee_pct. Venue override OK. Remittance/contract known wins. Never known from this Factor alone.',
  },
] as const

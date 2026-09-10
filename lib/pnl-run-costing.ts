/**
 * P&L → Run Costing merge (Gareth LOCKED, staging).
 *
 * HARD math:
 *   commissionable = gross_ticket_sales − inside_costs
 *   harbour_commission = 0.10 × commissionable   // never editable
 *   net_revenue = commissionable − harbour_commission
 *
 * Margin sheet (ex-GST):
 *   remittance/net → GST quarantine (not QF money) → 20% reserve on ex-GST
 *   → Pre-Distribution Margin → owner split 40/30/30 (Gareth/Brad/Scott)
 *   Never invent GST rates (no NZ 15% / AU 10% / 1/11). Stored GST only.
 *
 * Inside (pre-commission) YES: booking fees, CC/merchant/processing,
 * named inside/ticketing/BO ticketing fees, comp ticketing fees.
 * Outside (NOT deducted before 10%): hire/staff/production/marketing/catering/merch,
 * LPA/EIS/APRA, BO setup/ticketing build/admin/printing.
 *
 * Factors are estimated silent defaults only. Remittance/contract known wins.
 * NEVER invent known insides. NEVER treat hist 7.3% as known.
 */

export const HARBOUR_COMMISSION_RATE = 0.10 as const

export const INSIDE_FACTOR_KEYS = {
  bookingFeePerPayer: 'booking_fee_per_payer',
  ccFeePct: 'cc_fee_pct',
  /** Staging alias already seeded under Ticketing / Inside Costs. */
  insideCcFeePct: 'inside_cc_fee_pct',
  ticketingInsidePct: 'ticketing_inside_pct',
} as const

export const INSIDE_FACTORS_CATEGORY = 'Ticketing / Inside Costs'

/** Silent defaults when remittance/contract and Factors are silent. Estimated only. */
export const SILENT_BOOKING_FEE_PER_PAYER = 4.5
export const SILENT_CC_FEE_PCT = 1.6
export const SILENT_BUNDLED_PER_PAYER = 5

export const REVENUE_FIELD_KEYS = new Set(['gross_box_office'])

export const FIGURES_NEEDED_STATES = new Set(['pending', 'figures_needed'])

export const UNLOCK_OK_STATES = new Set(['estimated', 'guess', 'known', 'auto_calc'])

export type InsideSource = 'known' | 'estimated'

export type InsideBreakdown = {
  bookingFee: number
  ccFee: number
  ticketingInside: number
  namedInside: number
  total: number
  source: InsideSource
  /** Human label for UI — never claims "known" unless remittance/contract supplied the figure. */
  sourceLabel: string
}

export type PnlVenueWaterfall = {
  grossTicketSales: number
  inside: InsideBreakdown
  commissionable: number
  harbourCommission: number
  netRevenue: number
}

export type GstQuarantineSource = 'known' | 'missing'

export type OwnerSplits = {
  gareth: number
  brad: number
  scott: number
}

export type PnlSummary = {
  netRevenue: number
  totalCosts: number
  netProfit: number
  /** Stored GST held aside. 0 when the source is missing — residual may still include GST. */
  gstQuarantine: number
  gstKnown: boolean
  gstSource: GstQuarantineSource
  gstSourceLabel: string
  /** netProfit − quarantined GST. Honest residual when GST is missing (not invented). */
  exGstProfit: number
  reserve: number
  preDistMargin: number
  ownerSplits: OwnerSplits
}

export type InsideFactorValues = {
  bookingFeePerPayer?: number | null
  ccFeePct?: number | null
  ticketingInsidePct?: number | null
}

export type VenueInsideOverride = {
  bookingFeePerPayer?: number | null
  ccFeePct?: number | null
}

export type KnownInsideLine = {
  showId?: string | null
  description: string
  amount: number
}

export type KnownGstLine = {
  showId?: string | null
  description: string
  amount: number
}

/** 20% owner reserve — applied after GST quarantine, on the ex-GST residual. */
export const PNL_RESERVE_RATE = 0.20 as const

/** Owner split of Pre-Distribution Margin (Gareth / Brad / Scott). */
export const OWNER_SPLIT = {
  gareth: 0.40,
  brad: 0.30,
  scott: 0.30,
} as const

export const GST_QUARANTINE_LABEL = 'GST quarantine (not QF money — quarantined)'
export const GST_QUARANTINE_MISSING_LABEL = 'GST quarantine (missing — not QF money; residual may still include GST)'
export const GST_QUARANTINE_KNOWN_NOTE = 'known — remittance / settlement (not QF money)'
export const GST_QUARANTINE_MISSING_NOTE =
  'GST amount not on remittance/settlement — residual may still include GST. No NZ 15% or AU 10% invented.'
export const RESERVE_EX_GST_LABEL = '− 20% Reserve (ex-GST)'
export const GST_QUARANTINE_KEY = 'gst_quarantine'

export type CostLineForUnlock = {
  fieldKey: string
  category?: string | null
  state: string | null | undefined
  /** True when every payable line on the section is PAID. */
  allPaid?: boolean
}

/** Owner/admin only — matches existing profile roles (Gareth, Brad, Scott). */
export function canSeeOwnerPnl(role: string | undefined | null): boolean {
  return role === 'owner' || role === 'admin'
}

export function isRevenueFieldKey(fieldKey: string | null | undefined): boolean {
  return fieldKey != null && REVENUE_FIELD_KEYS.has(fieldKey)
}

export function isFiguresNeededState(state: string | null | undefined): boolean {
  return FIGURES_NEEDED_STATES.has(String(state ?? ''))
}

export function roundMoney(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100
}

export function computeHarbourCommission(commissionable: number): number {
  return roundMoney(HARBOUR_COMMISSION_RATE * (Number(commissionable) || 0))
}

export function computeVenueWaterfall(opts: {
  grossTicketSales: number
  insideTotal: number
}): PnlVenueWaterfall {
  const gross = roundMoney(opts.grossTicketSales)
  const insideTotal = roundMoney(opts.insideTotal)
  const commissionable = roundMoney(gross - insideTotal)
  const harbourCommission = computeHarbourCommission(commissionable)
  const netRevenue = roundMoney(commissionable - harbourCommission)
  return {
    grossTicketSales: gross,
    inside: {
      bookingFee: 0,
      ccFee: 0,
      ticketingInside: 0,
      namedInside: insideTotal,
      total: insideTotal,
      source: 'estimated',
      sourceLabel: 'estimated',
    },
    commissionable,
    harbourCommission,
    netRevenue,
  }
}

/**
 * Classify a remittance / agent-statement line as a stored GST amount.
 * Matches GST / GST collected / GST payable — never "inc GST" cost notes.
 * Does not invent a rate.
 */
export function lineLooksLikeKnownGst(description: string | null | undefined): boolean {
  const text = String(description ?? '').trim()
  if (!text) return false
  if (!/\bgst\b/i.test(text)) return false
  if (/\b(?:inc(?:luded|l)?|including|ex(?:cl(?:uded)?)?|excluding)\b/i.test(text)) return false
  return true
}

export function resolveKnownGst(opts: {
  knownGst?: number | null
  lines?: KnownGstLine[] | null
  showId?: string | null
}): { amount: number | null; source: GstQuarantineSource; sourceLabel: string } {
  if (opts.knownGst != null && Number.isFinite(Number(opts.knownGst))) {
    return {
      amount: roundMoney(Number(opts.knownGst)),
      source: 'known',
      sourceLabel: GST_QUARANTINE_KNOWN_NOTE,
    }
  }
  const lines = (opts.lines ?? []).filter(line => {
    if (!lineLooksLikeKnownGst(line.description)) return false
    if (opts.showId && (line.showId ?? null) !== opts.showId) return false
    return true
  })
  if (!lines.length) {
    return { amount: null, source: 'missing', sourceLabel: GST_QUARANTINE_MISSING_NOTE }
  }
  return {
    amount: roundMoney(lines.reduce((sum, line) => sum + (Number(line.amount) || 0), 0)),
    source: 'known',
    sourceLabel: GST_QUARANTINE_KNOWN_NOTE,
  }
}

export function gstQuarantineLineLabel(gstKnown: boolean): string {
  return gstKnown ? GST_QUARANTINE_LABEL : GST_QUARANTINE_MISSING_LABEL
}

export function computeOwnerSplits(preDistMargin: number): OwnerSplits {
  const preDist = roundMoney(preDistMargin)
  if (preDist <= 0) return { gareth: 0, brad: 0, scott: 0 }
  const gareth = roundMoney(preDist * OWNER_SPLIT.gareth)
  const brad = roundMoney(preDist * OWNER_SPLIT.brad)
  const scott = roundMoney(preDist - gareth - brad)
  return { gareth, brad, scott }
}

/**
 * Locked Settlements / owner P&L order (Gareth):
 *   remittance/net → GST quarantine → 20% reserve (ex-GST) → Pre-Distribution Margin
 *   → owner split 40/30/30 (Gareth/Brad/Scott)
 *
 * GST is not QF money. Use stored/known GST only — never invent NZ 15% or AU 10%.
 * Missing GST quarantines 0 and leaves an honest residual that may still include GST.
 */
export function computePnlSummary(opts: {
  netRevenue: number
  totalCosts: number
  /** Explicit stored GST amount. 0 is known-zero; omit/null means resolve from lines or missing. */
  knownGst?: number | null
  remittanceLines?: KnownGstLine[] | null
  showId?: string | null
}): PnlSummary {
  const netRevenue = roundMoney(opts.netRevenue)
  const totalCosts = roundMoney(opts.totalCosts)
  const netProfit = roundMoney(netRevenue - totalCosts)
  const gst = resolveKnownGst({
    knownGst: opts.knownGst,
    lines: opts.remittanceLines,
    showId: opts.showId,
  })
  const gstQuarantine = gst.amount ?? 0
  const exGstProfit = roundMoney(netProfit - gstQuarantine)
  const reserve = roundMoney(Math.max(0, exGstProfit) * PNL_RESERVE_RATE)
  const preDistMargin = roundMoney(exGstProfit - reserve)
  return {
    netRevenue,
    totalCosts,
    netProfit,
    gstQuarantine,
    gstKnown: gst.source === 'known',
    gstSource: gst.source,
    gstSourceLabel: gst.sourceLabel,
    exGstProfit,
    reserve,
    preDistMargin,
    ownerSplits: computeOwnerSplits(preDistMargin),
  }
}

/**
 * Slider unlock: no cost lines are FIGURES NEEDED.
 * ESTIMATE / GUESS / CONFIRMED / PAID / AUTO CALC are OK.
 * Ignore FIGURES NEEDED on Gross Box Office / revenue fields — sliders supply revenue.
 */
export function pnlSlidersUnlocked(lines: CostLineForUnlock[]): {
  unlocked: boolean
  blocking: CostLineForUnlock[]
} {
  const blocking = lines.filter(line => {
    if (isRevenueFieldKey(line.fieldKey)) return false
    if (String(line.category ?? '').toLowerCase() === 'revenue') return false
    if (line.allPaid) return false
    if (UNLOCK_OK_STATES.has(String(line.state ?? ''))) return false
    return isFiguresNeededState(line.state)
  })
  return { unlocked: blocking.length === 0, blocking }
}

/** Outside commission — never deducted before Harbour 10%. */
const OUTSIDE_RE =
  /\b(venue\s*hire|hire\b|staff|usher|security|production|marketing|catering|merch(?:andise)?|lpa|eis|apra|onemusic|one\s*music|performing\s*rights|bo\s*setup|box[\s-]*office\s*setup|ticketing\s*build|ticketing\s*admin|printing|admin\s*fee)\b/i

const INSIDE_RE =
  /\b(booking\s*fee|credit\s*card|cc\s*fee|merchant|processing|inside\s*(cost|fee)|ticketing\s*fee|bo\s*ticketing|box[\s-]*office\s*ticketing|comp\s*ticket)/i

const CC_SPLIT_RE = /\b(credit\s*card|cc\s*fee|merchant|processing)\b/i

/**
 * Classify a remittance/contract line as inside (pre-commission) or outside.
 * LPA/EIS/APRA/BO setup are OUT even if the label also says ticketing.
 */
export function classifyInsidePlacement(description: string | null | undefined): 'inside' | 'outside' | 'unknown' {
  const text = String(description ?? '')
  if (!text.trim()) return 'unknown'
  if (OUTSIDE_RE.test(text)) return 'outside'
  if (INSIDE_RE.test(text)) return 'inside'
  return 'unknown'
}

export function lineLooksLikeCcSplit(description: string | null | undefined): boolean {
  return CC_SPLIT_RE.test(String(description ?? ''))
}

export function parseFactorNumber(raw: unknown): number | null {
  if (raw == null || raw === '') return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

/**
 * Resolve inside costs for one venue.
 * remittance/contract known → known wins.
 * Else Factors / venue override → estimated silent default.
 * Else $4.50/payer + 1.6% CC, or $5.00/payer if no CC split history.
 */
export function resolveInsideCosts(opts: {
  grossTicketSales: number
  payerCount: number
  factors?: InsideFactorValues | null
  venueOverride?: VenueInsideOverride | null
  remittanceKnownTotal?: number | null
  remittanceKnownLines?: KnownInsideLine[] | null
  hasCcSplitHistory?: boolean
}): InsideBreakdown {
  const gross = Math.max(0, Number(opts.grossTicketSales) || 0)
  const payers = Math.max(0, Number(opts.payerCount) || 0)

  const remittanceTotal = sumKnownInside(opts.remittanceKnownTotal, opts.remittanceKnownLines)
  if (remittanceTotal != null) {
    return {
      bookingFee: 0,
      ccFee: 0,
      ticketingInside: 0,
      namedInside: remittanceTotal,
      total: remittanceTotal,
      source: 'known',
      sourceLabel: 'known — remittance / contract',
    }
  }

  const bookingPerPayer = firstNumber(
    opts.venueOverride?.bookingFeePerPayer,
    opts.factors?.bookingFeePerPayer,
  )
  const ccPct = firstNumber(
    opts.venueOverride?.ccFeePct,
    opts.factors?.ccFeePct,
  )
  const ticketingPct = firstNumber(opts.factors?.ticketingInsidePct)

  const hasCcSplit = Boolean(opts.hasCcSplitHistory) || ccPct != null
  const usedFactors = bookingPerPayer != null || ccPct != null || ticketingPct != null

  let bookingFee = 0
  let ccFee = 0
  let ticketingInside = 0

  if (hasCcSplit) {
    bookingFee = roundMoney(payers * (bookingPerPayer ?? SILENT_BOOKING_FEE_PER_PAYER))
    ccFee = roundMoney(gross * ((ccPct ?? SILENT_CC_FEE_PCT) / 100))
  } else {
    bookingFee = roundMoney(payers * (bookingPerPayer ?? SILENT_BUNDLED_PER_PAYER))
    ccFee = 0
  }

  if (ticketingPct != null) {
    ticketingInside = roundMoney(gross * (ticketingPct / 100))
  }

  const total = roundMoney(bookingFee + ccFee + ticketingInside)
  return {
    bookingFee,
    ccFee,
    ticketingInside,
    namedInside: 0,
    total,
    source: 'estimated',
    sourceLabel: usedFactors
      ? 'estimated — Factors / venue override (not known)'
      : 'estimated — silent default (not known)',
  }
}

function firstNumber(...vals: Array<number | null | undefined>): number | null {
  for (const v of vals) {
    if (v != null && Number.isFinite(Number(v))) return Number(v)
  }
  return null
}

function sumKnownInside(
  total: number | null | undefined,
  lines: KnownInsideLine[] | null | undefined,
): number | null {
  if (total != null && Number.isFinite(Number(total))) return roundMoney(Number(total))
  if (!lines?.length) return null
  const inside = lines.filter(l => classifyInsidePlacement(l.description) === 'inside')
  if (!inside.length) return null
  return roundMoney(inside.reduce((s, l) => s + Math.abs(Number(l.amount) || 0), 0))
}

/** Map run_factors rows → inside factor values. Ticketing category wins over Revenue for CC. */
export function insideFactorsFromRows(
  rows: Array<{ key: string; value: unknown; category?: string | null }>,
): InsideFactorValues {
  const byKey = new Map<string, { value: number | null; category: string }>()
  for (const row of rows) {
    byKey.set(row.key, {
      value: parseFactorNumber(row.value),
      category: String(row.category ?? ''),
    })
  }

  const booking = byKey.get(INSIDE_FACTOR_KEYS.bookingFeePerPayer)?.value ?? null

  const ticketingCc = [...byKey.entries()].find(([key, row]) => {
    const ticketing = /ticketing|inside/i.test(row.category)
    return ticketing && (key === INSIDE_FACTOR_KEYS.ccFeePct || key === INSIDE_FACTOR_KEYS.insideCcFeePct)
  })?.[1]?.value

  const anyCc =
    ticketingCc ??
    byKey.get(INSIDE_FACTOR_KEYS.insideCcFeePct)?.value ??
    byKey.get(INSIDE_FACTOR_KEYS.ccFeePct)?.value ??
    null

  const ticketingInside = byKey.get(INSIDE_FACTOR_KEYS.ticketingInsidePct)?.value ?? null

  return {
    bookingFeePerPayer: booking,
    ccFeePct: anyCc,
    ticketingInsidePct: ticketingInside,
  }
}

export function knownInsideForShow(
  lines: KnownInsideLine[] | null | undefined,
  showId: string,
): number | null {
  if (!lines?.length) return null
  const matched = lines.filter(l => (l.showId ?? null) === showId && classifyInsidePlacement(l.description) === 'inside')
  if (!matched.length) return null
  return roundMoney(matched.reduce((s, l) => s + Math.abs(Number(l.amount) || 0), 0))
}

export function remittanceHasCcSplit(
  lines: KnownInsideLine[] | null | undefined,
  showId?: string,
): boolean {
  if (!lines?.length) return false
  return lines.some(l => {
    if (showId && (l.showId ?? null) !== showId) return false
    return lineLooksLikeCcSplit(l.description)
  })
}

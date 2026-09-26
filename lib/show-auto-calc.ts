/**
 * Wave A show-level AUTO-CALC: Music Rights + Daniel Champagne.
 *
 * Music Rights base (documented for PR + coordinators):
 *   tickets × ticket_price
 *   tickets = shows.tickets_sold when set,
 *             else round(capacity × sell_through_pct / 100)
 *   This is modelled gross admission (tickets × price), not Harbour remittance
 *   net and not capacity×price at 100% unless sell-through is 100.
 *
 *   amount = tickets × ticket_price × (pct / 100)
 *   pct    = show-local cost_fields.line_pct (Wave B2). Factors
 *            music_rights_pct seeds unbooked lines only and is never
 *            written back from a line edit.
 *
 * AU % may be empty → FIGURES_NEEDED (pending). A missing ticket price is
 * the same state: amount is null (not $0) and it adds nothing to totals.
 * NZ 2% is known in the world but is never invented here — never copy
 * retired apra_pct.
 *
 * Daniel Champagne:
 *   amount = tickets × daniel_champagne_per_ticket
 *   Default Factors $/ticket = 1.10 ($1 + GST). Not the same as FB Ads.
 *
 * FB Ads is per-show and is NOT auto-calc (manual / import later).
 */

export const MUSIC_RIGHTS_FIELD_KEY = 'music_rights' as const
export const DANIEL_CHAMPAGNE_FIELD_KEY = 'daniel_champagne' as const
export const FB_ADS_SHOW_FIELD_KEY = 'fb_ads' as const

export const MUSIC_RIGHTS_FACTOR_KEY = 'music_rights_pct' as const
export const DANIEL_CHAMPAGNE_FACTOR_KEY = 'daniel_champagne_per_ticket' as const

/** $1 + GST. Product default when Factors is silent. */
export const DANIEL_CHAMPAGNE_DEFAULT_PER_TICKET = 1.10

export const MUSIC_RIGHTS_SOURCE =
  'AUTO-CALC · show-local Music Rights % × tickets × ticket_price (modelled gross admission). Factors music_rights_pct seeds unbooked lines only. AU % may be empty (FIGURES NEEDED). Retired apra_pct is never copied.'

export const DANIEL_CHAMPAGNE_SOURCE =
  'AUTO-CALC · Factors daniel_champagne_per_ticket × tickets sold (modelled). Default $1+GST ($1.10) when Factors is silent.'

export const FB_ADS_NOT_AUTO_SOURCE =
  'Per-show Facebook / Social Ads — manual or import later. Not auto-calc from Factors.'

export type AutoCalcShow = {
  capacity?: number | null
  ticket_price?: number | null
  tickets_sold?: number | null
  sell_through_pct?: number | null
}

export function modelledTickets(show: AutoCalcShow, sellThroughPct?: number | null): number {
  const sold = show.tickets_sold
  if (sold != null && Number.isFinite(Number(sold)) && Number(sold) >= 0) {
    return Math.round(Number(sold))
  }
  const cap = show.capacity
  if (cap == null || !Number.isFinite(Number(cap)) || Number(cap) <= 0) return 0
  const pct = sellThroughPct ?? show.sell_through_pct ?? 75
  const n = Number(pct)
  const use = Number.isFinite(n) ? n : 75
  return Math.round(Number(cap) * use / 100)
}

export function roundMoney(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100
}

/** Null when the show has no usable ticket price. 0 is a real price. */
export function musicRightsTicketPrice(show: AutoCalcShow): number | null {
  const raw = show.ticket_price as unknown
  if (raw == null || raw === '') return null
  const n = typeof raw === 'number' ? raw : Number(raw)
  return Number.isFinite(n) ? n : null
}

/**
 * Music Rights AUTO-CALC.
 * Null pct or a missing ticket price → no amount (FIGURES_NEEDED).
 * Never invent AU/NZ splits. Never report $0 as if the price were known.
 */
export function computeMusicRights(opts: {
  show: AutoCalcShow
  musicRightsPct: number | null | undefined
  sellThroughPct?: number | null
}): { amount: number | null; tickets: number; base: number; state: 'auto_calc' | 'pending' } {
  const tickets = modelledTickets(opts.show, opts.sellThroughPct)
  const price = musicRightsTicketPrice(opts.show)
  if (price == null) {
    return { amount: null, tickets, base: 0, state: 'pending' }
  }
  const base = roundMoney(tickets * price)
  const pct = opts.musicRightsPct
  if (pct == null || !Number.isFinite(Number(pct))) {
    return { amount: null, tickets, base, state: 'pending' }
  }
  return {
    amount: roundMoney(base * (Number(pct) / 100)),
    tickets,
    base,
    state: 'auto_calc',
  }
}

export function computeDanielChampagne(opts: {
  show: AutoCalcShow
  perTicket?: number | null
  sellThroughPct?: number | null
}): { amount: number; tickets: number; perTicket: number; state: 'auto_calc' } {
  const tickets = modelledTickets(opts.show, opts.sellThroughPct)
  const perTicket = opts.perTicket != null && Number.isFinite(Number(opts.perTicket))
    ? Number(opts.perTicket)
    : DANIEL_CHAMPAGNE_DEFAULT_PER_TICKET
  return {
    amount: roundMoney(tickets * perTicket),
    tickets,
    perTicket,
    state: 'auto_calc',
  }
}

export function parseOptionalFactor(raw: unknown): number | null {
  if (raw == null || raw === '') return null
  const n = typeof raw === 'number' ? raw : Number(raw)
  return Number.isFinite(n) ? n : null
}

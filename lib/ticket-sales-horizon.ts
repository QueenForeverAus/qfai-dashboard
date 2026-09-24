/**
 * Ticket Sales horizon cut-points. Lead owns these numbers.
 * Near ≤ 16 weeks, Mid through 40 weeks, Far after that.
 * Weeks are calendar days from today (Australia/Sydney date) to the show date.
 */

export const TICKET_SALES_NEAR_MAX_WEEKS = 16
export const TICKET_SALES_MID_MAX_WEEKS = 40

export type TicketSalesHorizon = 'near' | 'mid' | 'far'

export const TICKET_SALES_HORIZON_LABEL: Record<TicketSalesHorizon, string> = {
  near: 'Near',
  mid: 'Mid',
  far: 'Far',
}

function utcDay(iso: string): number | null {
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return null
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

/** Signed calendar days from `today` to `showDate`. Negative when the show has passed. */
export function daysUntilShow(showDate: string, today: string): number | null {
  const from = utcDay(today)
  const to = utcDay(showDate)
  if (from == null || to == null) return null
  return Math.round((to - from) / 86_400_000)
}

export function ticketSalesHorizon(
  showDate: string | null | undefined,
  today: string,
  nearMaxWeeks = TICKET_SALES_NEAR_MAX_WEEKS,
  midMaxWeeks = TICKET_SALES_MID_MAX_WEEKS,
): TicketSalesHorizon | null {
  if (!showDate) return null
  const days = daysUntilShow(showDate, today)
  if (days == null) return null
  if (days <= nearMaxWeeks * 7) return 'near'
  if (days <= midMaxWeeks * 7) return 'mid'
  return 'far'
}

/**
 * Stable show identity shared with Harbour Import Schedule.
 *
 * Import Schedule matches a sheet row to a Portal show by `show_date`
 * (`app/api/admin/import-schedule/route.ts`). Venue comparison uses the same
 * `normVenue` / `sameVenue` rules. Ticket Sales uses that venue test to break
 * date ties (retired demos and real shows can share a date) and does not
 * invent a second normaliser.
 */

import { isCancelledOrRescheduledShow } from './run-list-cancelled.ts'

const STRIP = ['the', 'centre', 'center', 'arts', 'performing', 'entertainment', 'hall', 'theatre', 'theater', 'and']

/** Import Schedule venue key. Keep in lockstep with the historical route helper. */
export function normVenue(s: string): string {
  let n = s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ')
  for (const w of STRIP) n = n.replace(new RegExp(`\\b${w}\\b`, 'g'), ' ')
  return n.replace(/\s+/g, ' ').trim()
}

/** Import Schedule soft venue equality (substring, 60% of the longer key). */
export function sameVenue(a: string, b: string): boolean {
  const n1 = normVenue(a)
  const n2 = normVenue(b)
  if (n1 === n2) return true
  const longer = Math.max(n1.length, n2.length)
  if (longer === 0) return false
  if (n1.includes(n2)) return n2.length / longer >= 0.60
  if (n2.includes(n1)) return n1.length / longer >= 0.60
  return false
}

export function normCity(s: string | null | undefined): string {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function sameCity(a: string | null | undefined, b: string | null | undefined): boolean {
  const n1 = normCity(a)
  const n2 = normCity(b)
  if (!n1 || !n2) return false
  return n1 === n2
}

export type IdentityShow = {
  id: string
  show_date: string | null
  venue_name: string
  venue_city?: string | null
  harbour_status?: string | null
  run_status?: string | null
}

function isMatchCandidate(show: IdentityShow): boolean {
  if (isCancelledOrRescheduledShow(show)) return false
  const venue = show.venue_name.trim().toUpperCase()
  if (!venue || venue === 'TBC' || venue === 'TBA') return false
  return true
}

/**
 * Match one ticket-sales sheet row to a Portal show.
 * Primary key is show_date (Import Schedule). Venue (then city) breaks ties.
 * Retired / TBC / blank venues are not candidates. No match → null (caller lists it as unmatched).
 */
export function matchShowByVenueAndDate(
  sheet: { show_date: string | null; venue_name: string; venue_city?: string | null },
  portalShows: IdentityShow[],
): IdentityShow | null {
  if (!sheet.show_date) return null
  const onDate = portalShows.filter(show => show.show_date === sheet.show_date && isMatchCandidate(show))
  if (onDate.length === 0) return null

  const byVenue = onDate.filter(show => sameVenue(show.venue_name, sheet.venue_name))
  if (byVenue.length === 1) return byVenue[0]!
  if (byVenue.length > 1) {
    const byCity = byVenue.filter(show => sameCity(show.venue_city, sheet.venue_city))
    return byCity.length === 1 ? byCity[0]! : null
  }

  const byCity = onDate.filter(show => sameCity(show.venue_city, sheet.venue_city))
  if (byCity.length === 1) return byCity[0]!

  // Import Schedule's date-only match when the day has a single live show.
  if (onDate.length === 1) return onDate[0]!
  return null
}

/** Stable row identity inside a snapshot. Date + normalised venue. */
export function ticketSalesRowKey(showDate: string | null, venueName: string): string {
  return `${showDate ?? 'undated'}|${normVenue(venueName) || 'venue'}`
}

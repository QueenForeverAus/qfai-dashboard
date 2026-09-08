/**
 * Attach hotel nights to a run via the itinerary window, not show-date ∩ alone.
 *
 * Thornton hard case: Maitland / Thornton the night before the first Newcastle
 * show is still this run. Catchment aliases boost confidence; they are not
 * required when the stay night sits in [firstShow - 1, lastShow].
 */

import { addDaysIso, isIsoDateOnly } from './dates.ts'

export type ReceiptShowLike = {
  id: string
  venue_city: string
  venue_name?: string | null
  show_date: string | null
  show_order?: number | null
  hotel_notes?: string | null
}

/** City / suburb tokens that belong to the same touring catchment. */
export const CITY_CATCHMENTS: Record<string, readonly string[]> = {
  newcastle: ['newcastle', 'maitland', 'thornton', 'hunter', 'hunter valley'],
  tamworth: ['tamworth'],
  'port macquarie': ['port macquarie', 'port o call', 'port ocall', "port o'call"],
}

export function normalizeCityToken(value: string | null | undefined): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/['’]/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function catchmentBucket(value: string | null | undefined): string | null {
  const token = normalizeCityToken(value)
  if (!token) return null
  for (const [bucket, aliases] of Object.entries(CITY_CATCHMENTS)) {
    if (token === bucket || aliases.some(alias => token === alias || token.includes(alias) || alias.includes(token))) {
      return bucket
    }
  }
  return token
}

export function citiesRelated(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = catchmentBucket(a)
  const right = catchmentBucket(b)
  if (!left || !right) return false
  return left === right
}

export function itineraryWindowFromShows(shows: ReceiptShowLike[]): {
  start: string | null
  end: string | null
} {
  const dates = shows
    .map(show => show.show_date)
    .filter((d): d is string => isIsoDateOnly(d))
    .sort()
  if (dates.length === 0) return { start: null, end: null }
  return { start: addDaysIso(dates[0], -1), end: dates[dates.length - 1] }
}

export function dateInInclusiveRange(
  date: string,
  start: string | null,
  end: string | null,
): boolean {
  if (!isIsoDateOnly(date) || !start || !end) return false
  return date >= start && date <= end
}

export function nightsInItineraryWindow(
  nights: string[],
  shows: ReceiptShowLike[],
): { inWindow: string[]; outside: string[]; window: { start: string | null; end: string | null } } {
  const window = itineraryWindowFromShows(shows)
  const inWindow = nights.filter(n => dateInInclusiveRange(n, window.start, window.end))
  const outside = nights.filter(n => !dateInInclusiveRange(n, window.start, window.end))
  return { inWindow, outside, window }
}

/**
 * Attach a stay night to a show.
 * Prefer catchment + (show date = night or night+1), then next show after the night.
 */
export function attachNightToShow(
  night: string,
  locality: string,
  shows: ReceiptShowLike[],
): ReceiptShowLike | null {
  if (!isIsoDateOnly(night) || shows.length === 0) return null
  const nextNight = addDaysIso(night, 1)
  const dated = shows
    .filter(show => isIsoDateOnly(show.show_date))
    .slice()
    .sort((a, b) => String(a.show_date).localeCompare(String(b.show_date)))

  const catchmentHit = dated.find(show =>
    citiesRelated(locality, show.venue_city)
    && (show.show_date === night || show.show_date === nextNight),
  )
  if (catchmentHit) return catchmentHit

  const sameDay = dated.find(show => show.show_date === night)
  if (sameDay) return sameDay

  const nextShow = dated.find(show => String(show.show_date) > night)
  if (nextShow) return nextShow

  const prev = [...dated].reverse().find(show => String(show.show_date) <= night)
  return prev ?? dated[0] ?? shows[0] ?? null
}

export function showLabel(show: ReceiptShowLike | null | undefined): string | null {
  if (!show) return null
  const city = show.venue_city?.trim()
  const venue = show.venue_name?.trim()
  if (city && venue) return `${city} — ${venue}`
  return city || venue || show.id
}

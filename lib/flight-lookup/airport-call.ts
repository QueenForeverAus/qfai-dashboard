/**
 * W4 airport-call auto from dep time + run travel type (staging).
 *
 * G2 (band carry-on / Fly+Van): dep − 60 minutes
 * G3 (all fly / bags / Fly+Local): dep − 110 minutes
 * G1 / unknown: no default — card select stays editable.
 */

import type { RunRegion } from '../types.ts'

export const FLIGHT_TRAVEL_BANDS = ['G2', 'G3'] as const
export type FlightTravelBand = (typeof FLIGHT_TRAVEL_BANDS)[number]

export const AIRPORT_CALL_LEAD_MINUTES: Record<FlightTravelBand, number> = {
  G2: 60,
  G3: 110,
}

export const FLIGHT_TRAVEL_BAND_LABEL: Record<FlightTravelBand, string> = {
  G2: 'G2 · carry-on (−60 min)',
  G3: 'G3 · bags (−110 min)',
}

const TIME_RE = /^(\d{1,2}):(\d{2})(?::\d{2})?$/

export function parseClockMinutes(value: string | null | undefined): number | null {
  const raw = String(value ?? '').trim()
  if (!raw) return null
  const match = TIME_RE.exec(raw)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null
  return hours * 60 + minutes
}

export function formatClockMinutes(total: number): string {
  const normalized = ((total % (24 * 60)) + (24 * 60)) % (24 * 60)
  const hours = Math.floor(normalized / 60)
  const minutes = normalized % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

export function airportCallFromDep(
  depTime: string | null | undefined,
  band: FlightTravelBand | null | undefined,
): string {
  if (!band || !FLIGHT_TRAVEL_BANDS.includes(band)) return ''
  const minutes = parseClockMinutes(depTime)
  if (minutes == null) return ''
  return formatClockMinutes(minutes - AIRPORT_CALL_LEAD_MINUTES[band])
}

export function isFlightTravelBand(value: unknown): value is FlightTravelBand {
  return value === 'G2' || value === 'G3'
}

/** Run region → G2/G3. group1 / junk → null (editable select, no guess). */
export function resolveFlightTravelBand(
  region: string | null | undefined,
): FlightTravelBand | null {
  const key = String(region ?? '').trim().toLowerCase()
  if (key === 'group2' || key === 'g2') return 'G2'
  if (key === 'group3' || key === 'g3') return 'G3'
  return null
}

export function resolveFlightTravelBandFromRegion(
  region: RunRegion | string | null | undefined,
): FlightTravelBand | null {
  return resolveFlightTravelBand(region)
}

/**
 * Recalc airport call when dep / band changes.
 * Never overwrite a manual value (dirty, or current ≠ previous auto).
 * Empty current always accepts the suggestion.
 */
export function nextAirportCall(opts: {
  depTime: string
  band: FlightTravelBand | null
  current: string
  previousDepTime?: string
  previousBand?: FlightTravelBand | null
  dirty?: boolean
}): string {
  const suggested = airportCallFromDep(opts.depTime, opts.band)
  const current = opts.current.trim()
  if (!suggested) return current
  if (!current) return suggested
  if (opts.dirty) return current
  const previousSuggested = airportCallFromDep(
    opts.previousDepTime ?? opts.depTime,
    opts.previousBand ?? opts.band,
  )
  if (current === previousSuggested) return suggested
  return current
}

export function isAutoAirportCall(
  airportCall: string,
  depTime: string,
  band: FlightTravelBand | null,
): boolean {
  const suggested = airportCallFromDep(depTime, band)
  return Boolean(suggested) && airportCall.trim() === suggested
}

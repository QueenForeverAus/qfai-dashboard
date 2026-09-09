/**
 * Pluggable flight-schedule provider.
 *
 *   mock  — known QF441-style fixtures (staging smoke; no network)
 *   live  — optional HTTP JSON adapter when FLIGHT_LOOKUP_API_URL +
 *           FLIGHT_LOOKUP_API_KEY are already set. This PR does not
 *           sign up for or call a paid vendor by default.
 *   none  — key/url missing off staging → clear "provider not configured"
 *
 * Never invent terminals. A miss leaves schedule fields blank.
 */

import {
  findFlightLookupFixture,
  normalizeFlightDate,
  normalizeFlightNumber,
  type FlightSchedule,
} from './fixtures.ts'

export const FLIGHT_LOOKUP_NOT_CONFIGURED =
  'Flight lookup provider not configured. On staging the mock fixture list is used. To point at a real schedule API later, set FLIGHT_LOOKUP_API_URL and FLIGHT_LOOKUP_API_KEY (see lib/flight-lookup/README.md).'

export const FLIGHT_LOOKUP_NOT_FOUND =
  'No schedule for that flight # + date — leave fields blank and fill manually.'

export const FLIGHT_LOOKUP_INVALID =
  'Enter a flight # and date before Lookup.'

export type FlightLookupCode =
  | 'ok'
  | 'not_found'
  | 'not_configured'
  | 'invalid'
  | 'provider_error'

export type FlightLookupProviderId = 'mock' | 'live'

export type FlightLookupResult =
  | { ok: true; provider: FlightLookupProviderId; schedule: FlightSchedule; error: null; code: 'ok' }
  | { ok: false; provider: FlightLookupProviderId | null; schedule: null; error: string; code: Exclude<FlightLookupCode, 'ok'> }

export type FlightLookupEnv = {
  apiKey?: string | null
  apiUrl?: string | null
  provider?: string | null
  siteUrl?: string | null
  vercelUrl?: string | null
  vercelEnv?: string | null
  nodeEnv?: string | null
  host?: string | null
}

export type FlightScheduleProvider = {
  id: FlightLookupProviderId
  lookup(flightNumber: string, date: string): Promise<FlightLookupResult>
}

function trimEnv(value: string | null | undefined): string {
  return String(value ?? '').trim()
}

export function looksLikeStagingHost(value: string | null | undefined): boolean {
  return /staging|localhost|127\.0\.0\.1/i.test(String(value ?? ''))
}

export function isStagingFlightLookupEnv(env: FlightLookupEnv): boolean {
  const vercelEnv = trimEnv(env.vercelEnv).toLowerCase()
  if (vercelEnv === 'preview' || vercelEnv === 'development') return true
  if (looksLikeStagingHost(env.siteUrl) || looksLikeStagingHost(env.vercelUrl) || looksLikeStagingHost(env.host)) {
    return true
  }
  const nodeEnv = trimEnv(env.nodeEnv).toLowerCase()
  if (nodeEnv && nodeEnv !== 'production') return true
  return false
}

export function hasLiveFlightLookupConfig(env: FlightLookupEnv): boolean {
  return Boolean(trimEnv(env.apiKey) && trimEnv(env.apiUrl))
}

export function resolveFlightLookupProviderId(env: FlightLookupEnv): FlightLookupProviderId | null {
  const forced = trimEnv(env.provider).toLowerCase()
  const live = hasLiveFlightLookupConfig(env)
  if (forced === 'mock') return 'mock'
  if (forced === 'live') return live ? 'live' : null
  if (live) return 'live'
  if (isStagingFlightLookupEnv(env)) return 'mock'
  return null
}

export function flightLookupEnvFromProcess(extra: { host?: string | null } = {}): FlightLookupEnv {
  return {
    apiKey: process.env.FLIGHT_LOOKUP_API_KEY,
    apiUrl: process.env.FLIGHT_LOOKUP_API_URL,
    provider: process.env.FLIGHT_LOOKUP_PROVIDER,
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
    vercelUrl: process.env.VERCEL_URL,
    vercelEnv: process.env.VERCEL_ENV,
    nodeEnv: process.env.NODE_ENV,
    host: extra.host,
  }
}

function knownTerminal(value: unknown): string {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (/^(tbc|unknown|n\/?a|\?|-)$/i.test(trimmed)) return ''
  return trimmed
}

function readScheduleField(row: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const raw = row[key]
    if (typeof raw === 'string' && raw.trim()) return raw.trim()
    if (typeof raw === 'number' && Number.isFinite(raw)) return String(raw)
  }
  return ''
}

export function scheduleFromProviderJson(
  raw: unknown,
  fallbackNumber: string,
  fallbackDate: string,
): FlightSchedule | null {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null
  const root = raw as Record<string, unknown>
  const row = (root.schedule && typeof root.schedule === 'object' && !Array.isArray(root.schedule)
    ? root.schedule
    : root.data && typeof root.data === 'object' && !Array.isArray(root.data)
      ? root.data
      : root) as Record<string, unknown>

  const airline = readScheduleField(row, ['airline', 'airline_name', 'carrier'])
  const from = readScheduleField(row, ['from', 'origin', 'dep_airport', 'departure_airport'])
  const to = readScheduleField(row, ['to', 'destination', 'arr_airport', 'arrival_airport'])
  const depTime = readScheduleField(row, ['dep_time', 'departure_time', 'depart'])
  const arrTime = readScheduleField(row, ['arr_time', 'arrival_time', 'arrive'])
  if (!airline && !from && !to && !depTime) return null

  return {
    flight_number: normalizeFlightNumber(readScheduleField(row, ['flight_number', 'flight']) || fallbackNumber),
    date: normalizeFlightDate(readScheduleField(row, ['date', 'flight_date']) || fallbackDate),
    airline,
    from,
    to,
    dep_time: depTime,
    arr_time: arrTime,
    dep_terminal: knownTerminal(row.dep_terminal ?? row.departure_terminal),
    arr_terminal: knownTerminal(row.arr_terminal ?? row.arrival_terminal),
  }
}

export function mockFlightLookup(flightNumber: string, date: string): FlightLookupResult {
  const number = normalizeFlightNumber(flightNumber)
  const day = normalizeFlightDate(date)
  if (!number || !day) {
    return { ok: false, provider: 'mock', schedule: null, error: FLIGHT_LOOKUP_INVALID, code: 'invalid' }
  }
  const schedule = findFlightLookupFixture(number, day)
  if (!schedule) {
    return { ok: false, provider: 'mock', schedule: null, error: FLIGHT_LOOKUP_NOT_FOUND, code: 'not_found' }
  }
  return { ok: true, provider: 'mock', schedule: { ...schedule }, error: null, code: 'ok' }
}

export async function liveFlightLookup(
  flightNumber: string,
  date: string,
  env: FlightLookupEnv,
  fetchImpl: typeof fetch = fetch,
): Promise<FlightLookupResult> {
  const number = normalizeFlightNumber(flightNumber)
  const day = normalizeFlightDate(date)
  if (!number || !day) {
    return { ok: false, provider: 'live', schedule: null, error: FLIGHT_LOOKUP_INVALID, code: 'invalid' }
  }
  const apiUrl = trimEnv(env.apiUrl)
  const apiKey = trimEnv(env.apiKey)
  if (!apiUrl || !apiKey) {
    return { ok: false, provider: null, schedule: null, error: FLIGHT_LOOKUP_NOT_CONFIGURED, code: 'not_configured' }
  }

  let url: URL
  try {
    url = new URL(apiUrl)
  } catch {
    return {
      ok: false,
      provider: 'live',
      schedule: null,
      error: 'FLIGHT_LOOKUP_API_URL is not a valid URL.',
      code: 'provider_error',
    }
  }
  url.searchParams.set('flight', number)
  url.searchParams.set('date', day)

  try {
    const res = await fetchImpl(url.toString(), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(8000),
    })
    if (res.status === 404) {
      return { ok: false, provider: 'live', schedule: null, error: FLIGHT_LOOKUP_NOT_FOUND, code: 'not_found' }
    }
    if (!res.ok) {
      return {
        ok: false,
        provider: 'live',
        schedule: null,
        error: `Schedule provider returned ${res.status}. Fill fields manually.`,
        code: 'provider_error',
      }
    }
    const json = await res.json()
    const schedule = scheduleFromProviderJson(json, number, day)
    if (!schedule) {
      return { ok: false, provider: 'live', schedule: null, error: FLIGHT_LOOKUP_NOT_FOUND, code: 'not_found' }
    }
    return { ok: true, provider: 'live', schedule, error: null, code: 'ok' }
  } catch {
    return {
      ok: false,
      provider: 'live',
      schedule: null,
      error: 'Schedule provider failed. Fill fields manually.',
      code: 'provider_error',
    }
  }
}

export async function lookupFlightSchedule(
  flightNumber: string,
  date: string,
  env: FlightLookupEnv = flightLookupEnvFromProcess(),
  fetchImpl: typeof fetch = fetch,
): Promise<FlightLookupResult> {
  const number = normalizeFlightNumber(flightNumber)
  const day = normalizeFlightDate(date)
  if (!number || !day) {
    return { ok: false, provider: resolveFlightLookupProviderId(env), schedule: null, error: FLIGHT_LOOKUP_INVALID, code: 'invalid' }
  }
  const id = resolveFlightLookupProviderId(env)
  if (id == null) {
    return { ok: false, provider: null, schedule: null, error: FLIGHT_LOOKUP_NOT_CONFIGURED, code: 'not_configured' }
  }
  if (id === 'mock') return mockFlightLookup(number, day)
  return liveFlightLookup(number, day, env, fetchImpl)
}

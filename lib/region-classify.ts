/**
 * Run region (G1/G2/G3/G4) classification from show locations.
 *
 * Wave B (Topic 8): Group Type is first-class. Classifier seeds a default;
 * operators override on Costings. Aggregation: any G4 → G4; else any G3 → G3;
 * else any G2 → G2; else G1. Empty shows → group2 ("no shows yet").
 *
 * G3 city defaults: Alice Springs, Darwin, Broome, Tamworth, Port Macquarie.
 * Overseas / NZ / SE Asia → G4 (not G3).
 */

import type { RunRegion } from './types.ts'

export type ShowLocationInput = {
  state_territory?: string | null
  venue_city?: string | null
  country?: string | null // optional if ever present
}

/** Southern NSW cities treated as G1 self-drive with VIC. Extend as needed. */
export const SOUTHERN_NSW_G1_CITIES = [
  'Albury',
  'Wodonga',
  'Corowa',
  'Moama',
] as const

/** AU remote cities that default G3 even when state would otherwise be G2. */
export const G3_REMOTE_CITIES = [
  'Alice Springs',
  'Darwin',
  'Broome',
  'Tamworth',
  'Port Macquarie',
] as const

const STATE_ALIASES: Record<string, string> = {
  VIC: 'VIC',
  VICTORIA: 'VIC',
  NSW: 'NSW',
  'NEW SOUTH WALES': 'NSW',
  SA: 'SA',
  'SOUTH AUSTRALIA': 'SA',
  TAS: 'TAS',
  TASMANIA: 'TAS',
  ACT: 'ACT',
  'AUSTRALIAN CAPITAL TERRITORY': 'ACT',
  'CANBERRA ACT': 'ACT',
  WA: 'WA',
  'WESTERN AUSTRALIA': 'WA',
  NT: 'NT',
  'NORTHERN TERRITORY': 'NT',
  QLD: 'QLD',
  QUEENSLAND: 'QLD',
  NZ: 'NZ',
  'NEW ZEALAND': 'NZ',
}

const G3_STATES = new Set(['WA', 'NT', 'QLD'])
const G2_STATES = new Set(['SA', 'TAS', 'ACT'])

const NZ_CITY_HINTS = [
  'auckland',
  'wellington',
  'christchurch',
  'hamilton nz',
  'dunedin',
  'queenstown',
]

/** City/country hints for international / NZ / SE Asia / remote islands → G4 */
const INTL_CITY_HINTS = [
  ...NZ_CITY_HINTS,
  'bali',
  'denpasar',
  'singapore',
  'jakarta',
  'bangkok',
  'kuala lumpur',
  'kl',
  'manila',
  'fiji',
  'suva',
  'nadi',
  'papua',
  'port moresby',
]

const SOUTHERN_NSW_SET = new Set(
  SOUTHERN_NSW_G1_CITIES.map((c) => c.toLowerCase())
)

const G3_REMOTE_CITY_SET = new Set(
  G3_REMOTE_CITIES.map((c) => c.toLowerCase())
)

function normalizeState(raw?: string | null): string | null {
  if (!raw) return null
  const key = raw.trim().toUpperCase().replace(/\./g, '')
  if (!key) return null
  return STATE_ALIASES[key] ?? key
}

function normalizeCity(raw?: string | null): string {
  return (raw ?? '').trim().toLowerCase()
}

function isPortMacquarie(city: string): boolean {
  const compact = city.replace(/[^a-z]/g, '')
  return compact === 'portmacquarie' || compact === 'portmac'
}

function isG3RemoteCity(city: string): boolean {
  if (isPortMacquarie(city)) return true
  if (G3_REMOTE_CITY_SET.has(city)) return true
  return [...G3_REMOTE_CITY_SET].some((c) => city === c || city.includes(c))
}

export function isNzShow(show: ShowLocationInput, state?: string | null, city?: string): boolean {
  const st = state ?? normalizeState(show.state_territory)
  const c = city ?? normalizeCity(show.venue_city)
  const country = (show.country ?? '').trim().toUpperCase()
  if (country === 'NZ' || country === 'NZL' || country === 'NEW ZEALAND') return true
  if (st === 'NZ') return true
  if (NZ_CITY_HINTS.some((h) => c === h || c.includes(h))) return true
  return false
}

export function isInternational(show: ShowLocationInput, state?: string | null, city?: string): boolean {
  const st = state ?? normalizeState(show.state_territory)
  const c = city ?? normalizeCity(show.venue_city)
  const country = (show.country ?? '').trim().toUpperCase()
  if (country && country !== 'AU' && country !== 'AUS' && country !== 'AUSTRALIA') {
    return true
  }
  if (st === 'NZ') return true
  // "Hamilton NZ" style hints; plain "Hamilton" with VIC stays domestic
  if (INTL_CITY_HINTS.some((h) => c === h || c.includes(h))) return true
  if (c === 'hamilton' && st === 'NZ') return true
  return false
}

/**
 * Classify a single show location into group1 | group2 | group3 | group4.
 */
export function classifyShowRegion(show: ShowLocationInput): RunRegion {
  const state = normalizeState(show.state_territory)
  const city = normalizeCity(show.venue_city)

  if (isInternational(show, state, city)) {
    return 'group4'
  }

  if (isG3RemoteCity(city) || (state != null && G3_STATES.has(state))) {
    return 'group3'
  }

  if (state === 'VIC') return 'group1'

  if (state === 'NSW') {
    if (SOUTHERN_NSW_SET.has(city)) return 'group1'
    return 'group2'
  }

  if (state != null && G2_STATES.has(state)) return 'group2'

  // Unknown / missing state: soft-default G2 (safer than self-drive)
  return 'group2'
}

/**
 * Aggregate show regions → run region (max severity: G4 > G3 > G2 > G1).
 * Empty shows → group2.
 */
export function classifyRunRegion(shows: ShowLocationInput[]): RunRegion {
  if (!shows.length) return 'group2'
  const regions = shows.map(classifyShowRegion)
  if (regions.includes('group4')) return 'group4'
  if (regions.includes('group3')) return 'group3'
  if (regions.includes('group2')) return 'group2'
  return 'group1'
}

/** Human reason for UI/logs */
export function explainRunRegion(shows: ShowLocationInput[]): { region: RunRegion; reason: string } {
  if (!shows.length) {
    return { region: 'group2', reason: 'no shows yet' }
  }

  const parts: string[] = []
  let hasInlandNthNsw = false

  for (const show of shows) {
    const state = normalizeState(show.state_territory)
    const city = normalizeCity(show.venue_city)
    const label = [show.venue_city, show.state_territory].filter(Boolean).join(', ') || 'unknown'
    const r = classifyShowRegion(show)

    if (r === 'group4') {
      parts.push(`${label} → G4 (international / overseas)`)
    } else if (r === 'group3') {
      if (isG3RemoteCity(city)) {
        parts.push(`${label} → G3 (AU remote city default)`)
      } else {
        parts.push(`${label} → G3 (${state} remote/fly + local backline)`)
      }
    } else if (r === 'group1') {
      if (state === 'NSW' && SOUTHERN_NSW_SET.has(city)) {
        parts.push(`${label} → G1 (southern NSW self-drive with VIC)`)
      } else {
        parts.push(`${label} → G1 (VIC self-drive)`)
      }
    } else {
      if (state === 'NSW' && !SOUTHERN_NSW_SET.has(city)) {
        const inlandNth = [
          'dubbo', 'narrabri', 'armidale', 'moree', 'broken hill',
          'orange', 'wagga wagga', 'wagga',
        ]
        if (inlandNth.some((c) => city.includes(c))) {
          hasInlandNthNsw = true
          parts.push(`${label} → G2 (inland/northern NSW; case-by-case possible)`)
        } else {
          parts.push(`${label} → G2 (NSW fly+van default)`)
        }
      } else if (state === 'TAS') {
        parts.push(`${label} → G2 (Tasmania ferry)`)
      } else {
        parts.push(`${label} → G2`)
      }
    }
  }

  const region = classifyRunRegion(shows)
  let reason = parts.join('; ')
  if (hasInlandNthNsw && region === 'group2') {
    reason += ' — inland northern NSW: case-by-case possible'
  }
  if (shows.length > 1) {
    reason += ` ⇒ run ${region.replace('group', 'G')}`
  }
  return { region, reason }
}

/**
 * Run region (G1/G2/G3) classification from show locations.
 *
 * Locked 2026-09-03 costings canon — same rules that drive Advancing checklist
 * region filters (`lib/advancement-checklist.ts`). Regions must be derived from
 * show `state_territory` + `venue_city`, never left as seed defaults.
 *
 * Aggregation: any G3 → run G3; else any G2 → G2; else G1.
 * Empty shows → group2 ("no shows yet").
 */

import type { RunRegion } from '@/lib/types'

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

const G3_STATES = new Set(['WA', 'NT', 'QLD', 'NZ'])
const G2_STATES = new Set(['SA', 'TAS', 'ACT'])

/** City/country hints for international / NZ / SE Asia / remote islands → G3 */
const INTL_CITY_HINTS = [
  'auckland',
  'wellington',
  'christchurch',
  'hamilton nz',
  'dunedin',
  'queenstown',
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

function normalizeState(raw?: string | null): string | null {
  if (!raw) return null
  const key = raw.trim().toUpperCase().replace(/\./g, '')
  if (!key) return null
  return STATE_ALIASES[key] ?? key
}

function normalizeCity(raw?: string | null): string {
  return (raw ?? '').trim().toLowerCase()
}

function isInternational(show: ShowLocationInput, state: string | null, city: string): boolean {
  const country = (show.country ?? '').trim().toUpperCase()
  if (country && country !== 'AU' && country !== 'AUS' && country !== 'AUSTRALIA') {
    return true
  }
  if (state === 'NZ') return true
  // "Hamilton NZ" style hints; plain "Hamilton" with VIC stays domestic
  if (INTL_CITY_HINTS.some((h) => city === h || city.includes(h))) return true
  if (city === 'hamilton' && state === 'NZ') return true
  return false
}

/**
 * Classify a single show location into group1 | group2 | group3.
 */
export function classifyShowRegion(show: ShowLocationInput): RunRegion {
  const state = normalizeState(show.state_territory)
  const city = normalizeCity(show.venue_city)

  if (isInternational(show, state, city) || (state != null && G3_STATES.has(state))) {
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
 * Aggregate show regions → run region (max severity: G3 > G2 > G1).
 * Empty shows → group2.
 */
export function classifyRunRegion(shows: ShowLocationInput[]): RunRegion {
  if (!shows.length) return 'group2'
  const regions = shows.map(classifyShowRegion)
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

    if (r === 'group3') {
      if (isInternational(show, state, city)) {
        parts.push(`${label} → G3 (international/NZ/SE Asia)`)
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
        // Inland northern NSW: case-by-case possible
        const inlandNth = [
          'dubbo', 'narrabri', 'tamworth', 'armidale', 'moree', 'broken hill',
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

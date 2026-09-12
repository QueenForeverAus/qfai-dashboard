/**
 * Factor-based Costings estimates when `RUN_DEFAULTS[runCode]` is missing
 * (e.g. 26R01, 26R05). Historical R01–R14 stay on `run-defaults.ts`.
 *
 * Inputs: `run_factors` + `runs.region` (or `classifyRunRegion`) + show
 * count / dates / capacity. Region rules are not invented here — G1/G2/G3
 * come from `runs.region` or `lib/region-classify.ts`.
 *
 * Assumptions (cited on seeded `source` notes):
 * - Nights = inclusive calendar span of `shows.show_date` (UTC date-only).
 *   No dates → show count. Does **not** add a fly-in night; Finance can bump.
 * - Per diems = `per_diem_per_person_per_day` × 2 people (Darryn + Danny,
 *   same as `generate-entries` / `/api/factors`) × nights. Factor text says
 *   return-day legs are excluded — we do not add a return day.
 * - Group 1 ground = fuel-style / no van. Factors have no G1 fuel lump and
 *   no run km, so ground is $0 estimated (update when fuel is known).
 * - Group 2 ground = `van_hire_group2` (or `van_hire_tas` when any show is
 *   TAS) + local fly-run Factors that exist (Kia × show days, Gareth uber,
 *   airport parking). `fuel_per_100km` is a rate, not a total — omitted
 *   until km is known.
 * - Group 3 flights = `flights_group3_wa` if any show is WA, else
 *   `flights_group3_qld_nt` if any show is QLD/NT. NZ/other G3 has no
 *   flights Factor. Local ground = Kia + uber + parking (no van).
 * - Group 3 lighting hire is not the standing $330 shell — gear travels;
 *   seed $0 and let Michael confirm if local hire is needed.
 * - FB ads = per-venue capacity bracket (Factors are per venue), then sum.
 *   Null capacity uses the small bracket.
 */

import type { RunRegion } from '../types.ts'
import { classifyRunRegion, type ShowLocationInput } from '../region-classify.ts'
import type { RunDefault } from './run-defaults.ts'
import {
  CREW_FEE_PER_SHOW,
  FOOD_PER_SHOW,
  LIGHTING_HIRE_PER_RUN,
} from './run-defaults.ts'

/** Darryn + Danny only — matches `generate-entries` and `/api/factors`. */
export const PER_DIEM_PEOPLE = 2

/** Group 3 Factor seed — no standing lighting hire (gear travels). */
export const G3_LIGHTING_HIRE_SOURCE =
  'G3 — no standing lighting hire; Michael confirms if needed / gear travels'

export const CREW_FEE_FACTOR_KEYS = [
  'crew_fee_adam_sound',
  'crew_fee_michael_lighting',
  'crew_fee_michael_pm',
  'crew_fee_darryn',
  'crew_fee_danny',
] as const

export type FactorMap = Record<string, number>

export type FactorShow = ShowLocationInput & {
  venue_city?: string | null
  show_date?: string | null
  capacity?: number | null
}

export type GroundItem = { description: string; notes: string; amount: number }

export type FbAdsItem = { venueCity: string; amount: number; notes: string }

export type FactorLine = { value: number | null; state: 'estimated'; source: string }

export type FactorRunEstimate = {
  region: RunRegion
  nights: number
  perDiemDays: number
  perDiemPeople: number
  crewFeePerShow: number
  crewUsedFactors: boolean
  crewFeesTotal: number
  crewSource: string
  foodPerShow: number
  foodBasics: number
  foodSource: string
  lightingHire: number
  lightingSource: string
  accommodation: number
  accomPerNight: number
  accommodationSource: string
  perDiems: number
  perDiemRate: number
  perDiemsSource: string
  fbAds: number
  fbAdsItems: FbAdsItem[]
  fbAdsSource: string
  groundTransport: number
  groundTransportItems: GroundItem[]
  groundSource: string
  flights: FactorLine
  backlineHire: FactorLine
  crewTravelDay: FactorLine | null
}

export function parseFactorMap(
  rows: Array<{ key?: string | null; value?: unknown }> | null | undefined,
): FactorMap {
  const map: FactorMap = {}
  for (const row of rows ?? []) {
    const key = String(row.key ?? '').trim()
    if (!key) continue
    if (row.value == null || row.value === '') continue
    const n = Number(row.value)
    if (Number.isFinite(n)) map[key] = n
  }
  return map
}

export function isRunRegion(value: unknown): value is RunRegion {
  return value === 'group1' || value === 'group2' || value === 'group3'
}

/** Prefer stored `runs.region`; otherwise locked costings classify. */
export function resolveSeedRegion(runRegion: unknown, shows: ShowLocationInput[]): RunRegion {
  if (isRunRegion(runRegion)) return runRegion
  return classifyRunRegion(shows)
}

/**
 * Inclusive nights from show dates; fallback show count.
 * Same-day double header → 1 night. Empty shows → 0.
 */
export function estimateRunNights(shows: Array<{ show_date?: string | null }>): number {
  const dates = shows
    .map(s => String(s.show_date ?? '').slice(0, 10))
    .filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort()
  if (!dates.length) return shows.length
  const first = Date.parse(`${dates[0]}T00:00:00Z`)
  const last = Date.parse(`${dates[dates.length - 1]}T00:00:00Z`)
  if (!Number.isFinite(first) || !Number.isFinite(last) || last < first) {
    return Math.max(shows.length, 0)
  }
  return Math.round((last - first) / 86_400_000) + 1
}

function normalizeState(raw?: string | null): string {
  return String(raw ?? '').trim().toUpperCase().replace(/\./g, '')
}

function showsIncludeState(shows: FactorShow[], states: string[]): boolean {
  const set = new Set(states)
  return shows.some(s => set.has(normalizeState(s.state_territory)))
}

export function crewFeePerShowFromFactors(factors: FactorMap): {
  perShow: number
  usedFactors: boolean
  parts: string[]
} {
  const parts: string[] = []
  let sum = 0
  let missing = false
  for (const key of CREW_FEE_FACTOR_KEYS) {
    const amount = factors[key]
    if (amount == null || !Number.isFinite(amount)) {
      missing = true
      break
    }
    sum += amount
    parts.push(`${key} $${amount}`)
  }
  if (missing) {
    return { perShow: CREW_FEE_PER_SHOW, usedFactors: false, parts: [] }
  }
  return { perShow: sum, usedFactors: true, parts }
}

export function fbAdsBracketForCapacity(
  capacity: number | null | undefined,
  factors: FactorMap,
): { amount: number; key: string; label: string } {
  const small = factors.fb_ads_bracket_small ?? 2500
  const medium = factors.fb_ads_bracket_medium ?? 3500
  const large = factors.fb_ads_bracket_large ?? 5000
  const flagship = factors.fb_ads_bracket_flagship ?? 6000
  const cap = capacity == null || !Number.isFinite(Number(capacity)) ? null : Number(capacity)
  if (cap == null) {
    return { amount: small, key: 'fb_ads_bracket_small', label: 'capacity unknown → small (<600)' }
  }
  if (cap >= 1500) {
    return { amount: flagship, key: 'fb_ads_bracket_flagship', label: `cap ${cap} → flagship (1,500+)` }
  }
  if (cap >= 1001) {
    return { amount: large, key: 'fb_ads_bracket_large', label: `cap ${cap} → large (1,001–1,500)` }
  }
  if (cap >= 601) {
    return { amount: medium, key: 'fb_ads_bracket_medium', label: `cap ${cap} → medium (601–1,000)` }
  }
  return { amount: small, key: 'fb_ads_bracket_small', label: `cap ${cap} → small (<600)` }
}

function addItem(items: GroundItem[], description: string, notes: string, amount: number | undefined) {
  if (amount == null || !Number.isFinite(amount) || amount < 0) return
  items.push({ description, notes, amount })
}

export function estimateGroundAndFlights(opts: {
  region: RunRegion
  shows: FactorShow[]
  factors: FactorMap
  showCount: number
}): {
  groundValue: number
  groundItems: GroundItem[]
  groundSource: string
  flights: FactorLine
} {
  const { region, shows, factors, showCount } = opts
  const items: GroundItem[] = []
  const kia = factors.kia_hire_per_day
  const uber = factors.uber_airport_gareth
  const parking = factors.airport_parking_per_run
  const isTas = showsIncludeState(shows, ['TAS', 'TASMANIA'])

  if (region === 'group1') {
    return {
      groundValue: 0,
      groundItems: [],
      groundSource:
        'Factors / Group 1 self-drive — no van hire. Local fuel has no standing lump in run_factors and no run km (fuel_per_100km is a rate only). Update when fuel is known.',
      flights: {
        value: 0,
        state: 'estimated',
        source: 'Factors / Group 1 self-drive — no flights bracket.',
      },
    }
  }

  if (region === 'group2') {
    const vanKey = isTas && factors.van_hire_tas != null ? 'van_hire_tas' : 'van_hire_group2'
    const van = factors[vanKey]
    addItem(items, isTas ? 'Van hire — Tasmania' : 'Van hire — Group 2 (Melbourne depot)', `Factors ${vanKey}`, van)
    if (kia != null && showCount > 0) {
      addItem(items, 'Kia Carnival hire', `Factors kia_hire_per_day $${kia} × ${showCount} show day${showCount === 1 ? '' : 's'}`, kia * showCount)
    }
    addItem(items, 'Uber — airport (Gareth)', 'Factors uber_airport_gareth — G2 fly run', uber)
    addItem(items, 'Airport parking', 'Factors airport_parking_per_run — G2 fly run', parking)
    const groundValue = items.reduce((s, i) => s + i.amount, 0)
    const fuelNote = factors.fuel_per_100km != null
      ? ' Van fuel omitted — Factors fuel_per_100km is a rate; no run km.'
      : ''
    return {
      groundValue,
      groundItems: items,
      groundSource:
        `Factors Group 2 — ${vanKey}${van != null ? ` $${van}` : ' (missing)'}` +
        (kia != null ? ` + Kia $${kia}×${showCount} show days` : '') +
        (uber != null ? ` + uber $${uber}` : '') +
        (parking != null ? ` + parking $${parking}` : '') +
        `.${fuelNote}`,
      flights: {
        value: factors.flights_group2_bracket ?? null,
        state: 'estimated',
        source: factors.flights_group2_bracket != null
          ? `Factors flights_group2_bracket $${factors.flights_group2_bracket} — 7 pax return. Gareth to book actuals.`
          : 'Factors — Group 2 flights bracket missing. Gareth to price.',
      },
    }
  }

  // group3
  addItem(
    items,
    'Kia Carnival hire (local)',
    `Factors kia_hire_per_day × ${showCount} show day${showCount === 1 ? '' : 's'} — no van (local backline)`,
    kia != null && showCount > 0 ? kia * showCount : undefined,
  )
  addItem(items, 'Uber — airport (Gareth)', 'Factors uber_airport_gareth — G3 fly run', uber)
  addItem(items, 'Airport parking', 'Factors airport_parking_per_run — G3 fly run', parking)
  const groundValue = items.reduce((s, i) => s + i.amount, 0)

  const isWa = showsIncludeState(shows, ['WA', 'WESTERN AUSTRALIA'])
  const isQldNt = showsIncludeState(shows, ['QLD', 'QUEENSLAND', 'NT', 'NORTHERN TERRITORY'])
  let flightKey: string | null = null
  if (isWa) flightKey = 'flights_group3_wa'
  else if (isQldNt) flightKey = 'flights_group3_qld_nt'

  const flightVal = flightKey ? factors[flightKey] : undefined
  const flights: FactorLine = flightKey && flightVal != null
    ? {
        value: flightVal,
        state: 'estimated',
        source: `Factors ${flightKey} $${flightVal} — 7 pax return. Gareth to price actuals.`,
      }
    : {
        value: null,
        state: 'estimated',
        source: 'Factors — no Group 3 flights bracket for this location (NZ/intl or missing key). Gareth to price.',
      }

  return {
    groundValue,
    groundItems: items,
    groundSource:
      `Factors Group 3 local ground (no van)` +
      (kia != null ? ` — Kia $${kia}×${showCount} show days` : '') +
      (uber != null ? ` + uber $${uber}` : '') +
      (parking != null ? ` + parking $${parking}` : '') +
      '.',
    flights,
  }
}

export function estimateRunFromFactors(opts: {
  shows: FactorShow[]
  factors: FactorMap
  region: RunRegion
  lightingHireFallback: number
}): FactorRunEstimate {
  const { shows, factors, region } = opts
  const numShows = shows.length
  const nights = estimateRunNights(shows)
  const perDiemDays = nights
  const crew = crewFeePerShowFromFactors(factors)
  const crewFeesTotal = crew.perShow * numShows
  const foodPerShow = factors.food_basics_per_show ?? FOOD_PER_SHOW
  const foodFromFactors = factors.food_basics_per_show != null
  const lightingFromFactors = factors.lighting_hire_per_run != null
  const lightingHire = region === 'group3'
    ? 0
    : factors.lighting_hire_per_run
      ?? opts.lightingHireFallback
      ?? LIGHTING_HIRE_PER_RUN
  const accomPerNight = factors.accom_per_night ?? 1400
  const accommodation = accomPerNight * nights
  const perDiemRate = factors.per_diem_per_person_per_day ?? 40
  const perDiems = perDiemRate * PER_DIEM_PEOPLE * perDiemDays

  const fbAdsItems: FbAdsItem[] = shows.map((show, i) => {
    const bracket = fbAdsBracketForCapacity(show.capacity, factors)
    const city = show.venue_city?.trim() || `Show ${i + 1}`
    return {
      venueCity: city,
      amount: bracket.amount,
      notes: `${bracket.label} — Factors ${bracket.key}`,
    }
  })
  const fbAds = fbAdsItems.reduce((s, i) => s + i.amount, 0)

  const travel = estimateGroundAndFlights({ region, shows, factors, showCount: numShows })

  const backline = region === 'group3' && factors.backline_hire_per_run != null
    ? {
        value: factors.backline_hire_per_run,
        state: 'estimated' as const,
        source: `Factors backline_hire_per_run $${factors.backline_hire_per_run} — Group 3 local hire (own gear stays in Melbourne).`,
      }
    : {
        value: 0,
        state: 'estimated' as const,
        source: 'Not required for this run region by default — Factors backline is Group 3 only. Set amount if local backline hire is needed.',
      }

  const adamTravel = factors.crew_travel_day_adam
  const michaelTravel = factors.crew_travel_day_michael
  const crewTravelDay = region === 'group3' && (adamTravel != null || michaelTravel != null)
    ? {
        value: (adamTravel ?? 0) + (michaelTravel ?? 0),
        state: 'estimated' as const,
        source: `Factors crew travel-day (Nth QLD / NT / WA) — Adam $${adamTravel ?? 0} + Michael $${michaelTravel ?? 0}.`,
      }
    : null

  const lightingSource = region === 'group3'
    ? G3_LIGHTING_HIRE_SOURCE
    : lightingFromFactors
      ? `Factors lighting_hire_per_run $${lightingHire} — standard per run.`
      : `$${lightingHire} per run — portal_settings lighting_hire_default (Factors lighting_hire_per_run missing).`

  return {
    region,
    nights,
    perDiemDays,
    perDiemPeople: PER_DIEM_PEOPLE,
    crewFeePerShow: crew.perShow,
    crewUsedFactors: crew.usedFactors,
    crewFeesTotal,
    crewSource: crew.usedFactors
      ? `Factors crew fee lines × ${numShows} show${numShows === 1 ? '' : 's'}: ${crew.parts.join(' + ')} = $${crew.perShow.toLocaleString()}/show.`
      : `Fallback CREW_FEE_PER_SHOW $${CREW_FEE_PER_SHOW} × ${numShows} (Factors crew fee lines incomplete).`,
    foodPerShow,
    foodBasics: foodPerShow * numShows,
    foodSource: foodFromFactors
      ? `Factors food_basics_per_show $${foodPerShow} × ${numShows} show${numShows === 1 ? '' : 's'} — estimated. Sometimes venue-supplied.`
      : `~$${foodPerShow}/show × ${numShows} (Factors food_basics_per_show missing).`,
    lightingHire,
    lightingSource,
    accommodation,
    accomPerNight,
    accommodationSource:
      `Factors accom_per_night $${accomPerNight} × ${nights} night${nights === 1 ? '' : 's'} (7 rooms). ` +
      `Nights = inclusive show-date span` +
      (shows.some(s => s.show_date) ? '' : ' (no dates → show count)') +
      '; no extra fly-in night assumed.',
    perDiems,
    perDiemRate,
    perDiemsSource:
      `Factors per_diem_per_person_per_day $${perDiemRate} × ${PER_DIEM_PEOPLE} people (Darryn + Danny) × ${perDiemDays} day${perDiemDays === 1 ? '' : 's'} ` +
      `(days = estimated nights; no return-day add).`,
    fbAds,
    fbAdsItems,
    fbAdsSource: fbAdsItems.length
      ? `Factors FB ads brackets per venue, summed: ${fbAdsItems.map(i => `${i.venueCity} ${i.notes}`).join('; ')}.`
      : 'Factors FB ads — no shows to bracket.',
    groundTransport: travel.groundValue,
    groundTransportItems: travel.groundItems,
    groundSource: travel.groundSource,
    flights: travel.flights,
    backlineHire: backline,
    crewTravelDay,
  }
}

/** Synthetic RunDefault so `generateEntries` can build child lines. */
export function toSyntheticRunDefault(est: FactorRunEstimate): RunDefault {
  return {
    flights: est.flights.value == null
      ? null
      : { value: est.flights.value, state: est.flights.state, source: est.flights.source },
    accommodation: {
      value: est.accommodation,
      state: 'estimated',
      source: est.accommodationSource,
    },
    accommodationNights: Math.max(est.nights, 1),
    groundTransport: {
      value: est.groundTransport,
      state: 'estimated',
      source: est.groundSource,
    },
    groundTransportItems: est.groundTransportItems,
    backlineHire: est.backlineHire.value == null
      ? undefined
      : { value: est.backlineHire.value, state: est.backlineHire.state, source: est.backlineHire.source },
    bradDriverFee: null,
    crewTravelDay: est.crewTravelDay == null || est.crewTravelDay.value == null
      ? null
      : {
          value: est.crewTravelDay.value,
          state: est.crewTravelDay.state,
          source: est.crewTravelDay.source,
        },
    perDiems: {
      value: est.perDiems,
      state: 'estimated',
      source: est.perDiemsSource,
    },
    perDiemDays: Math.max(est.perDiemDays, 0),
    fbAds: {
      value: est.fbAds,
      state: 'estimated',
      source: est.fbAdsSource,
    },
    fbAdsItems: est.fbAdsItems,
    shows: [],
  }
}

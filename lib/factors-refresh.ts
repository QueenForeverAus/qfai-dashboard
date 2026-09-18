/**
 * Wave A Factors → Run Costings refresh gate.
 *
 * Factors change Run Costings ONLY:
 *   - seed future runs from current Factors
 *   - offer refresh on unbooked Costings (status !== BOOKED/confirmed)
 *
 * Once BOOKED (including Unconfirm — run stays BOOKED), Factors are irrelevant
 * to that run. Advancing never chases Factors.
 *
 * G3 lighting $0 / never $330 standing rule stays in estimate-from-factors.
 */

import { isBookedBookingStatus } from './booked-cost-freeze.ts'
import { allowsStandingLightingHire } from './group-type.ts'
import type { RunRegion } from './types.ts'
import { RUN_DEFAULTS } from './defaults/run-defaults.ts'
import { PORTAL_SETTINGS_DEFAULTS } from './portal-settings.ts'
import type { FactorOverrides } from './defaults/generate-entries.ts'
import {
  computeDanielChampagne,
  computeMusicRights,
  DANIEL_CHAMPAGNE_FIELD_KEY,
  MUSIC_RIGHTS_FIELD_KEY,
  type AutoCalcShow,
} from './show-auto-calc.ts'

export const FACTORS_REFRESH_BOOKED_ERROR =
  'This run is BOOKED — Factors no longer change its Costings. Refresh is for unbooked runs only. Advancing does not chase Factors.'

export const FACTORS_REFRESH_OFFER =
  'Factors have standing defaults for unbooked Costings. Refresh estimated / guess lines from Factors, or leave the sheet as entered.'

/** Factor keys that may rewrite unbooked estimated/guess Costings lines. */
export const FACTOR_COSTING_FIELD_MAP: Record<string, string[]> = {
  accom_per_night: ['accommodation'],
  per_diem_per_person_per_day: ['per_diems'],
  food_basics_per_show: ['food_basics'],
  lighting_hire_per_run: ['lighting_hire'],
  backline_hire_per_run: ['backline_hire'],
  crew_travel_day_adam: ['crew_travel_day'],
  crew_travel_day_michael: ['crew_travel_day'],
  music_rights_pct: ['music_rights'],
  daniel_champagne_per_ticket: ['daniel_champagne'],
}

/** FB Ads is per-show and is never refreshed from Factors. Inside fees seed from contract / Draft / operator, not Factors. */
export const FACTORS_NEVER_REFRESH_FIELD_KEYS = new Set(['fb_ads', 'inside_fees'])

export const FACTORS_REFRESHABLE_STATES = new Set(['estimated', 'guess', 'pending', 'figures_needed', 'auto_calc'])

export function canRefreshCostingsFromFactors(run: {
  status?: string | null
  costings_unconfirmed_at?: string | null
} | null | undefined): boolean {
  // Unconfirm keeps BOOKED — Factors stay irrelevant.
  return !isBookedBookingStatus(run?.status)
}

export function factorsRefreshBlockedReason(run: {
  status?: string | null
} | null | undefined): string | null {
  return canRefreshCostingsFromFactors(run) ? null : FACTORS_REFRESH_BOOKED_ERROR
}

export function fieldKeysAffectedByFactor(factorKey: string): string[] {
  return FACTOR_COSTING_FIELD_MAP[factorKey] ?? []
}

export function computeFactorDerivedValue(
  fieldKey: string,
  runCode: string,
  numShows: number,
  factors: FactorOverrides,
  lightingHireDefault = PORTAL_SETTINGS_DEFAULTS.lighting_hire_default,
  region?: RunRegion | string | null,
): number | null {
  switch (fieldKey) {
    case 'accommodation': {
      const nights = RUN_DEFAULTS[runCode]?.accommodationNights ?? numShows
      return nights * (factors.accom_per_night ?? 1400)
    }
    case 'per_diems': {
      const days = RUN_DEFAULTS[runCode]?.perDiemDays ?? numShows
      return days * 2 * (factors.per_diem_per_person_per_day ?? 40)
    }
    case 'food_basics':
      return numShows * (factors.food_basics_per_show ?? 225)
    case 'lighting_hire':
      if (!allowsStandingLightingHire(region)) return 0
      return factors.lighting_hire_per_run ?? lightingHireDefault
    case 'backline_hire':
      return factors.backline_hire_per_run ?? 3800
    case 'crew_travel_day': {
      const adam = factors.crew_travel_day_adam ?? 250
      const michael = factors.crew_travel_day_michael ?? 250
      return adam + michael
    }
    default:
      return null
  }
}

/**
 * Patch for one Costings row during an unbooked Factors refresh.
 * Music Rights / Daniel Champagne need the show (tickets × price / tickets).
 * FB Ads is never refreshed (caller must already skip via shouldRefreshCostField).
 */
export function buildFactorFieldPatch(opts: {
  fieldKey: string
  runCode: string
  numShows: number
  factors: FactorOverrides
  lightingHireDefault?: number
  show?: AutoCalcShow | null
  region?: RunRegion | string | null
}): { value: number | null; state?: 'auto_calc' | 'pending' } | null {
  if (opts.fieldKey === MUSIC_RIGHTS_FIELD_KEY) {
    if (!opts.show) return null
    const r = computeMusicRights({
      show: opts.show,
      musicRightsPct: opts.factors.music_rights_pct,
    })
    return { value: r.amount, state: r.state }
  }
  if (opts.fieldKey === DANIEL_CHAMPAGNE_FIELD_KEY) {
    if (!opts.show) return null
    const r = computeDanielChampagne({
      show: opts.show,
      perTicket: opts.factors.daniel_champagne_per_ticket,
    })
    return { value: r.amount, state: r.state }
  }
  const value = computeFactorDerivedValue(
    opts.fieldKey,
    opts.runCode,
    opts.numShows,
    opts.factors,
    opts.lightingHireDefault,
    opts.region,
  )
  if (value === null) return null
  return { value }
}

export function shouldRefreshCostField(opts: {
  fieldKey: string
  state: string | null | undefined
  runStatus: string | null | undefined
}): boolean {
  if (!canRefreshCostingsFromFactors({ status: opts.runStatus })) return false
  if (FACTORS_NEVER_REFRESH_FIELD_KEYS.has(opts.fieldKey)) return false
  return FACTORS_REFRESHABLE_STATES.has(String(opts.state ?? ''))
}

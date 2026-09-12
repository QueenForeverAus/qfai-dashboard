import type { SupabaseClient } from '@supabase/supabase-js'
import { RUN_DEFAULTS, LIGHTING_HIRE_PER_RUN, FOOD_PER_SHOW, CREW_FEE_PER_SHOW } from './run-defaults.ts'
import { generateEntries, type FactorOverrides } from './generate-entries.ts'
import { loadPortalSettings } from '../portal-settings.ts'
import {
  displayCostFieldLabel,
  ensureMinimumEntry,
  ENTRY_EXEMPT_FIELD_KEYS,
} from '../cost-fields.ts'
import { syncRunDatesFromShows } from '../run-dates.ts'
import type { RunRegion } from '../types.ts'
import {
  estimateRunFromFactors,
  parseFactorMap,
  resolveSeedRegion,
  toSyntheticRunDefault,
  type FactorMap,
} from './estimate-from-factors.ts'

export type SeedShow = {
  id: string
  show_order: number
  capacity: number | null
  ticket_price: number | null
  venue_name: string
  venue_city: string
  show_date: string | null
  state_territory?: string | null
}

import type { RunDefault } from './run-defaults.ts'

function withEntries(
  row: Record<string, unknown>,
  fieldKey: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  defaults: any,
  shows: SeedShow[],
  factors?: FactorOverrides,
) {
  const generated = generateEntries(fieldKey, String(row.state ?? ''), defaults as RunDefault | null, shows, factors)
  if (ENTRY_EXEMPT_FIELD_KEYS.has(fieldKey)) {
    return { ...row, entries: generated }
  }
  const label = String(row.label ?? fieldKey)
  const value = row.value == null ? null : Number(row.value)
  return {
    ...row,
    entries: ensureMinimumEntry(generated, label, value),
  }
}

/** Attach a single default entry when seeding rows that skip generateEntries. */
function withDefaultEntry(row: Record<string, unknown>) {
  const fieldKey = String(row.field_key ?? '')
  if (ENTRY_EXEMPT_FIELD_KEYS.has(fieldKey)) {
    return { ...row, entries: row.entries ?? [] }
  }
  const label = String(row.label ?? fieldKey)
  const value = row.value == null ? null : Number(row.value)
  return {
    ...row,
    entries: ensureMinimumEntry(
      Array.isArray(row.entries) ? row.entries as Parameters<typeof ensureMinimumEntry>[0] : [],
      label,
      value,
    ),
  }
}

function socialAdsVarRow(runId: string) {
  return {
    run_id: runId, show_id: null,
    category: 'Marketing', field_key: 'social_ads_var',
    label: 'Social Media Marketing Co. — $1/ticket',
    value: null, state: 'pending', entries: [],
    source: '$1.10 inc GST per paid ticket. Calculated at settlement.',
  }
}

/** Historical R01–R14 path — values come from RUN_DEFAULTS, not Factors. */
export function buildHistoricalSeedRows(
  runId: string,
  defaults: RunDefault,
  shows: SeedShow[],
  lightingHire: number,
): object[] {
  const numShows = shows.length
  const rows: object[] = []
  const lightingFactors: FactorOverrides = { lighting_hire_per_run: lightingHire }

  const crewFeesTotal = numShows * CREW_FEE_PER_SHOW
  rows.push(withEntries({
    run_id: runId, show_id: null,
    category: 'Crew & Operations', field_key: 'crew_fees_total',
    label: 'Crew Fees (all shows)',
    value: crewFeesTotal, state: 'known',
    source: `Fixed rates × ${numShows} show${numShows > 1 ? 's' : ''}: Adam Dahl sound $600 + Michael Richardson lighting $600 + Michael PM $250 + Darryn McLaughlin bass $600 + Danny Oakhill keys $600 = $${CREW_FEE_PER_SHOW.toLocaleString()}/show.`,
  }, 'crew_fees_total', defaults, shows))
  rows.push(withEntries({
    run_id: runId, show_id: null,
    category: 'Production', field_key: 'food_basics',
    label: 'Food & Basics',
    value: numShows * FOOD_PER_SHOW, state: 'estimated',
    source: `~$${FOOD_PER_SHOW}/show × ${numShows} show${numShows > 1 ? 's' : ''} — estimated. Sometimes venue-supplied, sometimes externally ordered; quoted fresh each time. Update to KNOWN once confirmed.`,
  }, 'food_basics', defaults, shows))
  rows.push(withEntries({
    run_id: runId, show_id: null,
    category: 'Production', field_key: 'lighting_hire',
    label: displayCostFieldLabel('lighting_hire'),
    value: lightingHire, state: 'estimated',
    source: `$${lightingHire} standard per run — almost always required. Confirm with Michael Richardson: if extra lights needed on top, or if usual lights unavailable, or OS travel (can't bring gear), rate will differ.`,
  }, 'lighting_hire', defaults, shows, lightingFactors))
  rows.push(socialAdsVarRow(runId))

  if (defaults.flights) {
    rows.push(withEntries({
      run_id: runId, show_id: null,
      category: 'Travel & Accommodation', field_key: 'flights',
      label: 'Flights (band + crew)',
      value: defaults.flights.value, state: defaults.flights.state,
      source: defaults.flights.source,
    }, 'flights', defaults, shows))
  }
  rows.push(withEntries({
    run_id: runId, show_id: null,
    category: 'Travel & Accommodation', field_key: 'accommodation',
    label: 'Accommodation',
    value: defaults.accommodation.value, state: defaults.accommodation.state,
    source: defaults.accommodation.source,
  }, 'accommodation', defaults, shows))
  rows.push(withEntries({
    run_id: runId, show_id: null,
    category: 'Travel & Accommodation', field_key: 'ground_transport',
    label: 'Ground Transport',
    value: defaults.groundTransport.value, state: defaults.groundTransport.state,
    source: defaults.groundTransport.source,
  }, 'ground_transport', defaults, shows))
  if (defaults.bradDriverFee) {
    rows.push(withEntries({
      run_id: runId, show_id: null,
      category: 'Travel & Accommodation', field_key: 'brad_driver_fee',
      label: 'Brad Driver Fee',
      value: defaults.bradDriverFee.value, state: defaults.bradDriverFee.state,
      source: defaults.bradDriverFee.source,
    }, 'brad_driver_fee', defaults, shows))
  }
  if (defaults.crewTravelDay) {
    rows.push(withEntries({
      run_id: runId, show_id: null,
      category: 'Crew & Operations', field_key: 'crew_travel_day',
      label: 'Crew Travel-Day Fee',
      value: defaults.crewTravelDay.value, state: defaults.crewTravelDay.state,
      source: defaults.crewTravelDay.source,
    }, 'crew_travel_day', defaults, shows))
  }
  rows.push(withEntries({
    run_id: runId, show_id: null,
    category: 'Crew & Operations', field_key: 'per_diems',
    label: 'Per Diems',
    value: defaults.perDiems.value, state: defaults.perDiems.state,
    source: defaults.perDiems.source,
  }, 'per_diems', defaults, shows))
  rows.push(withEntries({
    run_id: runId, show_id: null,
    category: 'Marketing', field_key: 'fb_ads',
    label: 'Facebook / Social Ads',
    value: defaults.fbAds.value, state: defaults.fbAds.state,
    source: defaults.fbAds.source,
  }, 'fb_ads', defaults, shows))
  if (defaults.backlineHire) {
    rows.push(withEntries({
      run_id: runId, show_id: null,
      category: 'Production', field_key: 'backline_hire',
      label: 'Backline Hire (local)',
      value: defaults.backlineHire.value, state: defaults.backlineHire.state,
      source: defaults.backlineHire.source,
    }, 'backline_hire', defaults, shows))
  } else {
    rows.push(withDefaultEntry({
      run_id: runId, show_id: null,
      category: 'Production', field_key: 'backline_hire',
      label: 'Backline Hire (local)',
      value: 0, state: 'estimated',
      source: 'Not required for this run region by default — set amount if local backline hire is needed.',
    }))
  }

  for (const showDef of defaults.shows) {
    const show = shows.find(s => s.show_order === showDef.showOrder)
    if (!show) continue

    rows.push(withDefaultEntry({
      run_id: runId, show_id: show.id,
      category: 'Revenue', field_key: 'gross_box_office',
      label: 'Gross Box Office',
      value: null, state: 'pending',
      source: `Cap ${showDef.capacity.toLocaleString()} × $${showDef.ticketPrice} nett — pending ticket sales. Use sell-through slider in Overview.`,
    }))
    rows.push(withDefaultEntry({
      run_id: runId, show_id: show.id,
      category: 'Venue Costs', field_key: 'venue_hire',
      label: 'Venue Hire',
      value: showDef.venueHire.value, state: showDef.venueHire.state,
      source: showDef.venueHire.source,
    }))
    rows.push(withDefaultEntry({
      run_id: runId, show_id: show.id,
      category: 'Venue Costs', field_key: 'venue_staff',
      label: 'Venue Staff / On-costs',
      value: showDef.venueStaff.value, state: showDef.venueStaff.state,
      source: showDef.venueStaff.source,
      line_items: showDef.venueStaffItems ?? [],
    }))
    rows.push(withDefaultEntry({
      run_id: runId, show_id: show.id,
      category: 'Venue Costs', field_key: 'venue_marketing',
      label: 'Venue Marketing',
      value: 0, state: 'guess',
      source: 'Venue marketing levy / promo / EDM campaigns — classify from Harbour quotes.',
    }))
    rows.push(withDefaultEntry({
      run_id: runId, show_id: show.id,
      category: 'Venue Costs', field_key: 'production_costs',
      label: displayCostFieldLabel('production_costs'),
      value: null, state: 'pending',
      source: 'Additional Venue Production/AV costs not included in venue staff on-costs. Confirm with Michael Richardson.',
    }))
  }

  return rows
}

/** 26R* / unknown codes — estimated Group 1/2/3 lines from run_factors. */
export function buildFactorEstimateSeedRows(
  runId: string,
  shows: SeedShow[],
  factors: FactorMap,
  region: RunRegion,
  lightingHireFallback: number,
): object[] {
  const est = estimateRunFromFactors({
    shows,
    factors,
    region,
    lightingHireFallback,
  })
  const defaults = toSyntheticRunDefault(est)
  const factorOverrides: FactorOverrides = {
    accom_per_night: est.accomPerNight,
    per_diem_per_person_per_day: est.perDiemRate,
    food_basics_per_show: est.foodPerShow,
    lighting_hire_per_run: est.lightingHire,
    backline_hire_per_run: est.backlineHire.value ?? undefined,
    crew_fee_adam_sound: factors.crew_fee_adam_sound,
    crew_fee_michael_lighting: factors.crew_fee_michael_lighting,
    crew_fee_michael_pm: factors.crew_fee_michael_pm,
    crew_fee_darryn: factors.crew_fee_darryn,
    crew_fee_danny: factors.crew_fee_danny,
    crew_travel_day_adam: factors.crew_travel_day_adam,
    crew_travel_day_michael: factors.crew_travel_day_michael,
  }

  const rows: object[] = []
  rows.push(withEntries({
    run_id: runId, show_id: null,
    category: 'Crew & Operations', field_key: 'crew_fees_total',
    label: 'Crew Fees (all shows)',
    value: est.crewFeesTotal, state: 'estimated',
    source: est.crewSource,
  }, 'crew_fees_total', defaults, shows, factorOverrides))
  rows.push(withEntries({
    run_id: runId, show_id: null,
    category: 'Production', field_key: 'food_basics',
    label: 'Food & Basics',
    value: est.foodBasics, state: 'estimated',
    source: est.foodSource,
  }, 'food_basics', defaults, shows, factorOverrides))
  rows.push(withEntries({
    run_id: runId, show_id: null,
    category: 'Production', field_key: 'lighting_hire',
    label: displayCostFieldLabel('lighting_hire'),
    value: est.lightingHire, state: 'estimated',
    source: est.lightingSource,
  }, 'lighting_hire', defaults, shows, factorOverrides))
  rows.push(socialAdsVarRow(runId))

  rows.push(withEntries({
    run_id: runId, show_id: null,
    category: 'Travel & Accommodation', field_key: 'flights',
    label: 'Flights (band + crew)',
    value: est.flights.value, state: est.flights.state,
    source: est.flights.source,
  }, 'flights', defaults, shows, factorOverrides))
  rows.push(withEntries({
    run_id: runId, show_id: null,
    category: 'Travel & Accommodation', field_key: 'accommodation',
    label: 'Accommodation',
    value: est.accommodation, state: 'estimated',
    source: est.accommodationSource,
  }, 'accommodation', defaults, shows, factorOverrides))
  rows.push(withEntries({
    run_id: runId, show_id: null,
    category: 'Travel & Accommodation', field_key: 'ground_transport',
    label: 'Ground Transport',
    value: est.groundTransport, state: 'estimated',
    source: est.groundSource,
  }, 'ground_transport', defaults, shows, factorOverrides))
  if (est.crewTravelDay) {
    rows.push(withEntries({
      run_id: runId, show_id: null,
      category: 'Crew & Operations', field_key: 'crew_travel_day',
      label: 'Crew Travel-Day Fee',
      value: est.crewTravelDay.value, state: est.crewTravelDay.state,
      source: est.crewTravelDay.source,
    }, 'crew_travel_day', defaults, shows, factorOverrides))
  }
  rows.push(withEntries({
    run_id: runId, show_id: null,
    category: 'Crew & Operations', field_key: 'per_diems',
    label: 'Per Diems',
    value: est.perDiems, state: 'estimated',
    source: est.perDiemsSource,
  }, 'per_diems', defaults, shows, factorOverrides))
  rows.push(withEntries({
    run_id: runId, show_id: null,
    category: 'Marketing', field_key: 'fb_ads',
    label: 'Facebook / Social Ads',
    value: est.fbAds, state: 'estimated',
    source: est.fbAdsSource,
  }, 'fb_ads', defaults, shows, factorOverrides))
  rows.push(withEntries({
    run_id: runId, show_id: null,
    category: 'Production', field_key: 'backline_hire',
    label: 'Backline Hire (local)',
    value: est.backlineHire.value, state: est.backlineHire.state,
    source: est.backlineHire.source,
  }, 'backline_hire', defaults, shows, factorOverrides))

  for (const show of shows) {
    rows.push(
      withDefaultEntry({ run_id: runId, show_id: show.id, category: 'Revenue', field_key: 'gross_box_office', label: 'Gross Box Office', value: null, state: 'pending', source: null }),
      withDefaultEntry({ run_id: runId, show_id: show.id, category: 'Venue Costs', field_key: 'venue_hire', label: 'Venue Hire', value: null, state: 'guess', source: null }),
      withDefaultEntry({ run_id: runId, show_id: show.id, category: 'Venue Costs', field_key: 'venue_staff', label: 'Venue Staff / On-costs', value: null, state: 'guess', source: null, line_items: [] }),
      withDefaultEntry({ run_id: runId, show_id: show.id, category: 'Venue Costs', field_key: 'venue_marketing', label: 'Venue Marketing', value: 0, state: 'guess', source: null }),
      withDefaultEntry({ run_id: runId, show_id: show.id, category: 'Venue Costs', field_key: 'production_costs', label: displayCostFieldLabel('production_costs'), value: null, state: 'pending', source: null }),
    )
  }

  return rows
}

export function buildSeedCostFieldRows(opts: {
  runId: string
  runCode: string
  shows: SeedShow[]
  lightingHire: number
  factors: FactorMap
  region: RunRegion
}): object[] {
  const defaults = RUN_DEFAULTS[opts.runCode]
  if (defaults) {
    return buildHistoricalSeedRows(opts.runId, defaults, opts.shows, opts.lightingHire)
  }
  return buildFactorEstimateSeedRows(
    opts.runId,
    opts.shows,
    opts.factors,
    opts.region,
    opts.lightingHire,
  )
}

async function existingCostFieldCount(supabase: SupabaseClient, runId: string): Promise<number> {
  const { count } = await supabase
    .from('cost_fields')
    .select('id', { count: 'exact', head: true })
    .eq('run_id', runId)
  return count ?? 0
}

export async function seedRunDefaults(
  supabase: SupabaseClient,
  runId: string,
  runCode: string,
  shows: SeedShow[],
) {
  // Never overwrite Finance-filled or previously seeded sheets.
  if (await existingCostFieldCount(supabase, runId) > 0) return

  const defaults = RUN_DEFAULTS[runCode]
  const lightingHire = (await loadPortalSettings(supabase)).lighting_hire_default ?? LIGHTING_HIRE_PER_RUN

  if (defaults) {
    for (const showDef of defaults.shows) {
      const show = shows.find(s => s.show_order === showDef.showOrder)
      if (!show) continue
      await supabase
        .from('shows')
        .update({
          venue_name: showDef.venueName,
          venue_city: showDef.venueCity,
          state_territory: showDef.state,
          show_date: showDef.showDate,
          capacity: showDef.capacity,
          ticket_price: showDef.ticketPrice,
        })
        .eq('id', show.id)
    }
    await syncRunDatesFromShows(supabase, runId)
  }

  let factors: FactorMap = {}
  let region: RunRegion = resolveSeedRegion(undefined, shows)
  if (!defaults) {
    const [{ data: factorRows }, { data: runRow }] = await Promise.all([
      supabase.from('run_factors').select('key, value'),
      supabase.from('runs').select('region').eq('id', runId).maybeSingle(),
    ])
    factors = parseFactorMap(factorRows)
    region = resolveSeedRegion(runRow?.region, shows)
  }

  const rows = buildSeedCostFieldRows({
    runId,
    runCode,
    shows,
    lightingHire,
    factors,
    region,
  })

  if (rows.length > 0) {
    await supabase.from('cost_fields').insert(rows)
  }
}

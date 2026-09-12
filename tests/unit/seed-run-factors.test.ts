import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { RUN_DEFAULTS, CREW_FEE_PER_SHOW, FOOD_PER_SHOW } from '../../lib/defaults/run-defaults.ts'
import {
  crewFeePerShowFromFactors,
  estimateGroundAndFlights,
  estimateRunFromFactors,
  estimateRunNights,
  fbAdsBracketForCapacity,
  G3_LIGHTING_HIRE_SOURCE,
  parseFactorMap,
  PER_DIEM_PEOPLE,
  resolveSeedRegion,
} from '../../lib/defaults/estimate-from-factors.ts'
import {
  buildSeedCostFieldRows,
  seedRunDefaults,
  type SeedShow,
} from '../../lib/defaults/seed-run.ts'

const FACTORS = {
  crew_fee_adam_sound: 600,
  crew_fee_michael_lighting: 600,
  crew_fee_michael_pm: 250,
  crew_fee_darryn: 600,
  crew_fee_danny: 600,
  food_basics_per_show: 350,
  lighting_hire_per_run: 330,
  accom_per_night: 1400,
  per_diem_per_person_per_day: 40,
  fb_ads_bracket_small: 2500,
  fb_ads_bracket_medium: 3500,
  fb_ads_bracket_large: 5000,
  fb_ads_bracket_flagship: 6000,
  van_hire_group2: 1250,
  van_hire_tas: 800,
  kia_hire_per_day: 200,
  uber_airport_gareth: 100,
  airport_parking_per_run: 150,
  flights_group2_bracket: 2000,
  flights_group3_wa: 4000,
  flights_group3_qld_nt: 3000,
  backline_hire_per_run: 3800,
  crew_travel_day_adam: 250,
  crew_travel_day_michael: 250,
  fuel_per_100km: 2.09,
}

function weekendShows(overrides: Array<Partial<SeedShow> & { state_territory: string; capacity: number }>): SeedShow[] {
  return overrides.map((o, i) => ({
    id: `show-${i + 1}`,
    show_order: i + 1,
    ticket_price: 75,
    venue_name: `Venue ${i + 1}`,
    venue_city: o.venue_city ?? `City ${i + 1}`,
    show_date: o.show_date ?? (i === 0 ? '2026-10-16' : '2026-10-17'),
    capacity: o.capacity,
    state_territory: o.state_territory,
    ...o,
  }))
}

function runRow(rows: object[], fieldKey: string) {
  return rows.find(r => {
    const row = r as { field_key: string; show_id: string | null }
    return row.field_key === fieldKey && row.show_id == null
  }) as {
    field_key: string
    value: number | null
    state: string
    source: string | null
  } | undefined
}

function r01Shows(): SeedShow[] {
  return RUN_DEFAULTS.R01.shows.map(s => ({
    id: `r01-${s.showOrder}`,
    show_order: s.showOrder,
    capacity: s.capacity,
    ticket_price: s.ticketPrice,
    venue_name: s.venueName,
    venue_city: s.venueCity,
    show_date: s.showDate,
    state_territory: s.state,
  }))
}

describe('estimateRunNights / region / crew / fb brackets', () => {
  it('uses inclusive show-date span and falls back to show count', () => {
    assert.equal(estimateRunNights([
      { show_date: '2026-10-16' },
      { show_date: '2026-10-17' },
    ]), 2)
    assert.equal(estimateRunNights([
      { show_date: '2026-10-16' },
      { show_date: '2026-10-16' },
    ]), 1)
    assert.equal(estimateRunNights([
      { show_date: null },
      { show_date: null },
    ]), 2)
    assert.equal(estimateRunNights([]), 0)
  })

  it('prefers runs.region over classify, else classifyRunRegion', () => {
    assert.equal(resolveSeedRegion('group3', [{ state_territory: 'VIC', venue_city: 'Geelong' }]), 'group3')
    assert.equal(resolveSeedRegion('bogus', [{ state_territory: 'VIC', venue_city: 'Geelong' }]), 'group1')
    assert.equal(resolveSeedRegion(null, [{ state_territory: 'NSW', venue_city: 'Gosford' }]), 'group2')
  })

  it('sums Factor crew fee lines and falls back when incomplete', () => {
    const ok = crewFeePerShowFromFactors(FACTORS)
    assert.equal(ok.usedFactors, true)
    assert.equal(ok.perShow, 2650)
    const fallback = crewFeePerShowFromFactors({ crew_fee_adam_sound: 600 })
    assert.equal(fallback.usedFactors, false)
    assert.equal(fallback.perShow, CREW_FEE_PER_SHOW)
  })

  it('brackets FB ads by venue capacity', () => {
    assert.equal(fbAdsBracketForCapacity(548, FACTORS).key, 'fb_ads_bracket_small')
    assert.equal(fbAdsBracketForCapacity(800, FACTORS).key, 'fb_ads_bracket_medium')
    assert.equal(fbAdsBracketForCapacity(1200, FACTORS).key, 'fb_ads_bracket_large')
    assert.equal(fbAdsBracketForCapacity(1892, FACTORS).key, 'fb_ads_bracket_flagship')
    assert.equal(fbAdsBracketForCapacity(null, FACTORS).key, 'fb_ads_bracket_small')
  })
})

describe('Group-aware ground + flights from Factors', () => {
  it('Group 1 is fuel-style / no van and no flights', () => {
    const g1 = estimateGroundAndFlights({
      region: 'group1',
      shows: weekendShows([{ state_territory: 'VIC', capacity: 500 }]),
      factors: FACTORS,
      showCount: 2,
    })
    assert.equal(g1.groundValue, 0)
    assert.equal(g1.groundItems.length, 0)
    assert.match(g1.groundSource, /no van/i)
    assert.equal(g1.flights.value, 0)
  })

  it('Group 2 uses van_hire_group2 + Kia/uber/parking and omits fuel without km', () => {
    const g2 = estimateGroundAndFlights({
      region: 'group2',
      shows: weekendShows([
        { state_territory: 'NSW', capacity: 500 },
        { state_territory: 'NSW', capacity: 800 },
      ]),
      factors: FACTORS,
      showCount: 2,
    })
    assert.equal(g2.groundValue, 1250 + 400 + 100 + 150)
    assert.equal(g2.flights.value, 2000)
    assert.match(g2.groundSource, /van_hire_group2/)
    assert.match(g2.groundSource, /fuel_per_100km/)
  })

  it('Group 2 Tasmania uses van_hire_tas', () => {
    const tas = estimateGroundAndFlights({
      region: 'group2',
      shows: weekendShows([
        { state_territory: 'TAS', capacity: 500 },
        { state_territory: 'TAS', capacity: 500 },
      ]),
      factors: FACTORS,
      showCount: 2,
    })
    assert.equal(tas.groundItems[0]?.amount, 800)
    assert.match(tas.groundSource, /van_hire_tas/)
  })

  it('Group 3 uses flights brackets + local ground (no van)', () => {
    const wa = estimateGroundAndFlights({
      region: 'group3',
      shows: weekendShows([
        { state_territory: 'WA', capacity: 900 },
        { state_territory: 'WA', capacity: 900 },
      ]),
      factors: FACTORS,
      showCount: 2,
    })
    assert.equal(wa.flights.value, 4000)
    assert.equal(wa.groundValue, 400 + 100 + 150)
    assert.match(wa.groundSource, /no van/)

    const qld = estimateGroundAndFlights({
      region: 'group3',
      shows: weekendShows([{ state_territory: 'QLD', capacity: 700 }]),
      factors: FACTORS,
      showCount: 1,
    })
    assert.equal(qld.flights.value, 3000)

    const nz = estimateGroundAndFlights({
      region: 'group3',
      shows: weekendShows([{ state_territory: 'NZ', capacity: 1200, venue_city: 'Auckland' }]),
      factors: FACTORS,
      showCount: 1,
    })
    assert.equal(nz.flights.value, null)
    assert.match(nz.flights.source, /no Group 3 flights bracket/)
  })
})

describe('missing RUN_DEFAULTS uses Factors for cost lines', () => {
  const shows = weekendShows([
    { state_territory: 'NSW', capacity: 500, venue_city: 'Gosford', show_date: '2026-08-21' },
    { state_territory: 'NSW', capacity: 800, venue_city: 'Richmond', show_date: '2026-08-22' },
  ])

  it('fills accom / ground / fb / per_diems / food / crew / lighting from Factors', () => {
    const est = estimateRunFromFactors({
      shows,
      factors: FACTORS,
      region: 'group2',
      lightingHireFallback: 999,
    })
    assert.equal(est.nights, 2)
    assert.equal(est.perDiemPeople, PER_DIEM_PEOPLE)
    assert.equal(est.perDiemDays, 2)
    assert.equal(est.crewUsedFactors, true)
    assert.equal(est.crewFeesTotal, 2650 * 2)
    assert.equal(est.foodBasics, 350 * 2)
    assert.equal(est.foodPerShow, 350)
    assert.notEqual(est.foodPerShow, FOOD_PER_SHOW)
    assert.equal(est.lightingHire, 330)
    assert.match(est.lightingSource, /Factors lighting_hire_per_run/)
    assert.equal(est.accommodation, 1400 * 2)
    assert.match(est.accommodationSource, /inclusive show-date span/)
    assert.equal(est.perDiems, 40 * 2 * 2)
    assert.match(est.perDiemsSource, /Darryn \+ Danny/)
    assert.equal(est.fbAds, 2500 + 3500)
    assert.equal(est.groundTransport, 1250 + 400 + 100 + 150)
    assert.equal(est.flights.value, 2000)

    const rows = buildSeedCostFieldRows({
      runId: 'run-26r01',
      runCode: '26R01',
      shows,
      lightingHire: 999,
      factors: FACTORS,
      region: 'group2',
    })
    assert.equal(runRow(rows, 'crew_fees_total')?.value, 5300)
    assert.equal(runRow(rows, 'crew_fees_total')?.state, 'estimated')
    assert.match(String(runRow(rows, 'crew_fees_total')?.source), /Factors crew fee/)
    assert.equal(runRow(rows, 'food_basics')?.value, 700)
    assert.equal(runRow(rows, 'lighting_hire')?.value, 330)
    assert.equal(runRow(rows, 'accommodation')?.value, 2800)
    assert.equal(runRow(rows, 'accommodation')?.state, 'estimated')
    assert.equal(runRow(rows, 'ground_transport')?.value, 1900)
    assert.equal(runRow(rows, 'per_diems')?.value, 160)
    assert.equal(runRow(rows, 'fb_ads')?.value, 6000)
    assert.equal(runRow(rows, 'flights')?.value, 2000)
  })

  it('uses lighting_hire_per_run over portal fallback; portal when Factor missing', () => {
    const fromFactor = estimateRunFromFactors({
      shows, factors: FACTORS, region: 'group2', lightingHireFallback: 999,
    })
    assert.equal(fromFactor.lightingHire, 330)
    const { lighting_hire_per_run: _drop, ...noLighting } = FACTORS
    const fromPortal = estimateRunFromFactors({
      shows, factors: noLighting, region: 'group2', lightingHireFallback: 440,
    })
    assert.equal(fromPortal.lightingHire, 440)
    assert.match(fromPortal.lightingSource, /portal_settings/)
  })

  it('Group 1 still seeds standing lighting hire $330 from Factors', () => {
    const g1Shows = weekendShows([{ state_territory: 'VIC', capacity: 500, venue_city: 'Geelong' }])
    const est = estimateRunFromFactors({
      shows: g1Shows, factors: FACTORS, region: 'group1', lightingHireFallback: 999,
    })
    assert.equal(est.lightingHire, 330)
    assert.match(est.lightingSource, /Factors lighting_hire_per_run/)
    const rows = buildSeedCostFieldRows({
      runId: 'run-26r-g1',
      runCode: '26RG1',
      shows: g1Shows,
      lightingHire: 999,
      factors: FACTORS,
      region: 'group1',
    })
    const lighting = runRow(rows, 'lighting_hire')
    assert.equal(lighting?.value, 330)
    assert.match(String(lighting?.source), /Factors lighting_hire_per_run/)
  })

  it('Group 3 does not seed standing lighting hire $330', () => {
    const qldShows = weekendShows([
      { state_territory: 'QLD', capacity: 1600, venue_city: 'Brisbane' },
      { state_territory: 'QLD', capacity: 900, venue_city: 'Sunshine Coast' },
    ])
    const est = estimateRunFromFactors({
      shows: qldShows, factors: FACTORS, region: 'group3', lightingHireFallback: 330,
    })
    assert.ok(est.lightingHire === 0 || est.lightingHire == null)
    assert.equal(est.lightingSource, G3_LIGHTING_HIRE_SOURCE)
    const { lighting_hire_per_run: _drop, ...noLighting } = FACTORS
    const noFactor = estimateRunFromFactors({
      shows: qldShows, factors: noLighting, region: 'group3', lightingHireFallback: 330,
    })
    assert.ok(noFactor.lightingHire === 0 || noFactor.lightingHire == null)
    assert.equal(noFactor.lightingSource, G3_LIGHTING_HIRE_SOURCE)

    const rows = buildSeedCostFieldRows({
      runId: 'run-26r05',
      runCode: '26R05',
      shows: qldShows,
      lightingHire: 330,
      factors: FACTORS,
      region: 'group3',
    })
    const lighting = runRow(rows, 'lighting_hire')
    assert.ok(lighting?.value === 0 || lighting?.value == null)
    assert.equal(lighting?.source, G3_LIGHTING_HIRE_SOURCE)
    assert.doesNotMatch(String(lighting?.source), /\$330/)
    assert.equal(runRow(rows, 'flights')?.value, 3000)
    assert.equal(runRow(rows, 'backline_hire')?.value, 3800)
    assert.equal(runRow(rows, 'crew_travel_day')?.value, 500)
    assert.equal(runRow(rows, 'fb_ads')?.value, 6000 + 3500)
    assert.equal(runRow(rows, 'ground_transport')?.value, 400 + 100 + 150)
  })
})

describe('R01 RUN_DEFAULTS path is unchanged', () => {
  it('keeps historical totals and does not apply Factor food/accom/fb/ground', () => {
    const shows = r01Shows()
    const rows = buildSeedCostFieldRows({
      runId: 'run-r01',
      runCode: 'R01',
      shows,
      lightingHire: 330,
      factors: { ...FACTORS, food_basics_per_show: 999, accom_per_night: 1, fb_ads_bracket_small: 1 },
      region: 'group2',
    })

    assert.equal(runRow(rows, 'crew_fees_total')?.value, 3 * CREW_FEE_PER_SHOW)
    assert.equal(runRow(rows, 'crew_fees_total')?.state, 'known')
    assert.match(String(runRow(rows, 'crew_fees_total')?.source), /Fixed rates/)
    assert.equal(runRow(rows, 'food_basics')?.value, 3 * FOOD_PER_SHOW)
    assert.equal(runRow(rows, 'lighting_hire')?.value, 330)
    assert.equal(runRow(rows, 'accommodation')?.value, RUN_DEFAULTS.R01.accommodation.value)
    assert.equal(runRow(rows, 'accommodation')?.source, RUN_DEFAULTS.R01.accommodation.source)
    assert.equal(runRow(rows, 'ground_transport')?.value, RUN_DEFAULTS.R01.groundTransport.value)
    assert.equal(runRow(rows, 'per_diems')?.value, RUN_DEFAULTS.R01.perDiems.value)
    assert.equal(runRow(rows, 'per_diems')?.state, 'known')
    assert.equal(runRow(rows, 'fb_ads')?.value, RUN_DEFAULTS.R01.fbAds.value)
    assert.equal(runRow(rows, 'flights')?.value, RUN_DEFAULTS.R01.flights?.value)
    assert.doesNotMatch(String(runRow(rows, 'accommodation')?.source), /Factors accom_per_night/)
  })
})

describe('seedRunDefaults does not overwrite existing cost_fields', () => {
  it('skips insert when any cost_fields already exist', async () => {
    const inserts: unknown[] = []
    const supabase = {
      from(table: string) {
        const q = {
          select() { return q },
          eq() { return q },
          update() { return q },
          maybeSingle() { return Promise.resolve({ data: { region: 'group2' }, error: null }) },
          insert(rows: unknown[]) {
            inserts.push(rows)
            return Promise.resolve({ error: null })
          },
          then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
            if (table === 'cost_fields') {
              return Promise.resolve({ count: 4, data: [], error: null }).then(resolve, reject)
            }
            return Promise.resolve({ data: [], error: null }).then(resolve, reject)
          },
        }
        return q
      },
    }
    await seedRunDefaults(
      supabase as never,
      'run-existing',
      '26R05',
      weekendShows([{ state_territory: 'QLD', capacity: 900 }]),
    )
    assert.equal(inserts.length, 0)
  })

  it('inserts Factor estimates when the sheet is empty', async () => {
    const inserts: unknown[] = []
    const supabase = {
      from(table: string) {
        const q = {
          select() { return q },
          eq() { return q },
          update() { return q },
          maybeSingle() { return Promise.resolve({ data: { region: 'group2' }, error: null }) },
          insert(rows: unknown[]) {
            inserts.push(rows)
            return Promise.resolve({ error: null })
          },
          then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
            if (table === 'cost_fields') {
              return Promise.resolve({ count: 0, data: [], error: null }).then(resolve, reject)
            }
            if (table === 'run_factors') {
              return Promise.resolve({
                data: Object.entries(FACTORS).map(([key, value]) => ({ key, value })),
                error: null,
              }).then(resolve, reject)
            }
            if (table === 'portal_settings') {
              return Promise.resolve({
                data: [{ key: 'lighting_hire_default', value: 330 }],
                error: null,
              }).then(resolve, reject)
            }
            return Promise.resolve({ data: [], error: null }).then(resolve, reject)
          },
        }
        return q
      },
    }
    await seedRunDefaults(
      supabase as never,
      'run-empty',
      '26R01',
      weekendShows([
        { state_territory: 'NSW', capacity: 500, venue_city: 'Gosford' },
        { state_territory: 'NSW', capacity: 800, venue_city: 'Richmond' },
      ]),
    )
    assert.equal(inserts.length, 1)
    const rows = inserts[0] as object[]
    assert.equal(runRow(rows, 'accommodation')?.value, 2800)
    assert.equal(runRow(rows, 'food_basics')?.value, 700)
    assert.equal(runRow(rows, 'crew_fees_total')?.value, 5300)
  })
})

describe('parseFactorMap', () => {
  it('keeps finite numeric Factor values', () => {
    const map = parseFactorMap([
      { key: 'accom_per_night', value: '1400' },
      { key: 'ticketing_inside_pct', value: null },
      { key: '', value: 1 },
    ])
    assert.equal(map.accom_per_night, 1400)
    assert.equal(map.ticketing_inside_pct, undefined)
  })
})

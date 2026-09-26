import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildFactorFieldPatch,
  buildFactorRefreshUpdate,
  canRefreshCostingsFromFactors,
  computeFactorDerivedValue,
  FACTORS_NEVER_REFRESH_FIELD_KEYS,
  factorsForRefreshGeneration,
  shouldRefreshCostField,
} from '../../lib/factors-refresh.ts'
import { entriesSum } from '../../lib/cost-fields.ts'
import { generateEntries } from '../../lib/defaults/generate-entries.ts'
import { mergeFactorRefreshEntries } from '../../lib/cost-line-tombstones.ts'

describe('Factors refresh gate — unbooked Costings only', () => {
  it('allows unbooked runs and blocks BOOKED including Unconfirm', () => {
    assert.equal(canRefreshCostingsFromFactors({ status: 'proposed' }), true)
    assert.equal(canRefreshCostingsFromFactors({ status: 'booking' }), true)
    assert.equal(canRefreshCostingsFromFactors({ status: 'confirmed' }), false)
    assert.equal(canRefreshCostingsFromFactors({
      status: 'confirmed',
      costings_unconfirmed_at: '2026-09-15T12:00:00.000Z',
    }), false)
  })

  it('never refreshes FB Ads and skips frozen figure-source states', () => {
    assert.equal(FACTORS_NEVER_REFRESH_FIELD_KEYS.has('fb_ads'), true)
    assert.equal(shouldRefreshCostField({
      fieldKey: 'fb_ads',
      state: 'guess',
      runStatus: 'proposed',
    }), false)
    assert.equal(shouldRefreshCostField({
      fieldKey: 'accommodation',
      state: 'estimated',
      runStatus: 'proposed',
    }), true)
    assert.equal(shouldRefreshCostField({
      fieldKey: 'accommodation',
      state: 'estimated',
      runStatus: 'confirmed',
    }), false)
    assert.equal(shouldRefreshCostField({
      fieldKey: 'accommodation',
      state: 'known',
      runStatus: 'proposed',
    }), false)
    assert.equal(shouldRefreshCostField({
      fieldKey: 'inside_fees',
      state: 'estimated',
      runStatus: 'proposed',
    }), false)
    assert.equal(shouldRefreshCostField({
      fieldKey: 'inside_fees',
      state: 'known',
      runStatus: 'proposed',
    }), false)
  })

  it('rebuilds Music Rights / DC from Factors × ticket base', () => {
    const show = { capacity: 400, ticket_price: 80, sell_through_pct: 75 }
    const rights = buildFactorFieldPatch({
      fieldKey: 'music_rights',
      runCode: '26R01',
      numShows: 1,
      factors: { music_rights_pct: 2 },
      show,
    })
    assert.equal(rights?.state, 'auto_calc')
    assert.equal(rights?.value, 480)

    const empty = buildFactorFieldPatch({
      fieldKey: 'music_rights',
      runCode: '26R01',
      numShows: 1,
      factors: {},
      show,
    })
    assert.equal(empty?.state, 'pending')
    assert.equal(empty?.value, null)
    assert.equal(empty?.line_pct, null)

    const preserved = buildFactorFieldPatch({
      fieldKey: 'music_rights',
      runCode: '26R01',
      numShows: 1,
      factors: { music_rights_pct: 2 },
      show,
      existingLinePct: 1.5,
    })
    assert.equal(preserved?.line_pct, 1.5)
    assert.equal(preserved?.state, 'auto_calc')
    assert.equal(preserved?.value, 360)

    const lightingG3 = computeFactorDerivedValue(
      'lighting_hire', '26R05', 2, { lighting_hire_per_run: 330 }, 330, 'group3',
    )
    const lightingG4 = computeFactorDerivedValue(
      'lighting_hire', '26RG4', 1, { lighting_hire_per_run: 330 }, 330, 'group4',
    )
    const lightingG2 = computeFactorDerivedValue(
      'lighting_hire', '26R01', 2, { lighting_hire_per_run: 330 }, 330, 'group2',
    )
    assert.equal(lightingG3, 0)
    assert.equal(lightingG4, 0)
    assert.equal(lightingG2, 330)

    const dc = buildFactorFieldPatch({
      fieldKey: 'daniel_champagne',
      runCode: '26R01',
      numShows: 1,
      factors: {},
      show,
    })
    assert.equal(dc?.state, 'auto_calc')
    assert.equal(dc?.value, 330)
  })

  it('writes backline and crew line items that sum to the refreshed total', () => {
    const factors = factorsForRefreshGeneration({}, null)
    const backlineGenerated = generateEntries('backline_hire', 'estimated', null, [], factors)
    const backlineMerged = mergeFactorRefreshEntries({
      fieldKey: 'backline_hire',
      existing: [{
        id: 'ph',
        description: 'Backline Hire (local)',
        notes: '',
        amount: 0,
        gst_included: true,
        confirmed: false,
        paid: false,
      }],
      generated: backlineGenerated,
    })
    const backline = buildFactorRefreshUpdate({
      fieldKey: 'backline_hire',
      derived: { value: 3800 },
      mergedEntries: backlineMerged,
    })
    assert.equal(backlineMerged.length, 1)
    assert.equal(entriesSum(backlineMerged), 3800)
    assert.equal(backline?.value, 3800)

    const shows = [
      { show_order: 1, venue_city: 'Ringwood', show_date: '2026-10-01' },
      { show_order: 2, venue_city: 'Traralgon', show_date: '2026-10-02' },
    ]
    const crewGenerated = generateEntries('crew_travel_day', 'guess', null, shows, factors)
    const crewMerged = mergeFactorRefreshEntries({
      fieldKey: 'crew_travel_day',
      existing: [{
        id: 'lump',
        description: 'Crew Travel-Day Fee',
        notes: '',
        amount: 0,
        gst_included: true,
        confirmed: false,
        paid: false,
      }],
      generated: crewGenerated,
    })
    const crew = buildFactorRefreshUpdate({
      fieldKey: 'crew_travel_day',
      derived: { value: 500 },
      mergedEntries: crewMerged,
    })
    assert.equal(crewMerged.length, 2)
    assert.equal(entriesSum(crewMerged), 500)
    assert.equal(crew?.value, 500)
    assert.equal(crewMerged.some(e => e.description === 'Crew Travel-Day Fee'), false)
  })

  it('Music Rights with no ticket price refreshes to FIGURES NEEDED, not $0', () => {
    const derived = buildFactorFieldPatch({
      fieldKey: 'music_rights',
      runCode: 'R19',
      numShows: 1,
      factors: { music_rights_pct: 2 },
      show: { capacity: 575, ticket_price: null, sell_through_pct: 75 },
      existingLinePct: 2,
    })
    assert.equal(derived?.state, 'pending')
    assert.equal(derived?.value, null)
    const patch = buildFactorRefreshUpdate({
      fieldKey: 'music_rights',
      derived,
      mergedEntries: [],
    })
    assert.equal(patch?.value, null)
    assert.equal(patch?.state, 'pending')
    assert.equal(Object.prototype.hasOwnProperty.call(patch, 'entries'), false)
  })
})

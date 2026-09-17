import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildFactorFieldPatch,
  canRefreshCostingsFromFactors,
  FACTORS_NEVER_REFRESH_FIELD_KEYS,
  shouldRefreshCostField,
} from '../../lib/factors-refresh.ts'

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
})

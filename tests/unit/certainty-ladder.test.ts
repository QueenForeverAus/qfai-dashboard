import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  CERTAINTY_LADDER_DISPLAY_ORDER,
  estimateAllowedWithoutOwnerEyes,
  isConfirmedStoredState,
  isFiguresNeededStoredState,
  LADDER_CONFIRMED,
  LADDER_ESTIMATE,
  LADDER_FIGURES_NEEDED,
  LADDER_GUESS,
  LADDER_INVOICED,
  LADDER_PAID,
  ladderLabelFromStoredState,
  ladderRank,
  ladderRungForSection,
  ladderRungFromStoredState,
  normalizeStoredCostFieldState,
} from '../../lib/certainty-ladder.ts'
import { isCostFieldState, isNonConfirmedFieldState } from '../../lib/cost-fields.ts'

describe('certainty ladder mapping', () => {
  it('orders worst → best with PAID last and Confirmed ≠ Paid', () => {
    assert.deepEqual(CERTAINTY_LADDER_DISPLAY_ORDER, [
      LADDER_FIGURES_NEEDED,
      LADDER_GUESS,
      LADDER_ESTIMATE,
      LADDER_CONFIRMED,
      LADDER_INVOICED,
      LADDER_PAID,
    ])
    assert.ok(ladderRank(LADDER_CONFIRMED) < ladderRank(LADDER_PAID))
    assert.ok(ladderRank(LADDER_INVOICED) < ladderRank(LADDER_PAID))
  })

  it('maps DB aliases onto ladder labels', () => {
    assert.equal(ladderRungFromStoredState('figures_needed'), LADDER_FIGURES_NEEDED)
    assert.equal(ladderRungFromStoredState('pending'), LADDER_FIGURES_NEEDED)
    assert.equal(ladderRungFromStoredState('guess'), LADDER_GUESS)
    assert.equal(ladderRungFromStoredState('estimated'), LADDER_ESTIMATE)
    assert.equal(ladderRungFromStoredState('estimate'), LADDER_ESTIMATE)
    assert.equal(ladderRungFromStoredState('known'), LADDER_CONFIRMED)
    assert.equal(ladderRungFromStoredState('confirmed'), LADDER_CONFIRMED)
    assert.equal(ladderRungFromStoredState('invoiced'), LADDER_INVOICED)
    assert.equal(ladderLabelFromStoredState('known'), 'CONFIRMED')
    assert.equal(isFiguresNeededStoredState('pending'), true)
    assert.equal(isConfirmedStoredState('known'), true)
    assert.equal(isConfirmedStoredState('confirmed'), true)
    assert.equal(isConfirmedStoredState('invoiced'), false)
  })

  it('normalizes writes: confirmed → known; paid is not a state', () => {
    assert.equal(normalizeStoredCostFieldState('confirmed'), 'known')
    assert.equal(normalizeStoredCostFieldState('known'), 'known')
    assert.equal(normalizeStoredCostFieldState('figures_needed'), 'figures_needed')
    assert.equal(normalizeStoredCostFieldState('paid'), null)
    assert.equal(normalizeStoredCostFieldState('bulk_paid'), null)
    assert.equal(isCostFieldState('confirmed'), true)
    assert.equal(isCostFieldState('figures_needed'), true)
    assert.equal(isCostFieldState('paid'), false)
    assert.equal(isNonConfirmedFieldState('figures_needed'), true)
  })

  it('keeps PAID as entry chrome overlay, not a stored figure-source', () => {
    assert.equal(ladderRungForSection({ storedState: 'known', allPaid: true }), LADDER_PAID)
    assert.equal(ladderRungForSection({ storedState: 'invoiced', allPaid: true }), LADDER_INVOICED)
    assert.equal(ladderRungForSection({ storedState: 'estimated', allPaid: false }), LADDER_ESTIMATE)
    assert.equal(estimateAllowedWithoutOwnerEyes(), true)
  })
})

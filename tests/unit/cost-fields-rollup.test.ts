import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  allEntriesConfirmed,
  fallbackNonConfirmedState,
  isUnconfirmedEntriesSeed,
  pickPriorStateFromAuditRows,
  rolledUpCostFieldState,
  type CostEntry,
} from '../../lib/cost-fields.ts'

function entry(confirmed: boolean, amount = 10): CostEntry {
  return {
    id: `e-${confirmed}-${amount}`,
    description: 'Line',
    notes: '',
    amount,
    gst_included: true,
    confirmed,
  }
}

test('allEntriesConfirmed requires every line ticked', () => {
  assert.equal(allEntriesConfirmed([]), false)
  assert.equal(allEntriesConfirmed(null), false)
  assert.equal(allEntriesConfirmed([entry(true)]), true)
  assert.equal(allEntriesConfirmed([entry(true), entry(false)]), false)
  assert.equal(allEntriesConfirmed([entry(true, 0), entry(true, 0)]), true)
})

test('rolledUpCostFieldState confirms when every line is ticked', () => {
  assert.equal(
    rolledUpCostFieldState({
      entries: [entry(true)],
      currentState: 'guess',
    }),
    'known',
  )
  assert.equal(
    rolledUpCostFieldState({
      entries: [entry(true), entry(true)],
      currentState: 'estimated',
    }),
    'known',
  )
})

test('rolledUpCostFieldState un-confirms to prior non-confirmed state', () => {
  assert.equal(
    rolledUpCostFieldState({
      entries: [entry(true), entry(false)],
      currentState: 'known',
      priorNonConfirmedState: 'guess',
    }),
    'guess',
  )
  assert.equal(
    rolledUpCostFieldState({
      entries: [entry(false)],
      currentState: 'known',
      priorNonConfirmedState: 'estimated',
    }),
    'estimated',
  )
})

test('rolledUpCostFieldState falls back to defined default, never known', () => {
  assert.equal(
    rolledUpCostFieldState({
      entries: [entry(false)],
      currentState: 'known',
      fieldKey: 'flights',
    }),
    'guess',
  )
  assert.equal(
    rolledUpCostFieldState({
      entries: [entry(false)],
      currentState: 'known',
      fieldKey: 'food_basics',
    }),
    'estimated',
  )
  assert.equal(
    rolledUpCostFieldState({
      entries: [entry(false)],
      currentState: 'known',
      fieldKey: 'brad_driver_fee',
    }),
    'estimated',
  )
  assert.equal(fallbackNonConfirmedState('brad_driver_fee'), 'estimated')
})

test('rolledUpCostFieldState leaves mixed sections on their current non-known state', () => {
  assert.equal(
    rolledUpCostFieldState({
      entries: [entry(true), entry(false)],
      currentState: 'estimated',
    }),
    'estimated',
  )
  assert.equal(
    rolledUpCostFieldState({
      entries: [],
      currentState: 'known',
    }),
    'known',
  )
})

test('isUnconfirmedEntriesSeed skips page-open placeholder writes', () => {
  assert.equal(isUnconfirmedEntriesSeed(null, [entry(false)]), true)
  assert.equal(isUnconfirmedEntriesSeed([], [entry(false)]), true)
  assert.equal(isUnconfirmedEntriesSeed([entry(false)], [entry(false)]), false)
  assert.equal(isUnconfirmedEntriesSeed(null, [entry(true)]), false)
})

test('pickPriorStateFromAuditRows reads writeAuditLog and trigger field names', () => {
  assert.equal(
    pickPriorStateFromAuditRows([
      { field_name: 'entries', old_value: '[]', new_value: '[{}]' },
      { field_name: 'state', old_value: 'estimated', new_value: 'known' },
    ]),
    'estimated',
  )
  assert.equal(
    pickPriorStateFromAuditRows([
      { field_name: 'flights.state', old_value: 'guess', new_value: 'known' },
    ]),
    'guess',
  )
  assert.equal(
    pickPriorStateFromAuditRows([
      { field_name: 'state', old_value: 'known', new_value: 'known' },
    ]),
    null,
  )
})

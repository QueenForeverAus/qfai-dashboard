import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  allEntriesConfirmed,
  allEntriesPaid,
  canMarkEntryPaid,
  entryIsPaidLocked,
  normalizeEntries,
  paidLockViolation,
  rolledUpCostFieldState,
  stampPaidAt,
  type CostEntry,
} from '../../lib/cost-fields.ts'

function entry(opts: Partial<CostEntry> & { id: string }): CostEntry {
  return {
    description: 'Line',
    notes: '',
    amount: 10,
    gst_included: true,
    confirmed: false,
    paid: false,
    paid_at: null,
    ...opts,
  }
}

test('canMarkEntryPaid requires line attestation, not cost_fields.state', () => {
  assert.equal(canMarkEntryPaid({ confirmed: false, paid: false }), false)
  assert.equal(canMarkEntryPaid({ confirmed: true, paid: false }), true)
  assert.equal(canMarkEntryPaid({ confirmed: true, paid: true }), true)
})

test('allEntriesPaid requires every line paid; empty is not paid', () => {
  assert.equal(allEntriesPaid([]), false)
  assert.equal(allEntriesPaid(null), false)
  assert.equal(allEntriesPaid([entry({ id: 'a', confirmed: true, paid: true })]), true)
  assert.equal(
    allEntriesPaid([
      entry({ id: 'a', confirmed: true, paid: true }),
      entry({ id: 'b', confirmed: true, paid: false }),
    ]),
    false,
  )
})

test('PAID roll-up does not write or imply cost_fields.state known', () => {
  const paidLines = [
    entry({ id: 'a', confirmed: true, paid: true }),
    entry({ id: 'b', confirmed: true, paid: true }),
  ]
  assert.equal(allEntriesPaid(paidLines), true)
  assert.equal(allEntriesConfirmed(paidLines), true)
  assert.equal(
    rolledUpCostFieldState({ entries: paidLines, currentState: 'known' }),
    'known',
  )
  assert.equal(
    rolledUpCostFieldState({ entries: paidLines, currentState: 'guess' }),
    'known',
  )
})

test('un-pay keeps CONFIRMED attestation roll-up; un-confirm still drops state', () => {
  const unpaidStillConfirmed = [
    entry({ id: 'a', confirmed: true, paid: false }),
    entry({ id: 'b', confirmed: true, paid: false }),
  ]
  assert.equal(allEntriesPaid(unpaidStillConfirmed), false)
  assert.equal(
    rolledUpCostFieldState({ entries: unpaidStillConfirmed, currentState: 'known' }),
    'known',
  )

  const mixed = [
    entry({ id: 'a', confirmed: true, paid: false }),
    entry({ id: 'b', confirmed: false, paid: false }),
  ]
  assert.equal(
    rolledUpCostFieldState({
      entries: mixed,
      currentState: 'known',
      priorNonConfirmedState: 'estimated',
    }),
    'estimated',
  )
})

test('paidLockViolation: cannot pay without confirm tick (Edit→Confirmed is not enough)', () => {
  const prev = [entry({ id: 'a', confirmed: false, paid: false })]
  const next = [entry({ id: 'a', confirmed: false, paid: true })]
  assert.match(paidLockViolation(prev, next) ?? '', /confirmed/i)
})

test('paidLockViolation: locked fields rejected until un-pay', () => {
  const prev = [entry({ id: 'a', confirmed: true, paid: true, amount: 10, description: 'Hotel' })]
  assert.match(
    paidLockViolation(prev, [entry({ id: 'a', confirmed: true, paid: true, amount: 99, description: 'Hotel' })]) ?? '',
    /locked/i,
  )
  assert.match(
    paidLockViolation(prev, [entry({ id: 'a', confirmed: true, paid: true, amount: 10, description: 'Changed' })]) ?? '',
    /locked/i,
  )
  assert.match(
    paidLockViolation(prev, [entry({ id: 'a', confirmed: true, paid: true, amount: 10, notes: 'nope' })]) ?? '',
    /locked/i,
  )
  assert.match(
    paidLockViolation(prev, [entry({ id: 'a', confirmed: false, paid: true, amount: 10, description: 'Hotel' })]) ?? '',
    /confirmed|locked/i,
  )
  assert.equal(
    paidLockViolation(prev, [entry({ id: 'a', confirmed: true, paid: true, amount: 10, description: 'Hotel' })]),
    null,
  )
})

test('paidLockViolation: un-pay in the same payload unlocks edits and delete', () => {
  const prev = [entry({ id: 'a', confirmed: true, paid: true, amount: 10, description: 'Hotel' })]
  assert.equal(
    paidLockViolation(prev, [entry({ id: 'a', confirmed: true, paid: false, amount: 99, description: 'Hotel v2' })]),
    null,
  )
  assert.match(
    paidLockViolation(prev, []) ?? '',
    /remove/i,
  )
  assert.equal(
    paidLockViolation(
      prev,
      [entry({ id: 'a', confirmed: true, paid: false, amount: 10, description: 'Hotel' })],
    ),
    null,
  )
})

test('stampPaidAt sets paid_at on pay and clears on un-pay', () => {
  const prev = [entry({ id: 'a', confirmed: true, paid: false })]
  const stamped = stampPaidAt(
    [entry({ id: 'a', confirmed: true, paid: true })],
    prev,
    '2026-09-07T00:00:00.000Z',
  )
  assert.equal(stamped[0].paid_at, '2026-09-07T00:00:00.000Z')

  const kept = stampPaidAt(
    [entry({ id: 'a', confirmed: true, paid: true, paid_at: '2026-01-01T00:00:00.000Z' })],
    [entry({ id: 'a', confirmed: true, paid: true, paid_at: '2026-01-01T00:00:00.000Z' })],
    '2026-09-07T00:00:00.000Z',
  )
  assert.equal(kept[0].paid_at, '2026-01-01T00:00:00.000Z')

  const cleared = stampPaidAt(
    [entry({ id: 'a', confirmed: true, paid: false, paid_at: '2026-01-01T00:00:00.000Z' })],
    [entry({ id: 'a', confirmed: true, paid: true, paid_at: '2026-01-01T00:00:00.000Z' })],
  )
  assert.equal(cleared[0].paid_at, null)
})

test('normalizeEntries defaults paid false and preserves paid_at when paid', () => {
  const rows = normalizeEntries([
    { id: 'a', description: 'X', notes: '', amount: 1, gst_included: true, confirmed: true },
    { id: 'b', description: 'Y', notes: '', amount: 2, gst_included: true, confirmed: true, paid: true, paid_at: '2026-09-01T12:00:00.000Z' },
  ])
  assert.equal(rows?.[0].paid, false)
  assert.equal(rows?.[0].paid_at, null)
  assert.equal(rows?.[1].paid, true)
  assert.equal(rows?.[1].paid_at, '2026-09-01T12:00:00.000Z')
})

test('entryIsPaidLocked is the line lock, not section state', () => {
  assert.equal(entryIsPaidLocked({ paid: true }), true)
  assert.equal(entryIsPaidLocked({ paid: false }), false)
  assert.equal(entryIsPaidLocked(null), false)
})

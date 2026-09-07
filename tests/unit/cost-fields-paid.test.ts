import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  ALL_PAID_SECTION_CHIP_LABEL,
  allEntriesConfirmed,
  allEntriesPaid,
  canMarkEntryPaid,
  CONFIRMED_FIELD_STATE,
  displayCostFieldChipLabel,
  displayCostFieldChromeState,
  ensurePaidLinesConfirmed,
  entryIsAttested,
  entryIsPaidLocked,
  normalizeEntries,
  paidLockViolation,
  paymentDidNotChangeAttestationTicks,
  rolledUpCostFieldState,
  shouldSkipConfirmRollup,
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

test('all-PAID display overlay uses confirmed chrome + CONFIRMED chip without writing state', () => {
  const paidGuess = [
    entry({ id: 'a', confirmed: true, paid: true }),
    entry({ id: 'b', confirmed: true, paid: true }),
  ]
  assert.equal(ALL_PAID_SECTION_CHIP_LABEL, 'CONFIRMED')
  assert.equal(displayCostFieldChromeState('guess', paidGuess), CONFIRMED_FIELD_STATE)
  assert.equal(displayCostFieldChipLabel('guess', paidGuess, 'GUESS'), ALL_PAID_SECTION_CHIP_LABEL)
  assert.equal(displayCostFieldChromeState('estimated', paidGuess), CONFIRMED_FIELD_STATE)
  assert.equal(
    rolledUpCostFieldState({ entries: paidGuess, currentState: 'guess' }),
    'known',
  )
})

test('un-pay drops the display overlay back to stored figure-source state', () => {
  const mixed = [
    entry({ id: 'a', confirmed: true, paid: true }),
    entry({ id: 'b', confirmed: true, paid: false }),
  ]
  assert.equal(allEntriesPaid(mixed), false)
  assert.equal(displayCostFieldChromeState('guess', mixed), 'guess')
  assert.equal(displayCostFieldChipLabel('guess', mixed, 'GUESS'), 'GUESS')
  assert.equal(displayCostFieldChromeState('estimated', mixed), 'estimated')
  assert.equal(displayCostFieldChipLabel('estimated', mixed, 'ESTIMATE'), 'ESTIMATE')
})

test('paid lines count as attested; ensurePaidLinesConfirmed ticks them', () => {
  assert.equal(entryIsAttested({ confirmed: false, paid: true }), true)
  assert.equal(entryIsAttested({ confirmed: true, paid: false }), true)
  assert.equal(entryIsAttested({ confirmed: false, paid: false }), false)

  const repaired = ensurePaidLinesConfirmed([
    entry({ id: 'a', confirmed: false, paid: true }),
    entry({ id: 'b', confirmed: true, paid: false }),
  ])
  assert.equal(repaired.entries[0].confirmed, true)
  assert.equal(repaired.newlyConfirmed.length, 1)
  assert.equal(repaired.newlyConfirmed[0].id, 'a')
  assert.equal(repaired.entries[1].confirmed, true)
})

test('payment-only confirm flips skip figure-source rollup', () => {
  const before = [
    entry({ id: 'a', confirmed: true, paid: false }),
    entry({ id: 'b', confirmed: false, paid: false }),
  ]
  const afterPayImplied = [
    entry({ id: 'a', confirmed: true, paid: true }),
    entry({ id: 'b', confirmed: true, paid: true }),
  ]
  assert.equal(paymentDidNotChangeAttestationTicks(before, afterPayImplied), true)
  assert.equal(shouldSkipConfirmRollup({ paymentImpliedConfirmsOnly: true }), true)

  const afterRealConfirm = [
    entry({ id: 'a', confirmed: true, paid: false }),
    entry({ id: 'b', confirmed: true, paid: false }),
  ]
  assert.equal(paymentDidNotChangeAttestationTicks(before, afterRealConfirm), false)
  assert.equal(allEntriesConfirmed(afterRealConfirm), true)
})

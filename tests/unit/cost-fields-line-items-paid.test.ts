import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  ALL_PAID_SECTION_CHIP_LABEL,
  applyBulkMarkAllPaid,
  canMarkEntryPaid,
  CONFIRMED_FIELD_STATE,
  displayCostFieldChipLabel,
  displayCostFieldChromeState,
  formatBulkPaidAuditCopy,
  formatPaidRestoreAuditCopy,
  hasBulkPaidSnapshot,
  lineItemsSum,
  normalizeLineItems,
  paidLineItemLockViolation,
  restorePaidSnapshot,
  rolledUpCostFieldState,
  sectionEditSelectValue,
  sectionPayableLines,
  SECTION_BULK_PAID_VALUE,
  shouldSkipConfirmRollup,
  stampPaidAt,
  type StaffLineItem,
} from '../../lib/cost-fields.ts'

function role(opts: Partial<StaffLineItem> & { id: string }): StaffLineItem {
  return {
    role: 'Ushers',
    rate: 50,
    hours: 3,
    headcount: 2,
    source: '',
    confirmed: false,
    paid: false,
    paid_at: null,
    paid_snapshot: null,
    ...opts,
  }
}

test('normalizeLineItems assigns ids and paid flags without changing rate×hrs×hc', () => {
  const rows = normalizeLineItems([
    { role: 'Ushers', rate: 50, hours: 3, headcount: 2, source: 'Harbour' },
    { id: 'keep-me', role: 'Security', rate: 70, hours: 5, headcount: 1, confirmed: true, paid: true, paid_at: '2026-09-01T00:00:00.000Z' },
  ])
  assert.equal(rows?.length, 2)
  assert.ok(rows?.[0].id)
  assert.equal(rows?.[0].confirmed, false)
  assert.equal(rows?.[0].paid, false)
  assert.equal(rows?.[1].id, 'keep-me')
  assert.equal(rows?.[1].paid, true)
  assert.equal(lineItemsSum(rows), 50 * 3 * 2 + 70 * 5 * 1)
})

test('sectionPayableLines prefers venue_staff roles over entries', () => {
  const entries = [{ id: 'e1', confirmed: true, paid: true }]
  const items = [role({ id: 'r1', confirmed: true, paid: false })]
  assert.deepEqual(sectionPayableLines('venue_staff', entries, items), items)
  assert.deepEqual(sectionPayableLines('venue_hire', entries, items), entries)
  assert.deepEqual(sectionPayableLines('venue_staff', entries, []), entries)
})

test('paidLineItemLockViolation: cannot pay without confirm; locks rate/hrs/hc/role', () => {
  const prev = [role({ id: 'a', confirmed: false, paid: false })]
  assert.match(paidLineItemLockViolation(prev, [role({ id: 'a', confirmed: false, paid: true })]) ?? '', /confirmed/i)

  const paid = [role({ id: 'a', confirmed: true, paid: true, rate: 50, hours: 3, headcount: 2, role: 'Ushers' })]
  assert.match(paidLineItemLockViolation(paid, [role({ id: 'a', confirmed: true, paid: true, rate: 99, hours: 3, headcount: 2, role: 'Ushers' })]) ?? '', /locked/i)
  assert.match(paidLineItemLockViolation(paid, [role({ id: 'a', confirmed: true, paid: true, rate: 50, hours: 9, headcount: 2, role: 'Ushers' })]) ?? '', /locked/i)
  assert.match(paidLineItemLockViolation(paid, [role({ id: 'a', confirmed: true, paid: true, rate: 50, hours: 3, headcount: 8, role: 'Ushers' })]) ?? '', /locked/i)
  assert.match(paidLineItemLockViolation(paid, [role({ id: 'a', confirmed: true, paid: true, rate: 50, hours: 3, headcount: 2, role: 'Changed' })]) ?? '', /locked/i)
  assert.equal(
    paidLineItemLockViolation(paid, [role({ id: 'a', confirmed: true, paid: false, rate: 99, hours: 3, headcount: 2, role: 'Ushers' })]),
    null,
  )
})

test('MARK ALL / restore on roles keeps figure-source rollup skip and snapshot map', () => {
  const rows = [
    role({ id: 'a', role: 'Ushers', confirmed: true, paid: true, paid_at: '2026-01-01T00:00:00.000Z' }),
    role({ id: 'b', role: 'Security', confirmed: false, paid: false }),
  ]
  const next = applyBulkMarkAllPaid(rows, '2026-09-07T00:00:00.000Z')
  assert.equal(next[0].paid, true)
  assert.equal(next[1].paid, true)
  assert.equal(next[1].confirmed, true)
  assert.deepEqual(next[1].paid_snapshot, { paid: false, paid_at: null, confirmed: false })
  assert.equal(hasBulkPaidSnapshot(next), true)
  assert.equal(sectionEditSelectValue(next, 'guess'), SECTION_BULK_PAID_VALUE)
  assert.equal(shouldSkipConfirmRollup({ bulkPaidApplied: true }), true)

  const restored = restorePaidSnapshot(next)
  assert.equal(restored[0].paid, true)
  assert.equal(restored[1].paid, false)
  assert.equal(restored[1].confirmed, true)
  assert.equal(hasBulkPaidSnapshot(restored), false)
})

test('all-roles-PAID overlay is CONFIRMED chrome without writing state', () => {
  const paid = [
    role({ id: 'a', confirmed: true, paid: true }),
    role({ id: 'b', confirmed: true, paid: true }),
  ]
  assert.equal(canMarkEntryPaid(paid[0]), true)
  assert.equal(displayCostFieldChromeState('guess', paid), CONFIRMED_FIELD_STATE)
  assert.equal(displayCostFieldChipLabel('guess', paid, 'GUESS'), ALL_PAID_SECTION_CHIP_LABEL)
  assert.equal(
    rolledUpCostFieldState({ entries: paid, currentState: 'guess' }),
    'known',
  )
  const mixed = [role({ id: 'a', confirmed: true, paid: true }), role({ id: 'b', confirmed: true, paid: false })]
  assert.equal(displayCostFieldChromeState('guess', mixed), 'guess')
})

test('stampPaidAt on roles sets and clears paid_at', () => {
  const stamped = stampPaidAt(
    [role({ id: 'a', confirmed: true, paid: true })],
    [role({ id: 'a', confirmed: true, paid: false })],
    '2026-09-07T00:00:00.000Z',
  )
  assert.equal(stamped[0].paid_at, '2026-09-07T00:00:00.000Z')
  const cleared = stampPaidAt(
    [role({ id: 'a', confirmed: true, paid: false })],
    [role({ id: 'a', confirmed: true, paid: true, paid_at: '2026-01-01T00:00:00.000Z' })],
  )
  assert.equal(cleared[0].paid_at, null)
})

test('role MARK ALL audit copy says roles, not lines', () => {
  const copy = formatBulkPaidAuditCopy({
    actorName: 'Gareth',
    sectionLabel: 'Venue Staff / On-costs',
    showLabel: 'Broken Hill Civic',
    runCode: 'G2 R01',
    unit: 'role',
    entries: [
      role({ id: 'aaaaaaaa-1111', role: 'Ushers', confirmed: true, paid: true }),
      role({ id: 'bbbbbbbb-2222', role: 'Security', confirmed: false }),
    ],
  })
  assert.match(copy.newValue, /marked all roles in Venue Staff/)
  assert.match(copy.newValue, /2 roles/)
  assert.match(copy.newValue, /1 was not confirm-ticked/)
  assert.match(copy.newValue, /Security/)
  assert.match(copy.newValue, /also confirmed 1 role/)
  assert.match(copy.oldValue, /1 of 2 roles already paid/)
  assert.doesNotMatch(copy.newValue, /known|estimated|guess/i)
})

test('role restore audit copy lists unpaid-again roles', () => {
  const before = applyBulkMarkAllPaid([
    role({ id: 'aaaaaaaa-1111', role: 'Ushers', confirmed: true, paid: true, paid_at: '2026-01-01T00:00:00.000Z' }),
    role({ id: 'bbbbbbbb-2222', role: 'Security', confirmed: false }),
  ])
  const after = restorePaidSnapshot(before)
  const copy = formatPaidRestoreAuditCopy({
    actorName: 'Gareth',
    sectionLabel: 'Venue Staff',
    unit: 'role',
    before,
    after,
  })
  assert.match(copy.newValue, /restored prior PAID snapshot/)
  assert.match(copy.newValue, /1 role unpaid again/)
  assert.match(copy.newValue, /Security/)
})

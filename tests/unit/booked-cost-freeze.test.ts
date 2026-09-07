import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  BOOKED_BOOKING_STATUS,
  BOOKED_COST_FREEZE_BADGE,
  BOOKED_COST_FREEZE_BANNER,
  BOOKED_COST_FREEZE_ERROR,
  BOOKED_COST_SNAPSHOT_KIND,
  buildBookedCostSnapshot,
  costLineMutationBlockedReason,
  formatBookedCostFreezeAuditCopy,
  hasBookedCostSnapshot,
  isBookedBookingStatus,
  isFrozenCostLineMutation,
  isRunCostSheetFrozen,
  isSellThroughFrozenByBookedGate,
  parseBookedCostSnapshot,
  shouldCaptureBookedCostSnapshot,
  snapshotIncludesSellThrough,
  UNFROZEN_SCENARIO_FIELDS,
} from '../../lib/booked-cost-freeze.ts'

const venueHireField = {
  id: 'cf-hire',
  run_id: 'run-r12',
  show_id: 'show-1',
  category: 'Venue Costs',
  field_key: 'venue_hire',
  label: 'Venue Hire',
  value: 1451,
  state: 'guess',
  source: 'Draft',
  entries: [{ id: 'e1', description: 'Hire', notes: '', amount: 1451, gst_included: true, confirmed: true, paid: false }],
  line_items: [],
}

const runFlightsField = {
  id: 'cf-flights',
  run_id: 'run-r12',
  show_id: null,
  category: 'Travel',
  field_key: 'flights',
  label: 'Flights',
  value: 2200,
  state: 'estimated',
  source: null,
  entries: [{ id: 'e2', description: 'Flights', notes: '', amount: 2200, gst_included: false, confirmed: false, paid: false }],
  line_items: [],
}

describe('BOOKED cost freeze gate', () => {
  it('maps confirmed booking status to BOOKED', () => {
    assert.equal(isBookedBookingStatus('confirmed'), true)
    assert.equal(isBookedBookingStatus('CONFIRMED'), true)
    assert.equal(isBookedBookingStatus(BOOKED_BOOKING_STATUS), true)
    assert.equal(isBookedBookingStatus('proposed'), false)
    assert.equal(isBookedBookingStatus('booking'), false)
    assert.equal(isBookedBookingStatus('declined'), false)
    assert.equal(isBookedBookingStatus(null), false)
  })

  it('freezes the Run Costing sheet only while the run is BOOKED', () => {
    assert.equal(isRunCostSheetFrozen({ status: 'confirmed' }), true)
    assert.equal(isRunCostSheetFrozen({ status: 'proposed' }), false)
    assert.equal(isRunCostSheetFrozen({ status: 'declined' }), false)
    assert.equal(isRunCostSheetFrozen({ status: 'booking' }), false)
    assert.equal(isRunCostSheetFrozen(null), false)
  })

  it('blocks confirm / PAID / pencil mutations when frozen and allows them when not', () => {
    assert.equal(costLineMutationBlockedReason(true), BOOKED_COST_FREEZE_ERROR)
    assert.equal(costLineMutationBlockedReason(false), null)
    for (const kind of ['confirm_tick', 'paid', 'pencil', 'section_payment', 'entries', 'line_items', 'cost_field_create']) {
      assert.equal(isFrozenCostLineMutation(kind), true, kind)
    }
    assert.equal(isFrozenCostLineMutation('sell_through_pct'), false)
  })

  it('does not freeze sell-through as part of the BOOKED cost gate', () => {
    assert.equal(isSellThroughFrozenByBookedGate(), false)
    assert.deepEqual(UNFROZEN_SCENARIO_FIELDS, ['sell_through_pct'])
  })

  it('captures a snapshot on the first BOOKED transition and is idempotent while still BOOKED', () => {
    assert.equal(shouldCaptureBookedCostSnapshot({
      nextStatus: 'confirmed',
      prevStatus: 'proposed',
      hasSnapshot: false,
    }), true)
    assert.equal(shouldCaptureBookedCostSnapshot({
      nextStatus: 'confirmed',
      prevStatus: 'confirmed',
      hasSnapshot: true,
    }), false)
    assert.equal(shouldCaptureBookedCostSnapshot({
      nextStatus: 'confirmed',
      prevStatus: 'confirmed',
      hasSnapshot: false,
    }), true)
    assert.equal(shouldCaptureBookedCostSnapshot({
      nextStatus: 'proposed',
      prevStatus: 'confirmed',
      hasSnapshot: true,
    }), false)
  })

  it('recaptures when a run is BOOKED again after Unconfirm', () => {
    assert.equal(shouldCaptureBookedCostSnapshot({
      nextStatus: 'confirmed',
      prevStatus: 'proposed',
      hasSnapshot: true,
    }), true)
  })

  it('snapshots venue + run cost lines and omits sell-through', () => {
    const snap = buildBookedCostSnapshot({
      runId: 'run-r12',
      runCode: 'R12',
      capturedAt: '2026-09-07T15:00:00.000Z',
      fields: [venueHireField, runFlightsField],
    })
    assert.equal(snap.kind, BOOKED_COST_SNAPSHOT_KIND)
    assert.equal(snap.booking_status, 'confirmed')
    assert.equal(snap.field_count, 2)
    assert.deepEqual(snap.fields.map(f => f.field_key).sort(), ['flights', 'venue_hire'])
    assert.equal(snapshotIncludesSellThrough(snap), false)
    assert.ok(hasBookedCostSnapshot(snap))
    const parsed = parseBookedCostSnapshot(snap)
    assert.ok(parsed)
    assert.equal(parsed!.run_code, 'R12')
    assert.equal(parseBookedCostSnapshot({ version: 1, fields: [] }), null)
  })

  it('writes a freeze audit sentence that does not mention Settlements Finalise', () => {
    const copy = formatBookedCostFreezeAuditCopy({
      actorName: 'Gareth',
      runCode: 'R12',
      fieldCount: 12,
    })
    assert.equal(copy.fieldName, 'BOOKED cost freeze')
    assert.match(copy.newValue, /froze the Run Costing sheet for R12 at BOOKED/)
    assert.match(copy.newValue, /Sell-through stays editable/)
    assert.doesNotMatch(copy.newValue, /Finalise/i)
    assert.match(BOOKED_COST_FREEZE_BANNER, /frozen/i)
    assert.match(BOOKED_COST_FREEZE_BADGE, /BOOKED/)
  })
})

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  mergeAdvancingFieldPreserve,
  mergeCostingCopiesPreservingAdvancing,
  mergePreservedState,
  preservePaidEntries,
  preservePaidLineItems,
} from '../../lib/advancing-preserve.ts'
import { INVOICED_FIELD_STATE } from '../../lib/cost-fields.ts'
import { shouldArchiveAdvancingWorkspace } from '../../lib/run-advancing.ts'
import {
  canRebookAfterUnconfirm,
  canUnconfirmRun,
  costingsEditableAfterUnconfirm,
  shouldArchiveAdvancingOnUnconfirm,
  unconfirmKeepsBookedStatus,
} from '../../lib/unconfirm.ts'

const paidTravel = {
  id: 'adv-flight',
  description: 'SYD-MEL',
  notes: '',
  amount: 420,
  gst_included: false,
  confirmed: true,
  paid: true,
  paid_at: '2026-09-10T00:00:00.000Z',
  confirmation_id: 'ABC123',
  night_date: null,
  receipt_kind: 'charge' as const,
}

describe('Unconfirm stays BOOKED and preserves Advancing chrome', () => {
  it('unlocks Costings without dropping status or archiving Advancing', () => {
    assert.equal(unconfirmKeepsBookedStatus('confirmed', 'confirmed'), true)
    assert.equal(shouldArchiveAdvancingOnUnconfirm(), false)
    assert.equal(shouldArchiveAdvancingWorkspace({
      nextStatus: 'confirmed',
      prevStatus: 'confirmed',
      hasActiveWorkspace: true,
    }), false)
    assert.equal(costingsEditableAfterUnconfirm({
      status: 'confirmed',
      costings_unconfirmed_at: '2026-09-15T12:00:00.000Z',
    }), true)
    assert.deepEqual(canUnconfirmRun({
      role: 'owner',
      status: 'confirmed',
    }), { ok: true })
    assert.equal(canUnconfirmRun({ role: 'production', status: 'confirmed' }).ok, false)
    assert.equal(canUnconfirmRun({ role: 'owner', status: 'proposed' }).ok, false)
    assert.equal(canRebookAfterUnconfirm({
      role: 'admin',
      status: 'confirmed',
      costingsUnconfirmedAt: '2026-09-15T12:00:00.000Z',
    }).ok, true)
    assert.equal(canRebookAfterUnconfirm({
      role: 'admin',
      status: 'confirmed',
    }).ok, false)
  })

  it('merges Costings structure over Advancing while keeping PAID / INVOICED / travel / comps', () => {
    const costingEntries = [{
      id: 'c-flight',
      description: 'SYD-MEL',
      notes: 'new fare',
      amount: 510,
      gst_included: false,
      confirmed: true,
      paid: false,
      paid_at: null,
      confirmation_id: 'ABC123',
      night_date: null,
      receipt_kind: 'charge' as const,
    }]
    const mergedEntries = preservePaidEntries(costingEntries, [paidTravel])
    assert.equal(mergedEntries[0].amount, 510)
    assert.equal(mergedEntries[0].paid, true)
    assert.equal(mergedEntries[0].paid_at, '2026-09-10T00:00:00.000Z')
    assert.equal(mergedEntries[0].confirmation_id, 'ABC123')

    const mergedRoles = preservePaidLineItems(
      [{ id: 'role-1', role: 'FOH', rate: 55, hours: 4, headcount: 1, confirmed: true, paid: false }],
      [{ id: 'role-1', role: 'FOH', rate: 50, hours: 4, headcount: 1, confirmed: true, paid: true, paid_at: '2026-09-11T00:00:00.000Z' }],
    )
    assert.equal(mergedRoles?.[0].rate, 55)
    assert.equal(mergedRoles?.[0].paid, true)

    assert.equal(mergePreservedState('known', INVOICED_FIELD_STATE), INVOICED_FIELD_STATE)
    assert.equal(mergePreservedState('guess', 'estimated'), 'guess')

    const merged = mergeCostingCopiesPreservingAdvancing(
      [{
        show_id: 'show-1',
        field_key: 'venue_hire',
        state: 'known',
        value: 2000,
        entries: costingEntries,
      }],
      [{
        show_id: 'show-1',
        field_key: 'venue_hire',
        state: INVOICED_FIELD_STATE,
        value: 1800,
        entries: [paidTravel],
      }, {
        show_id: 'show-1',
        field_key: 'band_comps',
        state: 'known',
        value: 0,
        entries: [{
          id: 'comp-1',
          description: 'Band comps hook',
          notes: '',
          amount: 0,
          gst_included: false,
          confirmed: true,
          paid: false,
          paid_at: null,
        }],
      }],
    )
    const hire = merged.find(r => r.field_key === 'venue_hire')
    const comps = merged.find(r => r.field_key === 'band_comps')
    assert.equal(hire?.state, INVOICED_FIELD_STATE)
    assert.equal(hire?.value, 2000)
    assert.equal(hire?.entries?.[0].paid, true)
    assert.ok(comps)
    assert.equal(comps?.entries?.[0].description, 'Band comps hook')

    const compsOnly = mergeAdvancingFieldPreserve(
      { show_id: 'show-1', field_key: 'venue_staff', state: 'guess' },
      { show_id: 'show-1', field_key: 'band_comps', state: 'known', value: 12 },
    )
    assert.equal(compsOnly.field_key, 'band_comps')
    assert.equal(compsOnly.value, 12)
  })

  it('preserves Advancing Music Rights show-local line_pct on Costings recopy', () => {
    const withAdvancingPct = mergeCostingCopiesPreservingAdvancing(
      [{
        show_id: 'show-1',
        field_key: 'music_rights',
        state: 'auto_calc',
        value: 400,
        line_pct: 2,
      }],
      [{
        show_id: 'show-1',
        field_key: 'music_rights',
        state: 'auto_calc',
        value: 300,
        line_pct: 1.5,
      }],
    )
    assert.equal(withAdvancingPct[0]?.line_pct, 1.5)
    assert.equal(withAdvancingPct[0]?.value, 300)

    const costingPctWhenAdvancingEmpty = mergeCostingCopiesPreservingAdvancing(
      [{
        show_id: 'show-1',
        field_key: 'music_rights',
        state: 'auto_calc',
        value: 400,
        line_pct: 2,
      }],
      [{
        show_id: 'show-1',
        field_key: 'music_rights',
        state: 'auto_calc',
        value: 400,
        line_pct: null,
      }],
    )
    assert.equal(costingPctWhenAdvancingEmpty[0]?.line_pct, 2)

    const noInventedAuPct = mergeCostingCopiesPreservingAdvancing(
      [{
        show_id: 'show-1',
        field_key: 'music_rights',
        state: 'auto_calc',
        value: null,
        line_pct: null,
      }],
      [{
        show_id: 'show-1',
        field_key: 'music_rights',
        state: 'auto_calc',
        value: null,
      }],
    )
    assert.equal(noInventedAuPct[0]?.line_pct, null)
  })

  it('re-BOOK does not resurrect Advancing-tombstoned inside lines', () => {
    const merged = mergeCostingCopiesPreservingAdvancing(
      [{
        show_id: 'show-1',
        field_key: 'inside_fees',
        state: 'estimated',
        value: 450,
        entries: [{
          id: 'booking',
          description: 'Booking fee',
          notes: '',
          amount: 450,
          gst_included: true,
          confirmed: false,
          seed_key: 'booking_fee',
        }],
      }],
      [],
      { advancingTombstones: [{ show_id: 'show-1', field_key: 'inside_fees', seed_key: 'booking_fee' }] },
    )
    assert.equal(merged[0]?.entries?.length, 0)
  })
})

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  HARBOUR_DATE_MOVE_SHOW_KEYS,
  HARBOUR_IMPORT_NEVER_WRITE,
  HARBOUR_PATCHABLE_RUN_KEYS,
  HARBOUR_PATCHABLE_SHOW_KEYS,
  isHarbourPatchableShowKey,
  pickHarbourShowPatch,
} from '../../lib/import-schedule-harbour-fields.ts'

describe('Import Schedule Harbour-patchable keys', () => {
  it('documents the today show allowlist (match by show_date)', () => {
    assert.deepEqual([...HARBOUR_PATCHABLE_SHOW_KEYS], [
      'venue_name',
      'capacity',
      'state_territory',
      'ticket_price',
    ])
    assert.deepEqual([...HARBOUR_PATCHABLE_RUN_KEYS], ['status'])
  })

  it('does not treat show_date as apply-patchable until same-id date-move lands', () => {
    assert.deepEqual([...HARBOUR_DATE_MOVE_SHOW_KEYS], ['show_date'])
    assert.equal(isHarbourPatchableShowKey('show_date'), false)
    assert.equal('show_date' in pickHarbourShowPatch({
      show_date: { from: '2026-09-10', to: '2026-09-12' },
      venue_name: { from: 'TBC', to: 'Civic Theatre' },
    }), false)
  })

  it('strips QF-entered and other non-Harbour keys from a crafted PUT body', () => {
    const patch = pickHarbourShowPatch({
      venue_name: { from: 'TBC', to: 'Civic Theatre' },
      capacity: { from: 800, to: 900 },
      state_territory: { from: null, to: 'NSW' },
      ticket_price: { from: 79, to: 85 },
      michael_notes: { from: 'keep', to: '' },
      travel_access_notes: { from: 'gate B', to: null },
      hotel_notes: { from: 'Novotel', to: '' },
      hospitality_merch_notes: { from: '2 tables', to: '' },
      travel_blocks: { from: [{ id: 'tb1' }], to: [] },
      cost_fields: { from: 1200, to: 0 },
      settlements: { from: 'open', to: null },
      advancement_items: { from: ['x'], to: [] },
      worksheet_fields: { from: { sched_doors: '18:00' }, to: {} },
      venue_city: { from: 'Newcastle', to: 'Tamworth' },
      ticket_outlook: { from: 'watch', to: null },
    })

    assert.deepEqual(patch, {
      venue_name: 'Civic Theatre',
      capacity: 900,
      state_territory: 'NSW',
      ticket_price: 85,
    })

    for (const key of HARBOUR_IMPORT_NEVER_WRITE) {
      assert.equal(key in patch, false, `${key} must not be Harbour-patchable`)
      assert.equal(isHarbourPatchableShowKey(key), false)
    }
  })

  it('returns an empty patch when nothing Harbour-sourced is present', () => {
    assert.deepEqual(pickHarbourShowPatch({
      michael_notes: { from: 'Michael', to: '' },
    }), {})
    assert.deepEqual(pickHarbourShowPatch(undefined), {})
  })
})

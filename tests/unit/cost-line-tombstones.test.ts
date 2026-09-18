import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  FIELD_TOMBSTONE_SEED_KEY,
  filterEntriesAgainstTombstones,
  isTombstoned,
  mergeFactorRefreshEntries,
  removedSeedKeys,
  tombstonesForRemovedEntries,
} from '../../lib/cost-line-tombstones.ts'
import { generateEntries, generatedEntrySeedKey } from '../../lib/defaults/generate-entries.ts'
import { findMissingDefinedCostFields } from '../../lib/cost-fields.ts'

describe('hard-delete tombstones', () => {
  it('records removed seed keys and does not resurrect them on Factors merge', () => {
    const existing = [
      {
        id: 'keep',
        description: 'Lighting Equipment Hire',
        notes: '',
        amount: 330,
        gst_included: true,
        confirmed: false,
        seed_key: generatedEntrySeedKey('lighting_hire', 'Lighting Equipment Hire'),
      },
      {
        id: 'gone',
        description: 'Extra night',
        notes: '',
        amount: 1400,
        gst_included: true,
        confirmed: false,
        seed_key: 'accommodation:extra night',
      },
    ]
    const next = existing.filter(e => e.id !== 'gone')
    assert.deepEqual(removedSeedKeys('accommodation', existing, next), ['accommodation:extra night'])

    const tombs = tombstonesForRemovedEntries({
      runId: 'run-1',
      sheet: 'costings',
      showId: null,
      fieldKey: 'accommodation',
      existing,
      next,
    })
    assert.equal(tombs.some(t => t.seed_key === 'accommodation:extra night'), true)

    const generated = generateEntries('lighting_hire', 'estimated', null, [])
    const merged = mergeFactorRefreshEntries({
      fieldKey: 'lighting_hire',
      existing: next,
      generated,
      tombstones: [{ show_id: null, field_key: 'lighting_hire', seed_key: generated[0]!.seed_key! }],
      showId: null,
    })
    assert.equal(merged.some(e => e.seed_key === generated[0]?.seed_key), false)
  })

  it('keeps custom entries and skips field-level tombstones in findMissing', () => {
    const custom = {
      id: 'custom-1',
      description: 'User added night',
      notes: '',
      amount: 99,
      gst_included: true,
      confirmed: false,
    }
    const generated = [{
      id: 'gen-1',
      description: 'Lighting Equipment Hire',
      notes: '',
      amount: 330,
      gst_included: true,
      confirmed: false,
      seed_key: 'lighting_hire:lighting equipment hire',
    }]
    const merged = mergeFactorRefreshEntries({
      fieldKey: 'lighting_hire',
      existing: [custom],
      generated,
    })
    assert.equal(merged.some(e => e.description === 'User added night'), true)
    assert.equal(merged.some(e => e.seed_key === 'lighting_hire:lighting equipment hire'), true)

    const missing = findMissingDefinedCostFields(
      [],
      ['show-1'],
      { tombstones: [{ show_id: 'show-1', field_key: 'inside_fees', seed_key: FIELD_TOMBSTONE_SEED_KEY }] },
    )
    assert.equal(missing.some(m => m.fieldDef.key === 'inside_fees' && m.showId === 'show-1'), false)
    const rightsMissing = findMissingDefinedCostFields(
      [],
      ['show-1'],
      { tombstones: [{ show_id: 'show-1', field_key: 'music_rights', seed_key: FIELD_TOMBSTONE_SEED_KEY }] },
    )
    assert.equal(rightsMissing.some(m => m.fieldDef.key === 'music_rights' && m.showId === 'show-1'), false)
    assert.equal(isTombstoned(
      [{ show_id: 'show-1', field_key: 'inside_fees', seed_key: '*' }],
      { show_id: 'show-1', field_key: 'inside_fees', seed_key: 'booking_fee' },
    ), true)
    assert.deepEqual(
      filterEntriesAgainstTombstones(
        'inside_fees',
        'show-1',
        [{ ...custom, seed_key: 'booking_fee' }],
        [{ show_id: 'show-1', field_key: 'inside_fees', seed_key: 'booking_fee' }],
      ),
      [],
    )
  })
})

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { entriesSum } from '../../lib/cost-fields.ts'
import { mergeFactorRefreshEntries } from '../../lib/cost-line-tombstones.ts'
import { generateEntries } from '../../lib/defaults/generate-entries.ts'

const line = (id: string, description: string, amount: number, extra: Record<string, unknown> = {}) => ({
  id,
  description,
  notes: '',
  amount,
  gst_included: true,
  confirmed: false,
  paid: false,
  ...extra,
})

describe('Factors refresh matches existing lines instead of appending', () => {
  const shows = [
    { show_order: 1, venue_city: 'Ringwood', show_date: '2026-10-01' },
    { show_order: 2, venue_city: 'Warragul', show_date: '2026-10-02' },
  ]
  const factors = { food_basics_per_show: 350, lighting_hire_per_run: 330 }

  it('replaces a renamed food show line and keeps a manual line', () => {
    const generated = generateEntries('food_basics', 'estimated', null, shows, factors)
    const existing = [
      line('old', 'Traralgon — Show 2', 350, { notes: 'quoted locally' }),
      line('show1', 'Ringwood — Show 1', 350),
      line('manual', 'Green room fruit', 40, { notes: 'Entered by Gareth' }),
    ]
    const merged = mergeFactorRefreshEntries({
      fieldKey: 'food_basics',
      existing,
      generated,
    })
    assert.equal(merged.length, 3)
    assert.equal(merged.filter(e => /show 2/i.test(e.description)).length, 1)
    const show2 = merged.find(e => e.id === 'old')
    assert.equal(show2?.description, 'Warragul — Show 2')
    assert.equal(show2?.amount, 350)
    assert.equal(show2?.notes, 'quoted locally')
    assert.equal(show2?.seed_key, 'factor:food_basics:show:2')
    assert.equal(merged.some(e => e.description === 'Green room fruit' && e.amount === 40), true)
    assert.equal(entriesSum(merged), 740)

    const again = mergeFactorRefreshEntries({
      fieldKey: 'food_basics',
      existing: merged,
      generated: generateEntries('food_basics', 'estimated', null, shows, factors),
    })
    assert.equal(again.length, 3)
    assert.equal(entriesSum(again), 740)
  })

  it('replaces an older per-run lighting label instead of doubling it', () => {
    const generated = generateEntries('lighting_hire', 'estimated', null, [], factors)
    const existing = [
      line('legacy', 'Lighting equipment hire — full run', 330),
      line('extra', 'Followspot operator', 120),
    ]
    const once = mergeFactorRefreshEntries({
      fieldKey: 'lighting_hire',
      existing,
      generated,
    })
    assert.equal(once.length, 2)
    assert.equal(once.filter(e => /lighting/i.test(e.description)).length, 1)
    assert.equal(once.find(e => e.id === 'legacy')?.description, 'Lighting Equipment Hire')
    assert.equal(once.find(e => e.id === 'legacy')?.amount, 330)
    assert.equal(once.find(e => e.id === 'legacy')?.seed_key, 'factor:lighting_hire:per_run')
    assert.equal(entriesSum(once), 450)

    const bothLabels = mergeFactorRefreshEntries({
      fieldKey: 'lighting_hire',
      existing: [
        line('legacy', 'Lighting equipment hire — full run', 330),
        line('new', 'Lighting Equipment Hire', 330, { seed_key: 'factor:lighting_hire:per_run' }),
      ],
      generated,
    })
    assert.equal(bothLabels.length, 1)
    assert.equal(entriesSum(bothLabels), 330)

    const twice = mergeFactorRefreshEntries({
      fieldKey: 'lighting_hire',
      existing: once,
      generated: generateEntries('lighting_hire', 'estimated', null, [], factors),
    })
    assert.equal(twice.length, 2)
    assert.equal(entriesSum(twice), 450)
  })

  it('does not overwrite a paid factor line or add a second one', () => {
    const generated = generateEntries('lighting_hire', 'estimated', null, [], { lighting_hire_per_run: 400 })
    const merged = mergeFactorRefreshEntries({
      fieldKey: 'lighting_hire',
      existing: [line('paid-line', 'Lighting equipment hire — full run', 330, {
        paid: true,
        paid_at: '2026-09-01T00:00:00.000Z',
      })],
      generated,
    })
    assert.equal(merged.length, 1)
    assert.equal(merged[0]?.amount, 330)
    assert.equal(merged[0]?.paid, true)
  })

  it('does not resurrect a tombstoned older lighting label', () => {
    const generated = generateEntries('lighting_hire', 'estimated', null, [], factors)
    const merged = mergeFactorRefreshEntries({
      fieldKey: 'lighting_hire',
      existing: [],
      generated,
      tombstones: [{
        show_id: null,
        field_key: 'lighting_hire',
        seed_key: 'lighting_hire:lighting equipment hire — full run',
      }],
    })
    assert.equal(merged.length, 0)
  })
})

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { chooseRunLevelKeeper, planRunLevelDedupe } from '../../lib/cost-field-dedupe.ts'
import { isUniqueViolation } from '../../lib/cost-field-insert.ts'

describe('run-level cost field dedupe keeper', () => {
  it('keeps non-zero money over an older $0 copy and does not merge them', () => {
    const zero = {
      id: 'aaa',
      run_id: 'run',
      field_key: 'backline_hire',
      created_at: '2026-09-04T00:00:00.000Z',
      updated_by: 'user',
      value: 0,
      entries: [{ amount: 0 }],
    }
    const money = {
      id: 'bbb',
      run_id: 'run',
      field_key: 'backline_hire',
      created_at: '2026-09-14T00:00:00.000Z',
      updated_by: null,
      value: 3800,
      entries: [{ amount: 3800 }],
    }
    const chosen = chooseRunLevelKeeper([zero, money])
    assert.equal(chosen.keep.id, 'bbb')
    assert.deepEqual(chosen.drop.map(row => row.id), ['aaa'])
    assert.equal(chosen.keep.value, 3800)
  })

  it('keeps line items, then a human edit, else the oldest', () => {
    const empty = {
      id: '1',
      run_id: 'run',
      field_key: 'brad_driver_fee',
      created_at: '2026-09-01T00:00:00.000Z',
      updated_by: null,
      value: 0,
      entries: [],
    }
    const lines = {
      id: '2',
      run_id: 'run',
      field_key: 'brad_driver_fee',
      created_at: '2026-09-02T00:00:00.000Z',
      updated_by: null,
      value: 0,
      entries: [{ amount: 0, description: 'Brad' }],
    }
    assert.equal(chooseRunLevelKeeper([empty, lines]).keep.id, '2')

    const edited = { ...empty, id: '3', updated_by: 'person', created_at: '2026-09-03T00:00:00.000Z' }
    const bare = { ...empty, id: '4', created_at: '2026-09-01T00:00:00.000Z' }
    assert.equal(chooseRunLevelKeeper([bare, edited]).keep.id, '3')

    const older = { ...empty, id: 'a', created_at: '2026-09-01T00:00:00.000Z' }
    const newer = { ...empty, id: 'b', created_at: '2026-09-05T00:00:00.000Z' }
    assert.equal(chooseRunLevelKeeper([newer, older]).keep.id, 'a')
  })

  it('plans one drop per duplicate pair and ignores unique rows', () => {
    const plans = planRunLevelDedupe([
      { id: '1', run_id: 'r1', field_key: 'flights', created_at: '2026-09-01T00:00:00.000Z', value: 0, entries: [] },
      { id: '2', run_id: 'r1', field_key: 'flights', created_at: '2026-09-02T00:00:00.000Z', value: 0, entries: [] },
      { id: '3', run_id: 'r1', field_key: 'food_basics', created_at: '2026-09-01T00:00:00.000Z', value: 700, entries: [] },
    ])
    assert.equal(plans.length, 1)
    assert.equal(plans[0]?.field_key, 'flights')
    assert.equal(plans[0]?.keep.id, '1')
    assert.equal(plans[0]?.drop.length, 1)
  })
})

describe('cost field unique violation', () => {
  it('recognises postgres 23505 and the duplicate-key message', () => {
    assert.equal(isUniqueViolation({ code: '23505', message: 'duplicate key value' }), true)
    assert.equal(isUniqueViolation({ message: 'duplicate key value violates unique constraint "cost_fields_run_id_show_id_field_key_key"' }), true)
    assert.equal(isUniqueViolation({ code: '23502', message: 'null value' }), false)
    assert.equal(isUniqueViolation(null), false)
  })
})

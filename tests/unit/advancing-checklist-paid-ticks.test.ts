import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  ADVANCING_CHECKLIST_TAB_LABEL,
  ADVANCING_WRITES_BACK_TO_COSTING,
} from '../../lib/run-advancing.ts'
import {
  AUTO_TICKED_FROM_PAID_HINT,
  checklistItemKeyForPaidCostField,
  costFieldIsEffectivelyPaid,
  costFieldKeyForChecklistItem,
  costFieldWriteSourceForChecklist,
  decidePaidChecklistTicks,
  decidePaidChecklistTicksForField,
  PAID_COST_FIELD_TO_CHECKLIST_ITEM,
  paidFieldKeysFromCostFields,
} from '../../lib/advancing-checklist-paid-ticks.ts'
import { DEFINED_RUN_COST_FIELDS } from '../../lib/cost-fields.ts'

function item(id: string, item_key: string, status: string) {
  return { id, item_key, status }
}

function paidEntry(id = 'e1') {
  return { id, description: 'Line', notes: '', amount: 10, gst_included: true, confirmed: true, paid: true }
}

function unpaidEntry(id = 'e1') {
  return { id, description: 'Line', notes: '', amount: 10, gst_included: true, confirmed: true, paid: false }
}

describe('Advancing Checklist PAID→auto-tick mapping', () => {
  it('maps flights / hotels / cars / backline to known checklist keys', () => {
    assert.equal(PAID_COST_FIELD_TO_CHECKLIST_ITEM.flights, 'flights_complete')
    assert.equal(PAID_COST_FIELD_TO_CHECKLIST_ITEM.accommodation, 'hotel_confirmed')
    assert.equal(PAID_COST_FIELD_TO_CHECKLIST_ITEM.ground_transport, 'car_hire_van')
    assert.equal(PAID_COST_FIELD_TO_CHECKLIST_ITEM.backline_hire, 'backline_hire_ordered')
    assert.equal(checklistItemKeyForPaidCostField('flights'), 'flights_complete')
    assert.equal(checklistItemKeyForPaidCostField('accommodation'), 'hotel_confirmed')
    assert.equal(checklistItemKeyForPaidCostField('ground_transport'), 'car_hire_van')
    assert.equal(checklistItemKeyForPaidCostField('backline_hire'), 'backline_hire_ordered')
    assert.equal(costFieldKeyForChecklistItem('car_hire_van'), 'ground_transport')
  })

  it('uses ground_transport for cars — no car_hire field_key in DEFINED_RUN_COST_FIELDS', () => {
    const keys = DEFINED_RUN_COST_FIELDS.map(f => f.key)
    assert.ok(keys.includes('ground_transport'))
    assert.equal(keys.includes('car_hire'), false)
    assert.equal(checklistItemKeyForPaidCostField('car_hire'), null)
    assert.equal(
      DEFINED_RUN_COST_FIELDS.find(f => f.key === 'ground_transport')?.label,
      'Ground Transport',
    )
  })

  it('leaves unknown cost lines manual', () => {
    assert.equal(checklistItemKeyForPaidCostField('fb_ads'), null)
    assert.equal(checklistItemKeyForPaidCostField('venue_hire'), null)
    assert.equal(checklistItemKeyForPaidCostField('per_diems'), null)
    const { tickIds, decisions } = decidePaidChecklistTicks({
      source: 'advancing',
      paidFieldKeys: ['fb_ads', 'mystery_line'],
      items: [item('1', 'flights_complete', 'pending')],
    })
    assert.deepEqual(tickIds, [])
    assert.equal(decisions[0]?.reason, 'unmapped')
  })

  it('detects PAID via existing all-entries roll-up (not cost_fields.state)', () => {
    assert.equal(costFieldIsEffectivelyPaid({
      field_key: 'flights',
      entries: [paidEntry()],
    }), true)
    assert.equal(costFieldIsEffectivelyPaid({
      field_key: 'flights',
      entries: [paidEntry('a'), unpaidEntry('b')],
    }), false)
    assert.equal(costFieldIsEffectivelyPaid({
      field_key: 'flights',
      entries: [],
    }), false)
    assert.equal(costFieldIsEffectivelyPaid({
      field_key: 'flights',
      entries: [unpaidEntry()],
    }), false)
    assert.deepEqual(
      paidFieldKeysFromCostFields([
        { field_key: 'flights', entries: [paidEntry()] },
        { field_key: 'accommodation', entries: [unpaidEntry()] },
      ]),
      ['flights'],
    )
  })
})

describe('Advancing Checklist PAID→tick rules', () => {
  const checklist = [
    item('f1', 'flights_complete', 'pending'),
    item('h1', 'hotel_confirmed', 'pending'),
    item('c1', 'car_hire_van', 'pending'),
    item('b1', 'backline_hire_ordered', 'pending'),
    item('x1', 'promo_plan_started', 'pending'),
  ]

  it('ticks pending mapped items when the Advancing field is PAID', () => {
    const flights = decidePaidChecklistTicksForField({
      source: 'advancing',
      fieldKey: 'flights',
      fieldIsPaid: true,
      items: checklist,
    })
    assert.deepEqual(flights.tickIds, ['f1'])
    assert.equal(flights.decisions.find(d => d.id === 'f1')?.reason, 'paid_pending')

    const hotels = decidePaidChecklistTicksForField({
      source: 'advancing',
      fieldKey: 'accommodation',
      fieldIsPaid: true,
      items: checklist,
    })
    assert.deepEqual(hotels.tickIds, ['h1'])

    const cars = decidePaidChecklistTicksForField({
      source: 'advancing',
      fieldKey: 'ground_transport',
      fieldIsPaid: true,
      items: checklist,
    })
    assert.deepEqual(cars.tickIds, ['c1'])

    const backline = decidePaidChecklistTicksForField({
      source: 'advancing',
      fieldKey: 'backline_hire',
      fieldIsPaid: true,
      items: checklist,
    })
    assert.deepEqual(backline.tickIds, ['b1'])
  })

  it('does not un-tick and does not overwrite n_a or already-done', () => {
    const items = [
      item('f1', 'flights_complete', 'done'),
      item('h1', 'hotel_confirmed', 'n_a'),
      item('c1', 'car_hire_van', 'pending'),
    ]
    const paid = decidePaidChecklistTicks({
      source: 'advancing',
      paidFieldKeys: ['flights', 'accommodation', 'ground_transport'],
      items,
    })
    assert.deepEqual(paid.tickIds, ['c1'])
    assert.equal(paid.decisions.find(d => d.id === 'f1')?.reason, 'already_done')
    assert.equal(paid.decisions.find(d => d.id === 'h1')?.reason, 'n_a')

    const unpaid = decidePaidChecklistTicksForField({
      source: 'advancing',
      fieldKey: 'flights',
      fieldIsPaid: false,
      items: [item('f1', 'flights_complete', 'done')],
    })
    assert.deepEqual(unpaid.tickIds, [])
    assert.equal(unpaid.decisions[0]?.reason, 'not_paid')
    assert.equal(unpaid.decisions[0]?.action, 'skip')
  })

  it('Costing sheet must NOT auto-tick even when the line is PAID', () => {
    assert.equal(costFieldWriteSourceForChecklist('cost_fields'), 'costing')
    assert.equal(costFieldWriteSourceForChecklist('advancing_cost_fields'), 'advancing')
    const result = decidePaidChecklistTicksForField({
      source: 'costing',
      fieldKey: 'flights',
      fieldIsPaid: true,
      items: checklist,
    })
    assert.deepEqual(result.tickIds, [])
    assert.ok(result.decisions.every(d => d.reason === 'costing_sheet'))
  })

  it('ticks every pending show-scope backline row for a PAID run-level backline_hire', () => {
    const result = decidePaidChecklistTicks({
      source: 'advancing',
      paidFieldKeys: ['backline_hire'],
      items: [
        item('s1', 'backline_hire_ordered', 'pending'),
        item('s2', 'backline_hire_ordered', 'pending'),
        item('s3', 'backline_hire_ordered', 'n_a'),
        item('s4', 'backline_hire_ordered', 'done'),
      ],
    })
    assert.deepEqual(result.tickIds, ['s1', 's2'])
  })

  it('never writes Advancing ticks back into Costing and keeps the checklist tab name', () => {
    assert.equal(ADVANCING_WRITES_BACK_TO_COSTING, false)
    assert.equal(ADVANCING_CHECKLIST_TAB_LABEL, 'Advancing Checklist')
    assert.equal(AUTO_TICKED_FROM_PAID_HINT, 'Auto-ticked from PAID on Run Advancing')
  })
})

import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  FIGURE_ACCURACY_NOT_ENOUGH,
  bandLineReadyForDistribute,
  collectRunCostingBandLines,
  evaluateDistributeGate,
  figureAccuracyAloneIsNotEnough,
  distributeGateFromSources,
} from '../../lib/settlements-distribute-gate.ts'
import type { CostingSnapshotField } from '../../lib/settlements.ts'
import type { CostEntry } from '../../lib/cost-fields.ts'

function entry(partial: Partial<CostEntry> & Pick<CostEntry, 'id'>): CostEntry {
  return {
    description: partial.description ?? partial.id,
    notes: '',
    amount: partial.amount ?? 100,
    gst_included: true,
    confirmed: partial.confirmed ?? false,
    paid: partial.paid ?? false,
    paid_at: partial.paid_at ?? null,
  }
}

function field(partial: Partial<CostingSnapshotField> & Pick<CostingSnapshotField, 'field_key' | 'label'>): CostingSnapshotField {
  return {
    id: partial.id ?? partial.field_key,
    run_id: 'run-1',
    show_id: partial.show_id ?? null,
    category: partial.category ?? 'Travel & Accommodation',
    field_key: partial.field_key,
    label: partial.label,
    value: partial.value ?? 100,
    state: partial.state ?? 'guess',
    source: partial.source ?? 'Advancing',
    entries: partial.entries ?? [],
    line_items: partial.line_items ?? [],
  }
}

test('figure-accuracy known alone is never enough for distribute', () => {
  assert.equal(figureAccuracyAloneIsNotEnough({
    figureAccuracyKnown: true,
    confirmTick: false,
    sectionConfirmed: false,
    paid: false,
    waived: false,
  }), true)
  assert.equal(bandLineReadyForDistribute({
    id: 'x',
    label: 'Flights',
    source: 'run_costing',
    confirmTick: false,
    sectionConfirmed: false,
    paid: false,
    waived: false,
    figureAccuracyKnown: true,
  }), false)
  assert.match(FIGURE_ACCURACY_NOT_ENOUGH, /not a confirm-tick/)
})

test('distribute gate blocked when state is known but ticks are missing', () => {
  const fields = [
    field({
      field_key: 'flights',
      label: 'Flights',
      state: 'known',
      entries: [entry({ id: 'f1', description: 'SYD-MEL', confirmed: false, paid: false })],
    }),
  ]
  const gate = distributeGateFromSources({ fields, wave1BandCosts: [] })
  assert.equal(gate.ready, false)
  assert.ok(gate.blockers.some(b => b.reason === FIGURE_ACCURACY_NOT_ENOUGH))
})

test('distribute gate unblocked when every payable line is confirm-ticked', () => {
  const fields = [
    field({
      field_key: 'flights',
      label: 'Flights',
      state: 'guess',
      entries: [entry({ id: 'f1', confirmed: true, paid: false })],
    }),
    field({
      field_key: 'accommodation',
      label: 'Accommodation',
      state: 'estimated',
      entries: [entry({ id: 'a1', confirmed: true, paid: false })],
    }),
  ]
  const gate = distributeGateFromSources({ fields, wave1BandCosts: [] })
  assert.equal(gate.ready, true)
  assert.match(gate.summary, /operator-confirmed or PAID/)
})

test('distribute gate unblocked when section is all-PAID (no ticks required)', () => {
  const fields = [
    field({
      field_key: 'flights',
      label: 'Flights',
      state: 'guess',
      entries: [entry({ id: 'f1', confirmed: false, paid: true })],
    }),
  ]
  const gate = distributeGateFromSources({ fields, wave1BandCosts: [] })
  assert.equal(gate.ready, true)
})

test('section Confirmed (all confirm-ticks) unblocks even if state is not known', () => {
  const fields = [
    field({
      field_key: 'flights',
      label: 'Flights',
      state: 'estimated',
      entries: [
        entry({ id: 'f1', confirmed: true, paid: false }),
        entry({ id: 'f2', confirmed: true, paid: false }),
      ],
    }),
  ]
  const collected = collectRunCostingBandLines(fields)
  assert.ok(collected.every(l => l.sectionConfirmed))
  assert.equal(evaluateDistributeGate(collected).ready, true)
})

test('Wave 1 surprise band cost still open blocks; PAID or waived unblocks', () => {
  const fields = [
    field({
      field_key: 'flights',
      label: 'Flights',
      entries: [entry({ id: 'f1', confirmed: true })],
    }),
  ]
  const blocked = distributeGateFromSources({
    fields,
    wave1BandCosts: [{ id: 'uber', description: 'Uber', paid: false, waived: false }],
  })
  assert.equal(blocked.ready, false)

  const paid = distributeGateFromSources({
    fields,
    wave1BandCosts: [{ id: 'uber', description: 'Uber', paid: true, waived: false }],
  })
  assert.equal(paid.ready, true)

  const waived = distributeGateFromSources({
    fields,
    wave1BandCosts: [{ id: 'uber', description: 'Uber', paid: false, waived: true }],
  })
  assert.equal(waived.ready, true)
})

test('empty band-cost set is vacuously ready; auto-calc social ads are skipped', () => {
  const empty = evaluateDistributeGate([])
  assert.equal(empty.ready, true)
  const onlyAuto = distributeGateFromSources({
    fields: [field({
      field_key: 'social_ads_var',
      label: 'Social Media Marketing Co. — $1/ticket',
      state: 'auto_calc',
      entries: [],
    })],
    wave1BandCosts: [],
  })
  assert.equal(onlyAuto.ready, true)
})

test('sheet Col3 PAID covers the matching Run Costing field', () => {
  const fields = [
    field({
      field_key: 'accommodation',
      label: 'Accommodation',
      state: 'known',
      entries: [entry({ id: 'a1', confirmed: false, paid: false })],
    }),
  ]
  const blocked = distributeGateFromSources({ fields, wave1BandCosts: [] })
  assert.equal(blocked.ready, false)
  const unblocked = distributeGateFromSources({
    fields,
    wave1BandCosts: [],
    sheetBandActuals: [{ id: 's1', line_key: 'run:accommodation', paid: true }],
  })
  assert.equal(unblocked.ready, true)
})

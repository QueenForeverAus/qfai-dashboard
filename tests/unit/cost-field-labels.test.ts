import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  DEFINED_RUN_COST_FIELDS,
  DEFINED_SHOW_COST_FIELDS,
  LIGHTING_HIRE_LINE_LABEL,
  PRODUCTION_BOUGHT_IN_LABEL,
  VENUE_PRODUCTION_AV_LABEL,
  buildCreateCostFieldBody,
  defaultCostEntryDescription,
  definedCostField,
  displayCostFieldLabel,
} from '../../lib/cost-fields.ts'
import { LIGHTING_HIRE_PER_RUN } from '../../lib/defaults/run-defaults.ts'

test('venue Production/AV display label is Venue Production/AV; field_key stays production_costs', () => {
  const def = definedCostField('production_costs')
  assert.equal(def?.key, 'production_costs')
  assert.equal(def?.category, 'Venue Costs')
  assert.equal(def?.label, VENUE_PRODUCTION_AV_LABEL)
  assert.equal(def?.label, 'Venue Production/AV')
  assert.equal(
    DEFINED_SHOW_COST_FIELDS.find(f => f.key === 'production_costs')?.label,
    'Venue Production/AV',
  )
  assert.equal(displayCostFieldLabel('production_costs'), 'Venue Production/AV')
  assert.equal(
    displayCostFieldLabel('production_costs', 'Production / AV'),
    'Venue Production/AV',
    'defined label wins over stored legacy copy',
  )
})

test('run lighting_hire parent is Production Bought In; $330 child stays Lighting Equipment Hire', () => {
  const def = definedCostField('lighting_hire')
  assert.equal(def?.key, 'lighting_hire')
  assert.equal(def?.category, 'Production')
  assert.equal(def?.label, PRODUCTION_BOUGHT_IN_LABEL)
  assert.equal(def?.label, 'Production Bought In')
  assert.equal(
    DEFINED_RUN_COST_FIELDS.find(f => f.key === 'lighting_hire')?.label,
    'Production Bought In',
  )
  assert.equal(displayCostFieldLabel('lighting_hire'), 'Production Bought In')
  assert.equal(
    displayCostFieldLabel('lighting_hire', 'Lighting Equipment Hire'),
    'Production Bought In',
  )
  assert.equal(LIGHTING_HIRE_LINE_LABEL, 'Lighting Equipment Hire')
  assert.equal(LIGHTING_HIRE_PER_RUN, 330)
  assert.equal(defaultCostEntryDescription('lighting_hire', 'Production Bought In'), LIGHTING_HIRE_LINE_LABEL)
  assert.equal(defaultCostEntryDescription('venue_hire', 'Venue Hire'), 'Venue Hire')
})

test('displayCostFieldLabel falls back for unknown keys', () => {
  assert.equal(displayCostFieldLabel('custom_foo', 'Custom line'), 'Custom line')
  assert.equal(displayCostFieldLabel('custom_foo'), 'custom foo')
})

test('buildCreateCostFieldBody uses new parent labels and lighting child name', () => {
  const venue = buildCreateCostFieldBody('run-1', {
    fieldDef: definedCostField('production_costs')!,
    showId: 'show-1',
  })
  assert.equal(venue.field_key, 'production_costs')
  assert.equal(venue.label, VENUE_PRODUCTION_AV_LABEL)
  const venueEntries = venue.entries as Array<{ description: string }>
  assert.equal(venueEntries[0]?.description, VENUE_PRODUCTION_AV_LABEL)

  const boughtIn = buildCreateCostFieldBody('run-1', {
    fieldDef: definedCostField('lighting_hire')!,
    showId: null,
  })
  assert.equal(boughtIn.field_key, 'lighting_hire')
  assert.equal(boughtIn.label, PRODUCTION_BOUGHT_IN_LABEL)
  const child = boughtIn.entries as Array<{ description: string }>
  assert.equal(child[0]?.description, LIGHTING_HIRE_LINE_LABEL)
})

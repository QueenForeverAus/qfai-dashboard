import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  classifyRunRegion,
  classifyShowRegion,
  explainRunRegion,
} from '../../lib/region-classify.ts'

describe('Wave B Group Type classifier defaults', () => {
  it('defaults Tamworth / Port Mac / Darwin to G3', () => {
    assert.equal(classifyShowRegion({ state_territory: 'NSW', venue_city: 'Tamworth' }), 'group3')
    assert.equal(classifyShowRegion({ state_territory: 'NSW', venue_city: 'Port Macquarie' }), 'group3')
    assert.equal(classifyShowRegion({ state_territory: 'NSW', venue_city: 'Port Mac' }), 'group3')
    assert.equal(classifyShowRegion({ state_territory: 'NT', venue_city: 'Darwin' }), 'group3')
    assert.equal(classifyShowRegion({ state_territory: 'NT', venue_city: 'Alice Springs' }), 'group3')
    assert.equal(classifyShowRegion({ state_territory: 'WA', venue_city: 'Broome' }), 'group3')
    assert.equal(classifyRunRegion([
      { state_territory: 'NSW', venue_city: 'Tamworth' },
    ]), 'group3')
  })

  it('defaults overseas / NZ / Asia to G4', () => {
    assert.equal(classifyShowRegion({ venue_city: 'Auckland', country: 'NZ' }), 'group4')
    assert.equal(classifyShowRegion({ state_territory: 'NZ', venue_city: 'Wellington' }), 'group4')
    assert.equal(classifyShowRegion({ venue_city: 'Singapore', country: 'SG' }), 'group4')
    assert.equal(classifyShowRegion({ venue_city: 'Bali', country: 'ID' }), 'group4')
    assert.equal(classifyRunRegion([
      { state_territory: 'VIC', venue_city: 'Geelong' },
      { venue_city: 'Auckland', country: 'NZ' },
    ]), 'group4')
    assert.match(explainRunRegion([{ venue_city: 'Auckland', country: 'NZ' }]).reason, /G4/)
  })

  it('keeps metro AU G1/G2 and does not treat Hamilton VIC as overseas', () => {
    assert.equal(classifyShowRegion({ state_territory: 'VIC', venue_city: 'Geelong' }), 'group1')
    assert.equal(classifyShowRegion({ state_territory: 'NSW', venue_city: 'Sydney' }), 'group2')
    assert.equal(classifyShowRegion({ state_territory: 'VIC', venue_city: 'Hamilton' }), 'group1')
    assert.equal(classifyShowRegion({ state_territory: 'WA', venue_city: 'Perth' }), 'group3')
  })
})

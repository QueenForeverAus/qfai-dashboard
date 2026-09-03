/**
 * Matrix checks for region classifier (costings canon 2026-09-03).
 * Run: npx tsx scripts/assert-region-classify.ts
 */
import {
  classifyRunRegion,
  classifyShowRegion,
  explainRunRegion,
  SOUTHERN_NSW_G1_CITIES,
} from '../lib/region-classify'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`)
  console.log(`OK  ${msg}`)
}

// Per-show
assert(classifyShowRegion({ state_territory: 'VIC', venue_city: 'Ararat' }) === 'group1', 'VIC → G1')
assert(classifyShowRegion({ state_territory: 'NSW', venue_city: 'Albury' }) === 'group1', 'Albury NSW → G1')
assert(classifyShowRegion({ state_territory: 'NSW', venue_city: 'Springwood' }) === 'group2', 'Springwood → G2')
assert(classifyShowRegion({ state_territory: 'NSW', venue_city: 'Sydney' }) === 'group2', 'Sydney → G2')
assert(classifyShowRegion({ state_territory: 'TAS', venue_city: 'Hobart' }) === 'group2', 'Hobart → G2')
assert(classifyShowRegion({ state_territory: 'WA', venue_city: 'Perth' }) === 'group3', 'Perth → G3')
assert(classifyShowRegion({ state_territory: 'QLD', venue_city: 'Brisbane' }) === 'group3', 'QLD → G3')
assert(classifyShowRegion({ state_territory: 'Victoria', venue_city: 'Geelong' }) === 'group1', 'full name Victoria → G1')
assert(classifyShowRegion({ venue_city: 'Auckland', country: 'NZ' }) === 'group3', 'Auckland NZ → G3')
assert(classifyShowRegion({ state_territory: 'VIC', venue_city: 'Hamilton' }) === 'group1', 'Hamilton VIC not NZ → G1')
assert(SOUTHERN_NSW_G1_CITIES.includes('Albury'), 'SOUTHERN_NSW_G1_CITIES exports Albury')

// Known runs
const matrix: { code: string; shows: { state_territory: string; venue_city: string }[]; expect: string }[] = [
  { code: 'R03', shows: [{ state_territory: 'NSW', venue_city: 'Springwood' }, { state_territory: 'NSW', venue_city: 'Thirroul' }], expect: 'group2' },
  { code: 'R04', shows: [{ state_territory: 'NSW', venue_city: 'Penrith' }, { state_territory: 'NSW', venue_city: 'Bathurst' }], expect: 'group2' },
  { code: 'R13', shows: [{ state_territory: 'TAS', venue_city: 'Hobart' }, { state_territory: 'TAS', venue_city: 'Launceston' }], expect: 'group2' },
  { code: 'R05', shows: [{ state_territory: 'WA', venue_city: 'Bunbury' }, { state_territory: 'WA', venue_city: 'Mandurah' }, { state_territory: 'WA', venue_city: 'Perth' }], expect: 'group3' },
  { code: 'R06', shows: [{ state_territory: 'VIC', venue_city: 'Ararat' }], expect: 'group1' },
  { code: 'R08', shows: [{ state_territory: 'NSW', venue_city: 'Albury' }], expect: 'group1' },
  { code: 'R14', shows: [{ state_territory: 'VIC', venue_city: 'Hamilton' }, { state_territory: 'VIC', venue_city: 'Geelong' }], expect: 'group1' },
  { code: 'R01', shows: [{ state_territory: 'NSW', venue_city: 'Broken Hill' }, { state_territory: 'SA', venue_city: 'Renmark' }, { state_territory: 'SA', venue_city: 'Adelaide' }], expect: 'group2' },
  { code: 'R09', shows: [{ state_territory: 'NSW', venue_city: 'Sydney' }], expect: 'group2' },
]

for (const row of matrix) {
  const got = classifyRunRegion(row.shows)
  assert(got === row.expect, `${row.code} → ${row.expect} (got ${got})`)
  const { reason } = explainRunRegion(row.shows)
  console.log(`     reason: ${reason}`)
}

assert(classifyRunRegion([]) === 'group2', 'empty → G2')
assert(explainRunRegion([]).reason === 'no shows yet', 'empty reason')

console.log('\nAll region-classify asserts passed.')

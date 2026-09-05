/**
 * Matrix checks for venue cost classifier (venue_marketing / production / staff).
 * Run: npx tsx scripts/assert-venue-cost-classify.ts
 */
import {
  classifyVenueCostCue,
  classifyVenueLine,
  classifyLineItem,
  planVenueStaffReclass,
} from '../lib/venue-cost-classify'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`)
  console.log(`OK  ${msg}`)
}

const matrix: { text: string; expect: ReturnType<typeof classifyVenueCostCue> }[] = [
  { text: 'Production Package', expect: 'production_costs' },
  { text: 'Marketing Levy', expect: 'venue_marketing' },
  { text: 'Usher', expect: 'venue_staff' },
  { text: 'zzz-no-such-cost-cue-xyz', expect: 'unknown' },
  { text: 'Mandatory Marketing Levy (flat)', expect: 'venue_marketing' },
  { text: 'EDM / Marketing', expect: 'venue_marketing' },
  { text: 'Solo EDM', expect: 'venue_marketing' },
  { text: 'Foyer Poster', expect: 'venue_marketing' },
  { text: 'Venue Marketing', expect: 'venue_marketing' },
  { text: 'Event Marketing + Selling Staff', expect: 'venue_marketing' },
  { text: 'Small Equipment (mics, smoke, projector, flat)', expect: 'production_costs' },
  { text: 'AV Package', expect: 'production_costs' },
  { text: 'Vision Package', expect: 'production_costs' },
  { text: 'Basic Tech Package (flat)', expect: 'production_costs' },
  { text: 'Big Band Tech Package', expect: 'production_costs' },
  { text: 'Package C (AV production)', expect: 'production_costs' },
  { text: 'House PA Removal', expect: 'production_costs' },
  { text: 'Projector Hire', expect: 'production_costs' },
  { text: 'Radio Mic', expect: 'production_costs' },
  { text: 'FOH Staff / Ushers', expect: 'venue_staff' },
  { text: 'Security Supervisor', expect: 'venue_staff' },
  { text: 'Fire Warden', expect: 'venue_staff' },
  { text: 'Stage Door', expect: 'venue_staff' },
  { text: 'Event Duty Manager', expect: 'venue_staff' },
  { text: 'Lighting Tech', expect: 'venue_staff' },
  { text: 'Audio Technicians × 2', expect: 'venue_staff' },
  { text: 'Catering / Beverages', expect: 'venue_staff' },
  { text: 'Backstage Rider (flat)', expect: 'venue_staff' },
]

for (const row of matrix) {
  const got = classifyVenueCostCue(row.text)
  assert(got === row.expect, `"${row.text}" → ${row.expect} (got ${got})`)
}

assert(
  classifyVenueLine('Marketing / Signage (flat)', 'lightbox + outdoor + custom posters') === 'venue_marketing',
  'classifyVenueLine signage + posters → venue_marketing',
)

assert(
  classifyLineItem({
    role: 'Production Package (flat)',
    rate: 715,
    hours: 1,
    headcount: 1,
    source: 'Historical 2024 remittance — flat fee',
  }) === 'production_costs',
  'classifyLineItem Production Package → production_costs',
)

const plan = planVenueStaffReclass({
  id: 'staff-1',
  run_id: 'run-1',
  show_id: 'show-1',
  category: 'Venue Costs',
  field_key: 'venue_staff',
  label: 'Venue Staff / On-costs',
  value: 1515,
  state: 'guess',
  source: null,
  line_items: [
    { role: 'Production Package (flat)', rate: 715, hours: 1, headcount: 1 },
    { role: 'Ushers', rate: 400, hours: 1, headcount: 1 },
    { role: 'Marketing Levy (flat)', rate: 300, hours: 1, headcount: 1 },
    { role: 'Obscure Widget Charge', rate: 100, hours: 1, headcount: 1 },
  ],
  entries: [
    { id: 'e1', description: 'Venue Staff / On-costs', notes: '', amount: 1515, gst_included: true, confirmed: false },
  ],
})

assert(plan.moves.length === 2, `plan moves 2 misfiles (got ${plan.moves.length})`)
assert(
  plan.remainingLineItems.length === 2 &&
    plan.remainingLineItems.some(i => i.role === 'Ushers') &&
    plan.remainingLineItems.some(i => i.role === 'Obscure Widget Charge'),
  'reclass strips moved roles from line_items; usher + unknown remain',
)
assert(
  !plan.remainingLineItems.some(i => /production package/i.test(i.role)),
  'Production Package removed from venue_staff.line_items',
)
assert(
  plan.destAdds.production_costs.some(e => /production package/i.test(e.description) && e.amount === 715),
  'Production Package moved to production_costs entries',
)
assert(
  plan.destAdds.venue_marketing.some(e => /marketing levy/i.test(e.description) && e.amount === 300),
  'Marketing Levy moved to venue_marketing entries',
)
assert(plan.flags.length >= 1, 'unknown Obscure Widget Charge flagged, not silent-moved')
assert(plan.venueStaffValue === 500, `remaining line_items value 500 (got ${plan.venueStaffValue})`)
assert(/Reclass/.test(plan.auditNote), 'audit note describes reclass')

console.log('\nAll venue-cost-classify asserts passed.')

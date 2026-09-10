import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isBookedBookingStatus } from '../../lib/booked-cost-freeze.ts'
import { isSettlementsDemoRun, SOCIAL_ADS_PER_TICKET } from '../../lib/settlements-sheet.ts'
import { isSettlementsListCompletedRun } from '../../lib/settlements-list.ts'
import { isAdvancingShowsListRun } from '../../lib/tour-desk-nav.ts'
import {
  PROD_SUPABASE_PROJECT_REF,
  SAMPLE_RUN_BOOKING_STATUS,
  SAMPLE_SOCIAL_ADS_LABEL,
  SETTLEMENTS_SAMPLE_CODES,
  SETTLEMENTS_SAMPLE_CONFIRM,
  SETTLEMENTS_SAMPLE_FIXTURES,
  SETTLEMENTS_SEED_PROTECTED_CODES,
  isProtectedSettlementsSeedCode,
  isSettlementsSampleCode,
  isSettlementsSeedTargetAllowed,
  sampleAdvancingMixCounts,
  sampleFixtureInventory,
  sampleRunBookingStatus,
} from '../../lib/settlements-sample-fixtures.ts'
import {
  PRODUCTION_BOUGHT_IN_LABEL,
  VENUE_PRODUCTION_AV_LABEL,
  LIGHTING_HIRE_LINE_LABEL,
} from '../../lib/cost-fields.ts'
import {
  buildSampleCostFieldEntries,
  sampleCostFieldState,
} from '../../lib/settlements-sample-seed.ts'

test('eight SAMPLE fixtures cover accuracy + lifecycle mixes without real QF venues', () => {
  assert.deepEqual([...SETTLEMENTS_SAMPLE_CODES], SETTLEMENTS_SAMPLE_FIXTURES.map(f => f.code))
  assert.equal(SETTLEMENTS_SAMPLE_FIXTURES.length, 8)
  assert.equal(SETTLEMENTS_SAMPLE_CONFIRM, 'SAMPLE_ONLY')

  const byAccuracy = Object.fromEntries(['accurate', 'a_little_out', 'completely_wrong'].map(k => [k, 0])) as Record<string, number>
  const byLife = Object.fromEntries(['not_settled', 'settled', 'settled_remitted'].map(k => [k, 0])) as Record<string, number>
  const realVenueHints = /geelong|goulburn|broken hill|renmark|adelaide|taree|chatswood|harbour|state theatre/i

  for (const fixture of SETTLEMENTS_SAMPLE_FIXTURES) {
    byAccuracy[fixture.accuracy] += 1
    byLife[fixture.lifecycle] += 1
    assert.equal(isSettlementsSampleCode(fixture.code), true)
    assert.equal(isProtectedSettlementsSeedCode(fixture.code), false)
    assert.match(fixture.name, /\bSAMPLE\b/)
    assert.match(fixture.notes, /\bSAMPLE\b/)
    assert.equal(isSettlementsDemoRun({ code: fixture.code, name: fixture.name, notes: fixture.notes }), true)
    assert.equal(sampleRunBookingStatus(), SAMPLE_RUN_BOOKING_STATUS)
    assert.equal(SAMPLE_RUN_BOOKING_STATUS, 'confirmed')
    assert.equal(isBookedBookingStatus(SAMPLE_RUN_BOOKING_STATUS), true)
    assert.equal(isAdvancingShowsListRun({ status: SAMPLE_RUN_BOOKING_STATUS }), true)
    assert.equal(isAdvancingShowsListRun({ status: 'post_show' }), false)
    assert.equal(isAdvancingShowsListRun({ status: 'settled' }), false)
    assert.equal(isSettlementsListCompletedRun({
      status: SAMPLE_RUN_BOOKING_STATUS,
      shows: [{ show_date: fixture.show.show_date }],
      today: '2026-09-07',
    }), true)
    assert.ok(fixture.show.capacity > 0)
    assert.ok(fixture.show.tickets_sold >= 0)
    assert.ok(fixture.advancing.length >= 6)
    assert.equal(
      fixture.advancing.find(l => l.field_key === 'production_costs')?.label,
      VENUE_PRODUCTION_AV_LABEL,
    )
    assert.equal(
      fixture.advancing.find(l => l.field_key === 'lighting_hire')?.label,
      PRODUCTION_BOUGHT_IN_LABEL,
    )
    const social = fixture.advancing.find(l => l.field_key === 'social_ads_var')
    assert.ok(social, `${fixture.code} missing social_ads_var auto_calc line`)
    assert.equal(social.label, SAMPLE_SOCIAL_ADS_LABEL)
    assert.equal(social.state, 'auto_calc')
    assert.equal(social.category, 'Marketing')
    assert.equal(social.amount, Math.round(fixture.show.tickets_sold * SOCIAL_ADS_PER_TICKET * 100) / 100)
    const mix = sampleAdvancingMixCounts(fixture.advancing)
    assert.ok(mix.paid >= 1, `${fixture.code} needs ≥1 PAID Advancing line`)
    assert.ok(mix.confirmedUnpaid >= 1, `${fixture.code} needs ≥1 confirmed-unpaid Advancing line`)
    assert.ok(mix.autoCalc >= 1, `${fixture.code} needs ≥1 auto_calc Advancing line`)
    assert.doesNotMatch(fixture.show.venue_name, realVenueHints)
    assert.doesNotMatch(fixture.show.venue_city, realVenueHints)
    if (fixture.lifecycle === 'not_settled') {
      assert.equal(fixture.actuals.length, 0)
      assert.equal(fixture.remittanceAmount, null)
    } else {
      assert.ok(fixture.actuals.some(a => a.line_key.startsWith('show:') || a.line_key === 'tickets_sold'))
    }
    if (fixture.lifecycle === 'settled_remitted') {
      assert.ok(fixture.remittanceAmount != null && fixture.remittanceAmount > 0)
    }
  }

  assert.equal(byAccuracy.accurate, 3)
  assert.equal(byAccuracy.a_little_out, 3)
  assert.equal(byAccuracy.completely_wrong, 2)
  assert.ok(byLife.not_settled >= 1)
  assert.ok(byLife.settled >= 1)
  assert.ok(byLife.settled_remitted >= 1)
})

test('inventory mapping matches the smoke table', () => {
  const inventory = sampleFixtureInventory()
  assert.deepEqual(inventory.map(r => [r.code, r.accuracy, r.lifecycle]), [
    ['SAMP01', 'accurate', 'not_settled'],
    ['SAMP02', 'accurate', 'settled'],
    ['SAMP03', 'accurate', 'settled_remitted'],
    ['SAMP04', 'a_little_out', 'not_settled'],
    ['SAMP05', 'a_little_out', 'settled'],
    ['SAMP06', 'a_little_out', 'settled_remitted'],
    ['SAMP07', 'completely_wrong', 'not_settled'],
    ['SAMP08', 'completely_wrong', 'settled_remitted'],
  ])
})

test('prod Supabase is refused; protected codes stay off-limits', () => {
  assert.equal(isSettlementsSeedTargetAllowed(`https://${PROD_SUPABASE_PROJECT_REF}.supabase.co`), false)
  assert.equal(isSettlementsSeedTargetAllowed('https://nlenbzhwnyigsihcphoz.supabase.co'), true)
  assert.equal(isSettlementsSeedTargetAllowed('http://127.0.0.1:54321'), true)
  assert.equal(isSettlementsSeedTargetAllowed(''), false)
  for (const code of SETTLEMENTS_SEED_PROTECTED_CODES) {
    assert.equal(isProtectedSettlementsSeedCode(code), true)
    assert.equal(isSettlementsSampleCode(code), false)
  }
})

test('SAMP codes badge as DEMO; R12 does not', () => {
  assert.equal(isSettlementsDemoRun({ code: 'SAMP01', name: 'Night' }), true)
  assert.equal(isSettlementsDemoRun({ code: 'R12', name: 'R12 Melbourne' }), false)
})

test('inventory advertises BOOKED status so re-seed cannot quietly regress to post_show', () => {
  for (const row of sampleFixtureInventory()) {
    assert.equal(row.run_status, 'confirmed')
  }
})

test('SAMP04 Northwharf is the Advancing + Settlements test vehicle with a realistic mix', () => {
  const northwharf = SETTLEMENTS_SAMPLE_FIXTURES.find(f => f.code === 'SAMP04')
  assert.ok(northwharf)
  assert.match(northwharf.name, /Northwharf/)
  assert.match(northwharf.notes, /Advancing \+ Settlements test vehicle/)
  assert.equal(northwharf.show.show_date, '2026-04-03')
  assert.equal(northwharf.lifecycle, 'not_settled')

  const flights = northwharf.advancing.find(l => l.field_key === 'flights')
  const hire = northwharf.advancing.find(l => l.field_key === 'venue_hire')
  const social = northwharf.advancing.find(l => l.field_key === 'social_ads_var')
  assert.equal(flights?.entryPaid, true)
  assert.equal(flights?.entryConfirmed, true)
  assert.equal(hire?.entryConfirmed, true)
  assert.equal(hire?.entryPaid, false)
  assert.equal(social?.state, 'auto_calc')
  assert.match(social?.notes ?? '', /Daniel Champagne/)
})

test('seed writes PAID / confirmed / auto_calc entries and lighting child label', () => {
  const northwharf = SETTLEMENTS_SAMPLE_FIXTURES.find(f => f.code === 'SAMP04')
  assert.ok(northwharf)
  const paidAt = '2026-04-03T10:00:00.000Z'

  const flights = northwharf.advancing.find(l => l.field_key === 'flights')
  assert.ok(flights)
  const flightEntries = buildSampleCostFieldEntries(flights, paidAt)
  assert.equal(flightEntries.length, 1)
  assert.equal(flightEntries[0]?.paid, true)
  assert.equal(flightEntries[0]?.confirmed, true)
  assert.equal(flightEntries[0]?.paid_at, paidAt)
  assert.equal(sampleCostFieldState(flights), 'known')

  const hire = northwharf.advancing.find(l => l.field_key === 'venue_hire')
  assert.ok(hire)
  const hireEntries = buildSampleCostFieldEntries(hire, paidAt)
  assert.equal(hireEntries[0]?.confirmed, true)
  assert.equal(hireEntries[0]?.paid, false)
  assert.equal(hireEntries[0]?.paid_at, null)
  assert.equal(sampleCostFieldState(hire), 'known')

  const marketing = northwharf.advancing.find(l => l.field_key === 'venue_marketing')
  assert.ok(marketing)
  const marketingEntries = buildSampleCostFieldEntries(marketing, paidAt)
  assert.equal(marketingEntries[0]?.confirmed, false)
  assert.equal(marketingEntries[0]?.paid, false)
  assert.equal(sampleCostFieldState(marketing), 'estimated')

  const social = northwharf.advancing.find(l => l.field_key === 'social_ads_var')
  assert.ok(social)
  assert.deepEqual(buildSampleCostFieldEntries(social, paidAt), [])
  assert.equal(sampleCostFieldState(social), 'auto_calc')

  const lighting = northwharf.advancing.find(l => l.field_key === 'lighting_hire')
  assert.ok(lighting)
  const lightingEntries = buildSampleCostFieldEntries(lighting, paidAt)
  assert.equal(lightingEntries[0]?.description, LIGHTING_HIRE_LINE_LABEL)
  assert.equal(lightingEntries[0]?.paid, true)
  assert.equal(lighting.label, PRODUCTION_BOUGHT_IN_LABEL)

  const dupes = SETTLEMENTS_SAMPLE_FIXTURES.find(f => f.code === 'SAMP07')
    ?.advancing.find(l => l.field_key === 'flights')
  assert.ok(dupes)
  const dupeEntries = buildSampleCostFieldEntries(dupes, paidAt)
  assert.equal(dupeEntries.length, 2)
  assert.ok(dupeEntries.every(e => e.paid === true && e.confirmed === true))
})

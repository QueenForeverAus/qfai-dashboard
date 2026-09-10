import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isSettlementsDemoRun } from '../../lib/settlements-sheet.ts'
import { isSettlementsListCompletedRun } from '../../lib/settlements-list.ts'
import {
  PROD_SUPABASE_PROJECT_REF,
  SETTLEMENTS_SAMPLE_CODES,
  SETTLEMENTS_SAMPLE_CONFIRM,
  SETTLEMENTS_SAMPLE_FIXTURES,
  SETTLEMENTS_SEED_PROTECTED_CODES,
  isProtectedSettlementsSeedCode,
  isSettlementsSampleCode,
  isSettlementsSeedTargetAllowed,
  sampleFixtureInventory,
} from '../../lib/settlements-sample-fixtures.ts'
import {
  PRODUCTION_BOUGHT_IN_LABEL,
  VENUE_PRODUCTION_AV_LABEL,
} from '../../lib/cost-fields.ts'

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
    assert.equal(isSettlementsListCompletedRun({
      status: fixture.lifecycle === 'not_settled' ? 'post_show' : 'settled',
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

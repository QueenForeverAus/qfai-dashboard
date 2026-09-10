import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  SETTLEMENTS_LIST_BUCKET_LABELS,
  SETTLEMENTS_LIST_EMPTY,
  classifySettlementsListBucket,
  defaultSettlementsListBucket,
  filterSettlementsIndexRuns,
  filterSettlementsListRuns,
  groupSettlementsListRuns,
  hasSettlementIn,
  isSettlementsIndexEligibleRun,
  isSettlementsListCompletedRun,
} from '../../lib/settlements-list.ts'
import { isSettlementsDemoRun, settlementSheetHref } from '../../lib/settlements-sheet.ts'

const TODAY = '2026-09-07'
const past = { show_date: '2026-07-18' }
const todayShow = { show_date: '2026-09-07' }
const future = { show_date: '2027-05-14' }

test('completed list runs require every show to have occurred; proposed never qualifies', () => {
  assert.equal(isSettlementsListCompletedRun({
    status: 'post_show',
    shows: [past],
    today: TODAY,
  }), true)
  assert.equal(isSettlementsListCompletedRun({
    status: 'confirmed',
    shows: [past],
    today: TODAY,
  }), true)
  assert.equal(isSettlementsListCompletedRun({
    status: 'settled',
    shows: [past, { show_date: '2026-07-19' }],
    today: TODAY,
  }), true)

  assert.equal(isSettlementsListCompletedRun({
    status: 'proposed',
    shows: [past],
    today: TODAY,
  }), false)
  assert.equal(isSettlementsListCompletedRun({
    status: 'confirmed',
    shows: [future],
    today: TODAY,
  }), false)
  assert.equal(isSettlementsListCompletedRun({
    status: 'confirmed',
    shows: [past, future],
    today: TODAY,
  }), false)
  assert.equal(isSettlementsListCompletedRun({
    status: 'show_week',
    shows: [past, todayShow],
    today: TODAY,
  }), false)
  assert.equal(isSettlementsListCompletedRun({
    status: 'post_show',
    shows: [],
    today: TODAY,
  }), false)
  assert.equal(isSettlementsListCompletedRun({
    status: 'post_show',
    shows: [{ show_date: null }],
    today: TODAY,
  }), false)
  assert.equal(isSettlementsListCompletedRun({
    status: 'confirmed',
    shows: [],
    end_date: '2026-08-22',
    today: TODAY,
  }), true)
  assert.equal(isSettlementsListCompletedRun({
    status: 'confirmed',
    shows: [],
    end_date: '2027-05-14',
    today: TODAY,
  }), false)
})

test('settlement-in is Col3 venue actuals, status=settled, or remittance accepted', () => {
  assert.equal(hasSettlementIn({ hasVenueSettlementActuals: true }), true)
  assert.equal(hasSettlementIn({ status: 'settled' }), true)
  assert.equal(hasSettlementIn({ remittanceStatus: 'accepted' }), true)
  assert.equal(hasSettlementIn({ status: 'post_show', remittanceStatus: 'open' }), false)
  assert.equal(hasSettlementIn({ status: 'confirmed', remittanceStatus: 'rectify_awaiting' }), false)
})

test('buckets: not settled / settled / settled & remitted', () => {
  assert.equal(classifySettlementsListBucket({
    status: 'post_show',
    remittanceStatus: 'open',
    hasVenueSettlementActuals: false,
  }), 'not_settled')

  assert.equal(classifySettlementsListBucket({
    status: 'post_show',
    remittanceStatus: 'open',
    hasVenueSettlementActuals: true,
  }), 'settled')
  assert.equal(classifySettlementsListBucket({
    status: 'settled',
    remittanceStatus: 'open',
  }), 'settled')
  assert.equal(classifySettlementsListBucket({
    status: 'settled',
    remittanceStatus: 'rectify_awaiting',
    hasVenueSettlementActuals: true,
  }), 'settled')

  assert.equal(classifySettlementsListBucket({
    status: 'post_show',
    remittanceStatus: 'accepted',
    hasVenueSettlementActuals: false,
  }), 'settled_remitted')
  assert.equal(classifySettlementsListBucket({
    status: 'settled',
    remittanceStatus: 'accepted',
    hasVenueSettlementActuals: true,
  }), 'settled_remitted')
})

test('multi-show completed run is one list entry, never one card per show', () => {
  const kept = filterSettlementsListRuns([
    {
      code: '26R01',
      status: 'confirmed',
      shows: [{ show_date: '2026-08-21' }, { show_date: '2026-08-22' }],
    },
    {
      code: '26R02',
      status: 'confirmed',
      shows: [{ show_date: '2026-09-04' }, { show_date: '2026-09-05' }],
    },
  ], TODAY)
  assert.deepEqual(kept.map(r => r.code), ['26R01', '26R02'])
  assert.equal(kept[0].shows.length, 2)
  assert.equal(kept[1].shows.length, 2)
  assert.equal(settlementSheetHref('26R01'), '/settlements/26r01')
  assert.equal(settlementSheetHref('26R02', 'd96aa3b0-cfed-4db4-926f-34490291d677'), '/settlements/26r02#venue-d96aa3b0-cfed-4db4-926f-34490291d677')
})

test('server-side filter drops proposed / BOOKED future / in-progress', () => {
  const kept = filterSettlementsListRuns([
    { code: 'SAMP01', status: 'post_show', shows: [past] },
    { code: 'R12', status: 'proposed', shows: [future] },
    { code: 'R01', status: 'confirmed', shows: [future] },
    { code: 'MIX', status: 'show_week', shows: [past, future] },
    { code: 'TCOMP1', status: 'confirmed', shows: [past] },
  ], TODAY)
  assert.deepEqual(kept.map(r => r.code), ['SAMP01', 'TCOMP1'])
})

test('group + default tab prefer settled when live settled runs exist', () => {
  const grouped = groupSettlementsListRuns([
    { bucket: 'settled' as const },
    { bucket: 'settled_remitted' as const },
    { bucket: 'settled' as const },
  ])
  assert.equal(grouped.not_settled.length, 0)
  assert.equal(grouped.settled.length, 2)
  assert.equal(grouped.settled_remitted.length, 1)
  assert.equal(defaultSettlementsListBucket({
    not_settled: 0,
    settled: 2,
    settled_remitted: 1,
  }), 'settled')
  assert.equal(defaultSettlementsListBucket({
    not_settled: 8,
    settled: 2,
    settled_remitted: 0,
  }), 'settled')
  assert.equal(defaultSettlementsListBucket({
    not_settled: 0,
    settled: 0,
    settled_remitted: 1,
  }), 'settled_remitted')
  assert.equal(defaultSettlementsListBucket({
    not_settled: 3,
    settled: 0,
    settled_remitted: 0,
  }), 'not_settled')
  assert.equal(defaultSettlementsListBucket({
    not_settled: 0,
    settled: 0,
    settled_remitted: 0,
  }), 'not_settled')
  assert.match(SETTLEMENTS_LIST_EMPTY, /completed shows/)
  assert.equal(SETTLEMENTS_LIST_BUCKET_LABELS.settled_remitted, 'Settled & remitted')
})

test('26R-like completed run with Actuals and no run_settlements lands in settled', () => {
  const run = {
    code: '26R01',
    name: 'Gosford + Richmond',
    status: 'confirmed',
    end_date: '2026-08-22',
    hasVenueSettlementActuals: true,
    shows: [
      { show_date: '2026-08-21', harbour_status: 'CONFIRMED', venue_name: 'Gosford' },
      { show_date: '2026-08-22', harbour_status: 'CONFIRMED', venue_name: 'Richmond' },
    ],
  }
  assert.equal(isSettlementsDemoRun(run), false)
  assert.equal(isSettlementsListCompletedRun({
    status: run.status,
    shows: run.shows,
    today: TODAY,
  }), true)
  assert.equal(isSettlementsIndexEligibleRun(run, TODAY), true)
  assert.equal(classifySettlementsListBucket({
    status: 'confirmed',
    remittanceStatus: undefined,
    hasVenueSettlementActuals: true,
  }), 'settled')
  const kept = filterSettlementsIndexRuns([run], TODAY)
  assert.deepEqual(kept.map(r => r.code), ['26R01'])
  assert.equal(settlementSheetHref('26R01'), '/settlements/26r01')
  assert.equal(settlementSheetHref('26R02'), '/settlements/26r02')
})

test('index drops SAMP/DEMO/TCOMP1/TRECV1 even when they look completed', () => {
  const kept = filterSettlementsIndexRuns([
    {
      code: 'SAMP01',
      name: 'SAMPLE night',
      status: 'confirmed',
      hasVenueSettlementActuals: false,
      shows: [{ show_date: '2026-07-18', harbour_status: 'CONFIRMED' }],
    },
    {
      code: 'SAMP',
      name: 'Loose sample code',
      status: 'confirmed',
      shows: [{ show_date: '2026-07-18', harbour_status: 'CONFIRMED' }],
    },
    {
      code: 'TCOMP1',
      name: 'Geelong',
      status: 'confirmed',
      hasVenueSettlementActuals: true,
      shows: [{ show_date: '2026-07-18', harbour_status: 'CONFIRMED' }],
    },
    {
      code: 'TRECV1',
      name: 'Receipts demo',
      status: 'confirmed',
      shows: [{ show_date: '2026-07-18', harbour_status: 'CONFIRMED' }],
    },
    {
      code: 'X1',
      name: 'DEMO completed show',
      status: 'confirmed',
      shows: [{ show_date: '2026-07-18', harbour_status: 'CONFIRMED' }],
    },
    {
      code: '26R02',
      name: 'Auckland + Hamilton',
      status: 'confirmed',
      hasVenueSettlementActuals: true,
      shows: [
        { show_date: '2026-09-04', harbour_status: 'CONFIRMED', venue_name: 'Auckland' },
        { show_date: '2026-09-05', harbour_status: 'CONFIRMED', venue_name: 'Hamilton' },
      ],
    },
  ], TODAY)
  assert.deepEqual(kept.map(r => r.code), ['26R02'])
})

test('index drops fully RETIRED harbour_status runs; mixed runs keep active shows', () => {
  const kept = filterSettlementsIndexRuns([
    {
      code: 'SAMP03',
      name: 'Still a sample if retire marker missing',
      status: 'confirmed',
      hasVenueSettlementActuals: true,
      shows: [{ show_date: '2026-07-18', harbour_status: 'RETIRED', venue_name: 'Town Hall' }],
    },
    {
      code: 'OLD01',
      name: 'Retired weekend',
      status: 'confirmed',
      hasVenueSettlementActuals: true,
      shows: [
        { show_date: '2026-07-18', harbour_status: 'RETIRED', venue_name: 'Civic' },
        { show_date: '2026-07-19', harbour_status: 'retired', venue_name: 'PAC' },
      ],
    },
    {
      code: 'OLD02',
      name: 'Retired venue name',
      status: 'confirmed',
      shows: [{ show_date: '2026-07-18', venue_name: 'RETIRED Civic Theatre' }],
    },
    {
      code: '26R01',
      name: 'Gosford + Richmond',
      status: 'confirmed',
      hasVenueSettlementActuals: true,
      shows: [
        { show_date: '2026-08-21', harbour_status: 'CONFIRMED', venue_name: 'Gosford' },
        { show_date: '2026-08-22', harbour_status: 'RETIRED', venue_name: 'Scratch date' },
      ],
    },
  ], TODAY)
  assert.deepEqual(kept.map(r => r.code), ['26R01'])
  assert.deepEqual(kept[0]!.shows.map(s => s.venue_name), ['Gosford'])
})

test('index includes a confirmed run with Actuals even without completed-show calendar if Actuals exist', () => {
  const kept = filterSettlementsIndexRuns([
    {
      code: '26R01',
      name: 'Gosford + Richmond',
      status: 'confirmed',
      hasVenueSettlementActuals: true,
      shows: [{ show_date: '2026-08-21', harbour_status: 'CONFIRMED' }],
    },
  ], TODAY)
  assert.equal(kept.length, 1)
  assert.equal(classifySettlementsListBucket({
    status: 'confirmed',
    remittanceStatus: 'open',
    hasVenueSettlementActuals: true,
  }), 'settled')
})

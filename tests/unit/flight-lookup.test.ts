import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { emptyFlightBlock } from '../../lib/worksheet-travel-blocks.ts'
import {
  AIRPORT_CALL_LEAD_MINUTES,
  FLIGHT_LOOKUP_NOT_CONFIGURED,
  FLIGHT_LOOKUP_NOT_FOUND,
  QF441_R01_DEP,
  airportCallFromDep,
  liveFlightLookup,
  lookupFlightSchedule,
  mergeFlightLookupIntoBlock,
  mockFlightLookup,
  nextAirportCall,
  normalizeFlightNumber,
  resolveFlightLookupProviderId,
  resolveFlightTravelBand,
  scheduleFromProviderJson,
} from '../../lib/flight-lookup/index.ts'

describe('airport-call G2−60 / G3−110', () => {
  it('subtracts 60 minutes for G2 carry-on', () => {
    assert.equal(AIRPORT_CALL_LEAD_MINUTES.G2, 60)
    assert.equal(airportCallFromDep('06:30', 'G2'), '05:30')
    assert.equal(airportCallFromDep('00:20', 'G2'), '23:20')
  })

  it('subtracts 110 minutes for G3 bags', () => {
    assert.equal(AIRPORT_CALL_LEAD_MINUTES.G3, 110)
    assert.equal(airportCallFromDep('06:30', 'G3'), '04:40')
    assert.equal(airportCallFromDep('01:00', 'G3'), '23:10')
  })

  it('does not invent a call without a parseable dep or a band', () => {
    assert.equal(airportCallFromDep('', 'G2'), '')
    assert.equal(airportCallFromDep('morning', 'G2'), '')
    assert.equal(airportCallFromDep('06:30', null), '')
  })

  it('resolves run region and leaves G1 / junk editable', () => {
    assert.equal(resolveFlightTravelBand('group2'), 'G2')
    assert.equal(resolveFlightTravelBand('group3'), 'G3')
    assert.equal(resolveFlightTravelBand('group1'), null)
    assert.equal(resolveFlightTravelBand(''), null)
    assert.equal(resolveFlightTravelBand('maybe-fly'), null)
  })

  it('recalcs when dep or band changes but keeps a manual override', () => {
    assert.equal(nextAirportCall({
      depTime: '07:30',
      band: 'G2',
      current: '05:30',
      previousDepTime: '06:30',
      previousBand: 'G2',
    }), '06:30')

    assert.equal(nextAirportCall({
      depTime: '06:30',
      band: 'G3',
      current: '05:30',
      previousDepTime: '06:30',
      previousBand: 'G2',
    }), '04:40')

    assert.equal(nextAirportCall({
      depTime: '07:30',
      band: 'G2',
      current: '05:00',
      previousDepTime: '06:30',
      previousBand: 'G2',
    }), '05:00')

    assert.equal(nextAirportCall({
      depTime: '07:30',
      band: 'G2',
      current: '05:00',
      dirty: true,
    }), '05:00')

    assert.equal(nextAirportCall({
      depTime: '06:30',
      band: 'G2',
      current: '',
    }), '05:30')
  })
})

describe('lookup merge into flight block', () => {
  it('fills airline, from→to, times, and known terminals only', () => {
    const block = {
      ...emptyFlightBlock('dep', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
      flight_number: 'qf 441',
      date: '2027-02-10',
      confirmation: 'KEEP-PNR',
      travellers: [{ profile_id: null, name: 'Gareth' }],
    }
    const hit = mockFlightLookup('QF441', '2027-02-10')
    const merged = mergeFlightLookupIntoBlock({
      block,
      result: hit,
      travelBand: 'G2',
    })
    assert.equal(merged.filled, true)
    assert.equal(merged.error, null)
    assert.equal(merged.block.airline, 'Qantas')
    assert.equal(merged.block.from, 'SYD')
    assert.equal(merged.block.to, 'BHQ')
    assert.equal(merged.block.dep_time, '06:30')
    assert.equal(merged.block.arr_time, '08:15')
    assert.equal(merged.block.dep_terminal, 'T3')
    assert.equal(merged.block.arr_terminal, '')
    assert.equal(merged.block.airport_call, '05:30')
    assert.equal(merged.block.confirmation, 'KEEP-PNR')
    assert.equal(merged.block.travellers[0]?.name, 'Gareth')
    assert.equal(merged.block.kind, 'dep')
    assert.deepEqual(hit.ok ? hit.schedule : null, QF441_R01_DEP)
  })

  it('uses the same pattern on mid and ret legs', () => {
    const mid = mergeFlightLookupIntoBlock({
      block: { ...emptyFlightBlock('mid'), flight_number: 'QF11', date: '2027-02-11' },
      result: mockFlightLookup('QF11', '2027-02-11'),
      travelBand: 'G3',
    })
    assert.equal(mid.filled, true)
    assert.equal(mid.block.kind, 'mid')
    assert.equal(mid.block.from, 'BHQ')
    assert.equal(mid.block.to, 'ADL')
    assert.equal(mid.block.dep_terminal, '')
    assert.equal(mid.block.arr_terminal, 'T1')
    assert.equal(mid.block.airport_call, '07:50')

    const ret = mergeFlightLookupIntoBlock({
      block: { ...emptyFlightBlock('ret'), flight_number: 'QF442', date: '2027-02-13' },
      result: mockFlightLookup('QF442', '2027-02-13'),
      travelBand: 'G2',
    })
    assert.equal(ret.filled, true)
    assert.equal(ret.block.kind, 'ret')
    assert.equal(ret.block.from, 'BHQ')
    assert.equal(ret.block.to, 'SYD')
    assert.equal(ret.block.dep_terminal, '')
    assert.equal(ret.block.arr_terminal, '')
    assert.equal(ret.block.airport_call, '15:00')
  })

  it('does not invent on miss — fields stay blank', () => {
    const blank = emptyFlightBlock('dep')
    const missed = mergeFlightLookupIntoBlock({
      block: { ...blank, flight_number: 'QF999', date: '2027-02-10' },
      result: mockFlightLookup('QF999', '2027-02-10'),
      travelBand: 'G2',
    })
    assert.equal(missed.filled, false)
    assert.equal(missed.error, FLIGHT_LOOKUP_NOT_FOUND)
    assert.equal(missed.block.airline, '')
    assert.equal(missed.block.from, '')
    assert.equal(missed.block.to, '')
    assert.equal(missed.block.dep_time, '')
    assert.equal(missed.block.dep_terminal, '')
    assert.equal(missed.block.airport_call, '')

    const wrongDate = mergeFlightLookupIntoBlock({
      block: { ...blank, flight_number: 'QF441', date: '2027-02-11' },
      result: mockFlightLookup('QF441', '2027-02-11'),
      travelBand: 'G2',
    })
    assert.equal(wrongDate.filled, false)
    assert.equal(wrongDate.block.airline, '')
  })

  it('does not overwrite a manual airport call after lookup', () => {
    const block = {
      ...emptyFlightBlock('dep'),
      flight_number: 'QF441',
      date: '2027-02-10',
      airport_call: '04:55',
    }
    const merged = mergeFlightLookupIntoBlock({
      block,
      result: mockFlightLookup('QF441', '2027-02-10'),
      travelBand: 'G2',
      airportCallDirty: true,
    })
    assert.equal(merged.block.dep_time, '06:30')
    assert.equal(merged.block.airport_call, '04:55')
  })
})

describe('pluggable provider', () => {
  it('normalizes flight numbers and uses mock on staging when no key', () => {
    assert.equal(normalizeFlightNumber('qf 441'), 'QF441')
    assert.equal(resolveFlightLookupProviderId({
      host: 'qfai-staging.vercel.app',
    }), 'mock')
    assert.equal(resolveFlightLookupProviderId({
      vercelEnv: 'production',
      siteUrl: 'https://queenforever.com.au',
    }), null)
  })

  it('uses live only when URL + key are both present', () => {
    assert.equal(resolveFlightLookupProviderId({
      apiKey: 'secret',
      host: 'qfai-staging.vercel.app',
    }), 'mock')
    assert.equal(resolveFlightLookupProviderId({
      apiKey: 'secret',
      apiUrl: 'https://example.test/flights',
    }), 'live')
    assert.equal(resolveFlightLookupProviderId({
      provider: 'mock',
      apiKey: 'secret',
      apiUrl: 'https://example.test/flights',
    }), 'mock')
  })

  it('returns provider-not-configured off staging without credentials', async () => {
    const result = await lookupFlightSchedule('QF441', '2027-02-10', {
      vercelEnv: 'production',
      siteUrl: 'https://app.example.com',
      nodeEnv: 'production',
    })
    assert.equal(result.ok, false)
    assert.equal(result.code, 'not_configured')
    assert.equal(result.schedule, null)
    assert.equal(result.error, FLIGHT_LOOKUP_NOT_CONFIGURED)
  })

  it('maps a live JSON body without inventing terminals', async () => {
    const result = await liveFlightLookup('QF441', '2027-02-10', {
      apiKey: 'already-present',
      apiUrl: 'https://example.test/schedule',
    }, async () => new Response(JSON.stringify({
      airline: 'Qantas',
      from: 'MEL',
      to: 'SYD',
      dep_time: '06:00',
      arr_time: '07:25',
      dep_terminal: 'TBC',
      arr_terminal: '',
    }), { status: 200 }))
    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.equal(result.schedule.dep_terminal, '')
    assert.equal(result.schedule.arr_terminal, '')
    assert.equal(result.schedule.from, 'MEL')
  })

  it('treats live 404 as a miss, not a guess', async () => {
    const result = await liveFlightLookup('QF999', '2027-02-10', {
      apiKey: 'already-present',
      apiUrl: 'https://example.test/schedule',
    }, async () => new Response('nope', { status: 404 }))
    assert.equal(result.ok, false)
    assert.equal(result.code, 'not_found')
    assert.equal(result.schedule, null)
  })

  it('reads wrapped provider JSON', () => {
    const schedule = scheduleFromProviderJson({
      data: { airline: 'Jetstar', origin: 'SYD', destination: 'OOL', departure_time: '11:00' },
    }, 'JQ401', '2027-03-01')
    assert.equal(schedule?.airline, 'Jetstar')
    assert.equal(schedule?.from, 'SYD')
    assert.equal(schedule?.to, 'OOL')
    assert.equal(schedule?.dep_terminal, '')
  })
})

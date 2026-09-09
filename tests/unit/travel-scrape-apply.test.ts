import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ADVANCING_WRITES_BACK_TO_COSTING } from '../../lib/run-advancing.ts'
import {
  EMPTY_TRAVEL_BLOCKS,
  parseTravelBlocks,
} from '../../lib/worksheet-travel-blocks.ts'
import {
  assertTravelScrapeApplyTable,
  isTravelScrapeMoneyConfirmed,
  LINE_HINT_TO_FIELD_KEY,
  planTravelScrapeApply,
  TRAVEL_SCRAPE_APPLY_TABLES,
  TRAVEL_SCRAPE_APPLY_WRITES_COST_FIELDS,
  TRAVEL_SCRAPE_PROPOSED_ERROR,
  travelScrapeBlockedReason,
} from '../../lib/travel-scrape/apply-engine.ts'
import {
  R01_DEP_FLIGHT_PACKET,
  TAMWORTH_SCRAPE_PACKET,
  THORNTON_SCRAPE_PACKET,
  TRECV1_CAR_PACKET,
} from '../../lib/travel-scrape/fixtures.ts'
import { parseTravelScrapePacket } from '../../lib/travel-scrape/packet.ts'
import {
  draftTravelBlock,
  formatTravelScrapeSourceNote,
  mergeTravelBlocksFromPacket,
  packetConfirmation,
  resolvePacketTravellers,
  splitWorksheetDateTime,
  worksheetHotelFields,
} from '../../lib/travel-scrape/worksheet.ts'

const profiles = [
  { id: '11111111-1111-4111-8111-111111111111', full_name: 'Gareth Hill', nickname: 'Gaz' },
  { id: '22222222-2222-4222-8222-222222222222', full_name: 'Michael Richardson', nickname: 'Michael' },
]

const bookedGate = {
  bookingStatus: 'confirmed',
  hasActiveWorkspace: true,
  targetRunId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
}

describe('travel-scrape-packet-v1 schema', () => {
  it('parses hotel, flight, and car fixtures', () => {
    for (const packet of [THORNTON_SCRAPE_PACKET, TAMWORTH_SCRAPE_PACKET, R01_DEP_FLIGHT_PACKET, TRECV1_CAR_PACKET]) {
      const parsed = parseTravelScrapePacket(packet)
      assert.equal(parsed.ok, true, parsed.ok ? '' : parsed.error)
      if (parsed.ok) {
        assert.equal(parsed.packet.schema_version, 'travel-scrape-packet-v1')
        assert.equal(parsed.packet.apply_env, 'staging')
      }
    }
  })

  it('rejects the old receipt-extract envelope', () => {
    const parsed = parseTravelScrapePacket({
      version: 1,
      kind: 'hotel',
      vendor: 'Thornton Executive',
      confirmation_id: 'TE-91718',
    })
    assert.equal(parsed.ok, false)
    if (!parsed.ok) assert.match(parsed.error, /schema_version/)
  })
})

/** Live Comms glance shape — locked packet uses conf / ISO check_in, not W1 card names. */
const THORNTON_GLANCE_PACKET = {
  ...THORNTON_SCRAPE_PACKET,
  worksheet: {
    name: 'Thornton Executive',
    address: '1 Weakleys Dr, Thornton NSW 2322',
    check_in: '2026-09-17T14:00',
    check_out: '2026-09-18',
    rooms: 7,
    conf: '6031616996',
    pin: '8081',
    eta_notes: 'Day-before first show. Newcastle catchment.',
    city_night_key: 'Maitland_2026-09-17',
  },
  checklist: {
    items_to_tick: ['hotel_booked'],
    source_note: '',
    partial_names: false,
  },
}

describe('worksheet field aliases', () => {
  it('splits glance ISO datetime and date-only into W1 date + time', () => {
    assert.deepEqual(splitWorksheetDateTime('2026-09-17T14:00'), { date: '2026-09-17', time: '14:00' })
    assert.deepEqual(splitWorksheetDateTime('2026-09-18'), { date: '2026-09-18', time: '' })
    assert.deepEqual(splitWorksheetDateTime('2026-09-17T14:00:00+10:00'), { date: '2026-09-17', time: '14:00' })
  })

  it('maps a glance-shaped Thornton packet onto a filled HotelBlock', () => {
    const parsed = parseTravelScrapePacket(THORNTON_GLANCE_PACKET)
    assert.equal(parsed.ok, true, parsed.ok ? '' : parsed.error)
    if (!parsed.ok) return

    assert.equal(packetConfirmation(parsed.packet), '6031616996')
    const fields = worksheetHotelFields(parsed.packet.worksheet)
    assert.equal(fields.check_in_date, '2026-09-17')
    assert.equal(fields.check_in_time, '14:00')
    assert.equal(fields.check_out_date, '2026-09-18')
    assert.equal(fields.check_out_time, '')
    assert.equal(fields.city, 'Maitland')

    const draft = draftTravelBlock(parsed.packet, profiles)
    assert.equal(draft?.collection, 'hotels')
    const hotel = draft?.block
    assert.ok(hotel && 'check_in_date' in hotel)
    if (!hotel || !('check_in_date' in hotel)) return
    assert.equal(hotel.name, 'Thornton Executive')
    assert.equal(hotel.confirmation, '6031616996')
    assert.equal(hotel.check_in_date, '2026-09-17')
    assert.equal(hotel.check_in_time, '14:00')
    assert.equal(hotel.check_out_date, '2026-09-18')
    assert.equal(hotel.check_out_time, '')
    assert.equal(hotel.rooms, 7)
    assert.equal(hotel.pin, '8081')

    const plan = planTravelScrapeApply({
      ...bookedGate,
      packet: THORNTON_GLANCE_PACKET,
      existingTravelBlocks: EMPTY_TRAVEL_BLOCKS,
      profiles,
    })
    assert.equal(plan.ok, true, plan.error ?? '')
    assert.equal(plan.details.will_apply, true)
    const applied = plan.next_travel_blocks.hotels[0]
    assert.equal(applied?.confirmation, '6031616996')
    assert.equal(applied?.check_in_date, '2026-09-17')
    assert.equal(applied?.check_in_time, '14:00')
    assert.equal(applied?.check_out_date, '2026-09-18')
    assert.equal(applied?.rooms, 7)
    assert.deepEqual(plan.checklist.item_keys, ['hotel_confirmed'])
    assert.match(plan.checklist.source_note, /conf 6031616996/)
  })

  it('maps glance flight aliases (flight_no / dep_local / arr_local / leg)', () => {
    const plan = planTravelScrapeApply({
      ...bookedGate,
      packet: {
        ...R01_DEP_FLIGHT_PACKET,
        worksheet: {
          leg: 'dep',
          flight_no: 'QF441',
          airline: 'Qantas',
          from: 'SYD',
          to: 'BHQ',
          dep_local: '2027-02-10T06:30',
          arr_local: '2027-02-10T08:15',
          confirmation: 'QFR01DEP',
        },
      },
      existingTravelBlocks: EMPTY_TRAVEL_BLOCKS,
      profiles,
    })
    assert.equal(plan.ok, true)
    const flight = plan.next_travel_blocks.flights[0]
    assert.equal(flight?.kind, 'dep')
    assert.equal(flight?.flight_number, 'QF441')
    assert.equal(flight?.date, '2027-02-10')
    assert.equal(flight?.dep_time, '06:30')
    assert.equal(flight?.arr_time, '08:15')
  })
})

describe('travel_blocks merge', () => {
  it('maps Thornton hotel + travellers onto a W1 hotel card', () => {
    const people = resolvePacketTravellers(THORNTON_SCRAPE_PACKET.travellers, profiles)
    assert.equal(people[0]?.profile_id, profiles[0].id)
    assert.equal(people[1]?.profile_id, profiles[1].id)

    const plan = planTravelScrapeApply({
      ...bookedGate,
      packet: THORNTON_SCRAPE_PACKET,
      existingTravelBlocks: EMPTY_TRAVEL_BLOCKS,
      profiles,
    })
    assert.equal(plan.ok, true, plan.error ?? '')
    assert.equal(plan.details.will_apply, true)
    assert.equal(plan.details.merge_action, 'create')
    assert.equal(plan.next_travel_blocks.hotels.length, 1)
    const hotel = plan.next_travel_blocks.hotels[0]
    assert.equal(hotel.name, 'Thornton Executive')
    assert.equal(hotel.check_in_date, '2026-09-17')
    assert.equal(hotel.check_out_date, '2026-09-18')
    assert.equal(hotel.confirmation, 'TE-91718')
    assert.equal(hotel.rooms, 1)
    assert.equal(hotel.guests.length, 2)
    assert.equal(hotel.guests[0]?.profile_id, profiles[0].id)
    assert.equal(plan.writes_cost_fields, false)
  })

  it('maps an R01/TRECV1 dep flight and keeps unmatched free-text', () => {
    const plan = planTravelScrapeApply({
      ...bookedGate,
      packet: R01_DEP_FLIGHT_PACKET,
      existingTravelBlocks: EMPTY_TRAVEL_BLOCKS,
      profiles,
    })
    assert.equal(plan.ok, true)
    assert.equal(plan.next_travel_blocks.flights.length, 1)
    const flight = plan.next_travel_blocks.flights[0]
    assert.equal(flight.kind, 'dep')
    assert.equal(flight.flight_number, 'QF441')
    assert.equal(flight.from, 'SYD')
    assert.equal(flight.to, 'BHQ')
    assert.equal(flight.date, '2027-02-10')
    assert.equal(flight.travellers[0]?.profile_id, profiles[0].id)
    assert.equal(flight.travellers[1]?.profile_id, null)
    assert.equal(flight.travellers[1]?.name, 'Dave the driver')
  })

  it('maps a car hire card onto W1 cars[]', () => {
    const plan = planTravelScrapeApply({
      ...bookedGate,
      packet: TRECV1_CAR_PACKET,
      existingTravelBlocks: EMPTY_TRAVEL_BLOCKS,
      profiles,
    })
    assert.equal(plan.ok, true)
    assert.equal(plan.next_travel_blocks.cars.length, 1)
    const car = plan.next_travel_blocks.cars[0]
    assert.equal(car.provider, 'Avis')
    assert.equal(car.pickup_location, 'Broken Hill airport')
    assert.equal(car.return_location, 'Adelaide airport')
    assert.equal(car.confirmation, 'AVI-99')
    assert.equal(car.unlimited_km, true)
    assert.equal(car.drivers[0]?.profile_id, profiles[0].id)
  })

  it('merges a second hotel without wiping the first, and overlays superseding conf', () => {
    const first = mergeTravelBlocksFromPacket({
      existing: EMPTY_TRAVEL_BLOCKS,
      packet: THORNTON_SCRAPE_PACKET,
      profiles,
    })
    const second = mergeTravelBlocksFromPacket({
      existing: first.next,
      packet: TAMWORTH_SCRAPE_PACKET,
      profiles,
    })
    assert.equal(second.next.hotels.length, 2)
    assert.deepEqual(second.next.hotels.map(h => h.confirmation).sort(), ['TE-91718', 'TH-1819'])

    const update = mergeTravelBlocksFromPacket({
      existing: second.next,
      packet: {
        ...TAMWORTH_SCRAPE_PACKET,
        worksheet: { ...TAMWORTH_SCRAPE_PACKET.worksheet, room_type: 'Twin', phone: '02 0000 0000' },
        supersedes: { prior_conf_id: 'TH-1819', prior_message_id: 'msg-th-1819' },
      },
      profiles,
    })
    assert.equal(update.action, 'update')
    assert.equal(update.next.hotels.length, 2)
    const tamworth = update.next.hotels.find(h => h.confirmation === 'TH-1819')
    assert.equal(tamworth?.room_type, 'Twin')
    assert.equal(tamworth?.phone, '02 0000 0000')
    assert.equal(tamworth?.name, 'Tamworth Hotel')
  })
})

describe('checklist tick + source note', () => {
  it('plans hotel_confirmed + packet source note after a successful details apply', () => {
    const plan = planTravelScrapeApply({
      ...bookedGate,
      packet: THORNTON_SCRAPE_PACKET,
      profiles,
    })
    assert.equal(plan.checklist.will_apply, true)
    assert.deepEqual(plan.checklist.item_keys, ['hotel_confirmed'])
    assert.equal(plan.checklist.source_note, 'from Thornton Executive email 17/09/26 · conf TE-91718')
    assert.equal(formatTravelScrapeSourceNote(THORNTON_SCRAPE_PACKET), plan.checklist.source_note)
  })

  it('plans flights_complete for the dep-flight fixture', () => {
    const plan = planTravelScrapeApply({
      ...bookedGate,
      packet: R01_DEP_FLIGHT_PACKET,
      profiles,
    })
    assert.deepEqual(plan.checklist.item_keys, ['flights_complete'])
    assert.match(plan.checklist.source_note, /Qantas/)
  })

  it('does not tick checklist when details are held', () => {
    const plan = planTravelScrapeApply({
      ...bookedGate,
      packet: { ...THORNTON_SCRAPE_PACKET, details_action: 'ask' },
      profiles,
    })
    assert.equal(plan.details.action, 'ask')
    assert.equal(plan.details.will_apply, false)
    assert.equal(plan.checklist.will_apply, false)
    assert.equal(plan.next_travel_blocks.hotels.length, 0)
  })
})

describe('money confirm hook', () => {
  it('blocks Advancing money/PAID without an explicit confirm', () => {
    const plan = planTravelScrapeApply({
      ...bookedGate,
      packet: THORNTON_SCRAPE_PACKET,
      existingEntries: [],
      profiles,
    })
    assert.equal(plan.details.will_apply, true)
    assert.equal(plan.money.will_write, false)
    assert.equal(plan.money.action, 'confirm_needed')
    assert.equal(plan.money.field_key, 'accommodation')
    assert.equal(plan.money.amount, 214)
    assert.equal(plan.money.next_entries.length, 0)
    assert.equal(isTravelScrapeMoneyConfirmed({}), false)
  })

  it('writes a PAID Advancing night line when confirm_money is set', () => {
    const plan = planTravelScrapeApply({
      ...bookedGate,
      packet: THORNTON_SCRAPE_PACKET,
      existingEntries: [],
      profiles,
      confirmMoney: true,
      moneyConfirmedBy: 'Gareth',
    })
    assert.equal(plan.money.will_write, true)
    assert.equal(plan.money.action, 'written')
    assert.equal(plan.money.writes_paid, true)
    assert.equal(plan.money.next_entries.length, 1)
    assert.equal(plan.money.next_entries[0]?.amount, 214)
    assert.equal(plan.money.next_entries[0]?.paid, true)
    assert.equal(plan.money.next_entries[0]?.confirmed, true)
    assert.equal(plan.money.next_entries[0]?.night_date, '2026-09-17')
    assert.equal(plan.money.next_entries[0]?.city, 'Thornton')
    assert.equal(plan.money.next_entries[0]?.confirmation_id, 'TE-91718')
    assert.match(plan.money.next_entries[0]?.notes ?? '', /Confirmed by Gareth/)
  })

  it('writes flights money onto the flights field with the confirm hook', () => {
    const plan = planTravelScrapeApply({
      ...bookedGate,
      packet: R01_DEP_FLIGHT_PACKET,
      existingEntries: [],
      profiles,
      confirmMoney: true,
    })
    assert.equal(plan.money.field_key, 'flights')
    assert.equal(LINE_HINT_TO_FIELD_KEY.flights, 'flights')
    assert.equal(plan.money.next_entries[0]?.amount, 428)
    assert.equal(plan.money.next_entries[0]?.paid, true)
  })

  it('maps car_hire to ground_transport — never a car_hire field_key', () => {
    assert.equal(LINE_HINT_TO_FIELD_KEY.car_hire, 'ground_transport')
    const plan = planTravelScrapeApply({
      ...bookedGate,
      packet: TRECV1_CAR_PACKET,
      existingEntries: [],
      profiles,
      moneyConfirmedBy: 'Gareth',
    })
    assert.equal(plan.money.field_key, 'ground_transport')
    assert.equal(plan.money.will_write, true)
  })
})

describe('apply gates + costing isolation', () => {
  it('rejects proposed runs and missing workspace', () => {
    assert.equal(travelScrapeBlockedReason({
      bookingStatus: 'proposed',
      hasActiveWorkspace: false,
    }), TRAVEL_SCRAPE_PROPOSED_ERROR)

    const proposed = planTravelScrapeApply({
      bookingStatus: 'proposed',
      hasActiveWorkspace: true,
      packet: THORNTON_SCRAPE_PACKET,
      profiles,
    })
    assert.equal(proposed.ok, false)
    assert.match(proposed.error ?? '', /proposed/)
    assert.equal(proposed.details.will_apply, false)
    assert.equal(proposed.money.will_write, false)

    const noWs = planTravelScrapeApply({
      bookingStatus: 'confirmed',
      hasActiveWorkspace: false,
      packet: THORNTON_SCRAPE_PACKET,
      profiles,
    })
    assert.equal(noWs.ok, false)
    assert.match(noWs.error ?? '', /workspace/)
  })

  it('refuses apply_env=production', () => {
    const plan = planTravelScrapeApply({
      ...bookedGate,
      packet: { ...THORNTON_SCRAPE_PACKET, apply_env: 'production' },
      profiles,
    })
    assert.equal(plan.ok, false)
    assert.match(plan.error ?? '', /staging-only|production/)
  })

  it('holds details on medium confidence, watch, and blocking flags', () => {
    const medium = planTravelScrapeApply({
      ...bookedGate,
      packet: { ...THORNTON_SCRAPE_PACKET, confidence: 'medium' },
      profiles,
    })
    assert.equal(medium.ok, true)
    assert.equal(medium.details.action, 'ask')
    assert.equal(medium.next_travel_blocks.hotels.length, 0)

    const watch = planTravelScrapeApply({
      ...bookedGate,
      packet: { ...THORNTON_SCRAPE_PACKET, details_action: 'watch' },
      profiles,
    })
    assert.equal(watch.details.action, 'watch')
    assert.equal(watch.next_travel_blocks.hotels.length, 0)

    const flagged = planTravelScrapeApply({
      ...bookedGate,
      packet: { ...THORNTON_SCRAPE_PACKET, flags: ['run_ambiguous'] },
      profiles,
    })
    assert.equal(flagged.details.action, 'ask')
    assert.match(flagged.details.reason, /run_ambiguous|Blocking/)
    assert.equal(flagged.next_travel_blocks.hotels.length, 0)
  })

  it('never writes cost_fields — Advancing twin + workspace only', () => {
    assert.equal(TRAVEL_SCRAPE_APPLY_WRITES_COST_FIELDS, false)
    assert.equal(ADVANCING_WRITES_BACK_TO_COSTING, false)
    assert.equal((TRAVEL_SCRAPE_APPLY_TABLES as readonly string[]).includes('cost_fields'), false)
    assert.ok(TRAVEL_SCRAPE_APPLY_TABLES.includes('run_advancing_workspaces'))
    assert.ok(TRAVEL_SCRAPE_APPLY_TABLES.includes('advancement_items'))
    assert.throws(() => assertTravelScrapeApplyTable('cost_fields'), /never write cost_fields/)
    const plan = planTravelScrapeApply({
      ...bookedGate,
      packet: TAMWORTH_SCRAPE_PACKET,
      profiles,
      confirmMoney: true,
    })
    assert.equal(plan.writes_cost_fields, false)
    const hotel = parseTravelBlocks(plan.next_travel_blocks).hotels[0]
    assert.equal(hotel?.name, 'Tamworth Hotel')
    assert.equal(plan.money.field_key, 'accommodation')
  })
})

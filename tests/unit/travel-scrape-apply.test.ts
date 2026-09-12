import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ADVANCING_WRITES_BACK_TO_COSTING } from '../../lib/run-advancing.ts'
import {
  EMPTY_TRAVEL_BLOCKS,
  parseTravelBlocks,
} from '../../lib/worksheet-travel-blocks.ts'
import {
  assertTravelScrapeApplyTable,
  findAccomNightMoneyEntry,
  formatTravelScrapeApplyMoneyResponse,
  formatTravelScrapeCityNightKey,
  isTravelScrapeMoneyConfirmed,
  LINE_HINT_TO_FIELD_KEY,
  normalizeAccomMoneyCity,
  planTravelScrapeApply,
  planTravelScrapeMoney,
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
  findExistingTravelBlock,
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

/** Staging 26R03 — two Virgin legs, one PNR. Details only; no money invent. */
const DWEOOK_DEP_PACKET = {
  ...R01_DEP_FLIGHT_PACKET,
  email: {
    ...R01_DEP_FLIGHT_PACKET.email,
    thread_id: 'va-dweook',
    message_id: 'msg-va1595-dweook',
    subject: 'Virgin Australia itinerary — VA1595 MEL to NTL',
    from: 'noreply@virginaustralia.com',
    vendor_domain: 'virginaustralia.com',
  },
  worksheet: {
    kind: 'dep',
    flight_number: 'VA1595',
    date: '2026-09-16',
    airline: 'Virgin Australia',
    from: 'MEL',
    to: 'NTL',
    dep_time: '09:10',
    arr_time: '10:35',
    confirmation: 'DWEOOK',
  },
  checklist: {
    items_to_tick: ['flights_complete'],
    source_note: 'from Virgin Australia email · conf DWEOOK',
    partial_names: false,
  },
}

const DWEOOK_RET_PACKET = {
  ...DWEOOK_DEP_PACKET,
  email: {
    ...DWEOOK_DEP_PACKET.email,
    message_id: 'msg-va1592-dweook',
    subject: 'Virgin Australia itinerary — VA1592 NTL to MEL',
  },
  worksheet: {
    kind: 'ret',
    flight_number: 'VA1592',
    date: '2026-09-21',
    airline: 'Virgin Australia',
    from: 'NTL',
    to: 'MEL',
    dep_time: '18:00',
    arr_time: '19:25',
    confirmation: 'DWEOOK',
  },
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
    assert.equal(flight.airport_call, '')
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

  it('keeps two flights when they share a PNR but have different kinds', () => {
    const dep = mergeTravelBlocksFromPacket({
      existing: EMPTY_TRAVEL_BLOCKS,
      packet: DWEOOK_DEP_PACKET,
      profiles,
    })
    const ret = mergeTravelBlocksFromPacket({
      existing: dep.next,
      packet: DWEOOK_RET_PACKET,
      profiles,
    })
    assert.equal(dep.action, 'create')
    assert.equal(ret.action, 'create')
    assert.equal(ret.next.flights.length, 2)
    const depBlock = ret.next.flights.find(f => f.kind === 'dep')
    const retBlock = ret.next.flights.find(f => f.kind === 'ret')
    assert.equal(depBlock?.confirmation, 'DWEOOK')
    assert.equal(retBlock?.confirmation, 'DWEOOK')
    assert.equal(depBlock?.flight_number, 'VA1595')
    assert.equal(retBlock?.flight_number, 'VA1592')
    assert.equal(depBlock?.from, 'MEL')
    assert.equal(depBlock?.to, 'NTL')
    assert.equal(retBlock?.from, 'NTL')
    assert.equal(retBlock?.to, 'MEL')
    assert.notEqual(depBlock?.id, retBlock?.id)
    assert.equal(
      findExistingTravelBlock(dep.next, DWEOOK_RET_PACKET)?.id ?? null,
      null,
    )
    assert.equal(
      findExistingTravelBlock(ret.next, DWEOOK_RET_PACKET)?.id,
      retBlock?.id,
    )
  })

  it('updates only the matching kind when the same PNR is re-applied', () => {
    const dep = mergeTravelBlocksFromPacket({
      existing: EMPTY_TRAVEL_BLOCKS,
      packet: DWEOOK_DEP_PACKET,
      profiles,
    })
    const both = mergeTravelBlocksFromPacket({
      existing: dep.next,
      packet: DWEOOK_RET_PACKET,
      profiles,
    })
    const updatedRet = mergeTravelBlocksFromPacket({
      existing: both.next,
      packet: {
        ...DWEOOK_RET_PACKET,
        worksheet: { ...DWEOOK_RET_PACKET.worksheet, dep_time: '18:45', arr_time: '20:10' },
      },
      profiles,
    })
    assert.equal(updatedRet.action, 'update')
    assert.equal(updatedRet.next.flights.length, 2)
    const depBlock = updatedRet.next.flights.find(f => f.kind === 'dep')
    const retBlock = updatedRet.next.flights.find(f => f.kind === 'ret')
    assert.equal(depBlock?.id, both.next.flights.find(f => f.kind === 'dep')?.id)
    assert.equal(retBlock?.id, both.next.flights.find(f => f.kind === 'ret')?.id)
    assert.equal(depBlock?.flight_number, 'VA1595')
    assert.equal(depBlock?.dep_time, '09:10')
    assert.equal(retBlock?.flight_number, 'VA1592')
    assert.equal(retBlock?.dep_time, '18:45')
    assert.equal(retBlock?.arr_time, '20:10')
    assert.equal(retBlock?.confirmation, 'DWEOOK')
  })

  it('updates in place when confirmation and kind both match', () => {
    const first = mergeTravelBlocksFromPacket({
      existing: EMPTY_TRAVEL_BLOCKS,
      packet: DWEOOK_DEP_PACKET,
      profiles,
    })
    const second = mergeTravelBlocksFromPacket({
      existing: first.next,
      packet: {
        ...DWEOOK_DEP_PACKET,
        worksheet: { ...DWEOOK_DEP_PACKET.worksheet, dep_time: '09:25', arr_terminal: 'T2' },
      },
      profiles,
    })
    assert.equal(second.action, 'update')
    assert.equal(second.next.flights.length, 1)
    assert.equal(second.block_id, first.block_id)
    assert.equal(second.next.flights[0]?.kind, 'dep')
    assert.equal(second.next.flights[0]?.confirmation, 'DWEOOK')
    assert.equal(second.next.flights[0]?.dep_time, '09:25')
    assert.equal(second.next.flights[0]?.arr_terminal, 'T2')
    assert.equal(second.next.flights[0]?.flight_number, 'VA1595')
  })

  it('matches a prior block id without crossing kinds', () => {
    const dep = mergeTravelBlocksFromPacket({
      existing: EMPTY_TRAVEL_BLOCKS,
      packet: DWEOOK_DEP_PACKET,
      profiles,
    })
    const both = mergeTravelBlocksFromPacket({
      existing: dep.next,
      packet: DWEOOK_RET_PACKET,
      profiles,
    })
    const retId = both.next.flights.find(f => f.kind === 'ret')?.id
    assert.ok(retId)
    const updated = mergeTravelBlocksFromPacket({
      existing: both.next,
      packet: {
        ...DWEOOK_RET_PACKET,
        worksheet: { ...DWEOOK_RET_PACKET.worksheet, dep_time: '17:50' },
        supersedes: { prior_conf_id: retId!, prior_message_id: 'msg-va1592-dweook' },
      },
      profiles,
    })
    assert.equal(updated.action, 'update')
    assert.equal(updated.block_id, retId)
    assert.equal(updated.next.flights.length, 2)
    assert.equal(updated.next.flights.find(f => f.kind === 'dep')?.dep_time, '09:10')
    assert.equal(updated.next.flights.find(f => f.kind === 'ret')?.dep_time, '17:50')
  })

  it('matches date+route+kind when confirmation and flight number are absent', () => {
    const first = mergeTravelBlocksFromPacket({
      existing: EMPTY_TRAVEL_BLOCKS,
      packet: DWEOOK_DEP_PACKET,
      profiles,
    })
    const second = mergeTravelBlocksFromPacket({
      existing: first.next,
      packet: {
        ...DWEOOK_DEP_PACKET,
        worksheet: {
          kind: 'dep',
          date: '2026-09-16',
          from: 'MEL',
          to: 'NTL',
          dep_time: '09:40',
        },
        supersedes: { prior_conf_id: null, prior_message_id: null },
      },
      profiles,
    })
    assert.equal(second.action, 'update')
    assert.equal(second.next.flights.length, 1)
    assert.equal(second.block_id, first.block_id)
    assert.equal(second.next.flights[0]?.dep_time, '09:40')
    assert.equal(second.next.flights[0]?.confirmation, 'DWEOOK')
    assert.equal(second.next.flights[0]?.flight_number, 'VA1595')
  })

  it('fills a blank-conf return via date/route/number+kind, not the dep card', () => {
    const dep = mergeTravelBlocksFromPacket({
      existing: EMPTY_TRAVEL_BLOCKS,
      packet: DWEOOK_DEP_PACKET,
      profiles,
    })
    const retBlank = mergeTravelBlocksFromPacket({
      existing: dep.next,
      packet: {
        ...DWEOOK_RET_PACKET,
        worksheet: { ...DWEOOK_RET_PACKET.worksheet, confirmation: '' },
        supersedes: { prior_conf_id: null, prior_message_id: null },
      },
      profiles,
    })
    assert.equal(retBlank.next.flights.length, 2)
    assert.equal(retBlank.next.flights.find(f => f.kind === 'ret')?.confirmation, '')

    const retFilled = mergeTravelBlocksFromPacket({
      existing: retBlank.next,
      packet: DWEOOK_RET_PACKET,
      profiles,
    })
    assert.equal(retFilled.action, 'update')
    assert.equal(retFilled.next.flights.length, 2)
    const depBlock = retFilled.next.flights.find(f => f.kind === 'dep')
    const retBlock = retFilled.next.flights.find(f => f.kind === 'ret')
    assert.equal(retBlock?.id, retBlank.next.flights.find(f => f.kind === 'ret')?.id)
    assert.equal(retBlock?.confirmation, 'DWEOOK')
    assert.equal(depBlock?.confirmation, 'DWEOOK')
    assert.equal(depBlock?.flight_number, 'VA1595')
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
    assert.equal(plan.money.money_entry_id, null)
    assert.equal(plan.money.city_night_key, 'TE-91718')
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

const PORT_MACQUARIE_PACKET = {
  ...THORNTON_SCRAPE_PACKET,
  worksheet: {
    ...THORNTON_SCRAPE_PACKET.worksheet,
    name: "Port O'Call",
    city: 'Port Macquarie',
    check_in_date: '2026-09-19',
    check_out_date: '2026-09-20',
    confirmation: 'POC-1920',
  },
  money: { ...THORNTON_SCRAPE_PACKET.money, amount: 245 },
  checklist: {
    items_to_tick: ['hotel_confirmed'],
    source_note: "from Port O'Call email 19/09/26 · conf POC-1920",
    partial_names: false,
  },
}

const PORT_MACQUARIE_GLANCE_PACKET = {
  ...PORT_MACQUARIE_PACKET,
  worksheet: {
    name: "Port O'Call",
    address: '1 Park St, Port Macquarie NSW 2444',
    check_in: '2026-09-19T14:00',
    check_out: '2026-09-20',
    rooms: 1,
    conf: 'POC-GLANCE',
    city_night_key: 'PortMacquarie_2026-09-19',
  },
  checklist: {
    items_to_tick: ['hotel_confirmed'],
    source_note: '',
    partial_names: false,
  },
}

describe('accom_night money: one field, one charge per night', () => {
  it('writes two hotels onto the same accommodation field as two night entries', () => {
    assert.equal(LINE_HINT_TO_FIELD_KEY.accom_night, 'accommodation')
    const first = planTravelScrapeMoney({
      packet: THORNTON_SCRAPE_PACKET,
      existingEntries: [],
      confirm: { confirmMoney: true, moneyConfirmedBy: 'Gareth' },
    })
    const second = planTravelScrapeMoney({
      packet: TAMWORTH_SCRAPE_PACKET,
      existingEntries: first.next_entries,
      confirm: { confirmMoney: true, moneyConfirmedBy: 'Gareth' },
    })
    assert.equal(first.field_key, 'accommodation')
    assert.equal(second.field_key, first.field_key)
    assert.equal(second.next_entries.length, 2)
    assert.deepEqual(
      second.next_entries.map(e => e.night_date).sort(),
      ['2026-09-17', '2026-09-18'],
    )
    assert.deepEqual(
      second.next_entries.map(e => e.confirmation_id).sort(),
      ['TE-91718', 'TH-1819'],
    )
  })

  it('re-applying the same night with a different city/conf updates one entry', () => {
    const parsedGlance = parseTravelScrapePacket(THORNTON_GLANCE_PACKET)
    assert.equal(parsedGlance.ok, true, parsedGlance.ok ? '' : parsedGlance.error)
    if (!parsedGlance.ok) return

    const demo = planTravelScrapeMoney({
      packet: THORNTON_SCRAPE_PACKET,
      existingEntries: [],
      confirm: { confirmMoney: true },
    })
    const glance = planTravelScrapeMoney({
      packet: parsedGlance.packet,
      existingEntries: demo.next_entries,
      confirm: { confirmMoney: true },
    })
    assert.equal(glance.next_entries.length, 1)
    assert.equal(glance.next_entries[0]?.id, demo.next_entries[0]?.id)
    assert.equal(glance.next_entries[0]?.night_date, '2026-09-17')
    assert.equal(glance.next_entries[0]?.city, 'Maitland')
    assert.equal(glance.next_entries[0]?.confirmation_id, '6031616996')
    assert.equal(glance.field_key, 'accommodation')
  })

  it('soft-matches Port Macquarie vs PortMacquarie city_night_key on the same night', () => {
    assert.equal(normalizeAccomMoneyCity('Port Macquarie'), 'portmacquarie')
    assert.equal(normalizeAccomMoneyCity('PortMacquarie'), 'portmacquarie')
    const parsedDemo = parseTravelScrapePacket(PORT_MACQUARIE_PACKET)
    const parsedGlance = parseTravelScrapePacket(PORT_MACQUARIE_GLANCE_PACKET)
    assert.equal(parsedDemo.ok, true, parsedDemo.ok ? '' : parsedDemo.error)
    assert.equal(parsedGlance.ok, true, parsedGlance.ok ? '' : parsedGlance.error)
    if (!parsedDemo.ok || !parsedGlance.ok) return

    const first = planTravelScrapeMoney({
      packet: parsedDemo.packet,
      existingEntries: [],
      confirm: { confirmMoney: true },
    })
    const second = planTravelScrapeMoney({
      packet: parsedGlance.packet,
      existingEntries: first.next_entries,
      confirm: { confirmMoney: true },
    })
    assert.equal(first.next_entries[0]?.city, 'Port Macquarie')
    assert.equal(second.next_entries.length, 1)
    assert.equal(second.next_entries[0]?.id, first.next_entries[0]?.id)
    assert.equal(second.next_entries[0]?.night_date, '2026-09-19')
    assert.equal(normalizeAccomMoneyCity(second.next_entries[0]?.city), 'portmacquarie')
    assert.equal(second.next_entries[0]?.confirmation_id, 'POC-GLANCE')
  })

  it('updates by confirmation_id even when city/night labels differ', () => {
    const first = planTravelScrapeMoney({
      packet: THORNTON_SCRAPE_PACKET,
      existingEntries: [],
      confirm: { confirmMoney: true },
    })
    const sameConf = {
      ...THORNTON_SCRAPE_PACKET,
      money: { ...THORNTON_SCRAPE_PACKET.money, amount: 230 },
      worksheet: { ...THORNTON_SCRAPE_PACKET.worksheet, city: 'Newcastle' },
    }
    const updated = planTravelScrapeMoney({
      packet: sameConf,
      existingEntries: first.next_entries,
      confirm: { confirmMoney: true },
    })
    assert.equal(updated.next_entries.length, 1)
    assert.equal(updated.next_entries[0]?.id, first.next_entries[0]?.id)
    assert.equal(updated.next_entries[0]?.confirmation_id, 'TE-91718')
    assert.equal(updated.next_entries[0]?.amount, 230)
    assert.equal(updated.next_entries[0]?.city, 'Newcastle')
  })

  it('updates via supersedes.prior_conf_id then keeps one night charge', () => {
    const first = planTravelScrapeMoney({
      packet: THORNTON_SCRAPE_PACKET,
      existingEntries: [],
      confirm: { confirmMoney: true },
    })
    const revised = {
      ...THORNTON_SCRAPE_PACKET,
      money: { ...THORNTON_SCRAPE_PACKET.money, amount: 199 },
      worksheet: { ...THORNTON_SCRAPE_PACKET.worksheet, confirmation: 'TE-91718-R2', city: 'Maitland' },
      supersedes: { prior_conf_id: 'TE-91718', prior_message_id: 'msg-te-91718' },
    }
    const updated = planTravelScrapeMoney({
      packet: revised,
      existingEntries: first.next_entries,
      confirm: { confirmMoney: true },
    })
    assert.equal(updated.next_entries.length, 1)
    assert.equal(updated.next_entries[0]?.id, first.next_entries[0]?.id)
    assert.equal(updated.next_entries[0]?.confirmation_id, 'TE-91718-R2')
    assert.equal(updated.next_entries[0]?.amount, 199)
  })

  it('collapses leftover demo + glance charges on the same night and leaves refunds', () => {
    const demo = planTravelScrapeMoney({
      packet: THORNTON_SCRAPE_PACKET,
      existingEntries: [],
      confirm: { confirmMoney: true },
    })
    const leftover = [
      ...demo.next_entries,
      {
        ...demo.next_entries[0]!,
        id: 'dup-glance',
        city: 'Maitland',
        confirmation_id: '6031616996',
        amount: 214,
      },
      {
        id: 'refund-17',
        description: 'Refund — Thornton — 17/09/26',
        notes: '',
        amount: -50,
        gst_included: true,
        confirmed: true,
        paid: true,
        night_date: '2026-09-17',
        city: 'Thornton',
        vendor: 'Thornton Executive',
        confirmation_id: 'TE-91718',
        receipt_kind: 'refund' as const,
      },
    ]
    const parsedGlance = parseTravelScrapePacket(THORNTON_GLANCE_PACKET)
    assert.equal(parsedGlance.ok, true)
    if (!parsedGlance.ok) return
    const collapsed = planTravelScrapeMoney({
      packet: parsedGlance.packet,
      existingEntries: leftover,
      confirm: { confirmMoney: true },
    })
    const charges = collapsed.next_entries.filter(e => e.receipt_kind !== 'refund')
    const refunds = collapsed.next_entries.filter(e => e.receipt_kind === 'refund')
    assert.equal(charges.length, 1)
    assert.equal(charges[0]?.night_date, '2026-09-17')
    assert.equal(charges[0]?.confirmation_id, '6031616996')
    assert.equal(refunds.length, 1)
    assert.equal(refunds[0]?.id, 'refund-17')
    assert.equal(refunds[0]?.amount, -50)
  })

  it('finds the prior charge by confirmation, then night, never a refund', () => {
    const refund = {
      id: 'r1',
      description: 'Refund',
      notes: '',
      amount: -214,
      gst_included: true,
      confirmed: true,
      paid: true,
      night_date: '2026-09-17',
      city: 'Thornton',
      confirmation_id: 'TE-91718',
      receipt_kind: 'refund' as const,
    }
    const charge = {
      id: 'c1',
      description: 'Thornton — 2026-09-17',
      notes: '',
      amount: 214,
      gst_included: true,
      confirmed: true,
      paid: true,
      night_date: '2026-09-17',
      city: 'Thornton',
      confirmation_id: 'TE-91718',
      receipt_kind: 'charge' as const,
    }
    assert.equal(
      findAccomNightMoneyEntry({
        existing: [refund, charge],
        confirmation: 'TE-91718',
        night: '2026-09-17',
        city: 'Maitland',
      })?.id,
      'c1',
    )
    assert.equal(
      findAccomNightMoneyEntry({
        existing: [refund, charge],
        confirmation: 'other',
        priorConfId: 'TE-91718',
        night: '2026-09-17',
        city: 'Maitland',
      })?.id,
      'c1',
    )
    assert.equal(
      findAccomNightMoneyEntry({
        existing: [refund, { ...charge, confirmation_id: 'old' }],
        confirmation: 'new-glance',
        night: '2026-09-17',
        city: 'Maitland',
      })?.id,
      'c1',
    )
  })
})

describe('accom_night money: per-night identity', () => {
  const confirm = { confirmMoney: true, moneyConfirmedBy: 'Gareth' } as const

  it('formats city_night_key as confirmation, else city:night', () => {
    assert.equal(
      formatTravelScrapeCityNightKey({ confirmation: 'TE-91718', city: 'Maitland', night: '2026-09-17' }),
      'TE-91718',
    )
    assert.equal(
      formatTravelScrapeCityNightKey({ confirmation: '', city: 'Maitland', night: '2026-09-17' }),
      'maitland:2026-09-17',
    )
    assert.equal(
      formatTravelScrapeCityNightKey({ city: 'Port Macquarie', night: '2026-09-19' }),
      'portmacquarie:2026-09-19',
    )
  })

  it('three sequential accom_night confirms: one field, three distinct entry ids, totals sum', () => {
    const first = planTravelScrapeMoney({
      packet: THORNTON_SCRAPE_PACKET,
      existingEntries: [],
      confirm,
    })
    const second = planTravelScrapeMoney({
      packet: TAMWORTH_SCRAPE_PACKET,
      existingEntries: first.next_entries,
      confirm,
    })
    const third = planTravelScrapeMoney({
      packet: PORT_MACQUARIE_PACKET,
      existingEntries: second.next_entries,
      confirm,
    })

    assert.equal(first.field_key, 'accommodation')
    assert.equal(second.field_key, 'accommodation')
    assert.equal(third.field_key, 'accommodation')
    assert.equal(LINE_HINT_TO_FIELD_KEY.accom_night, 'accommodation')
    assert.equal(third.next_entries.length, 3)

    const entryIds = [first.money_entry_id, second.money_entry_id, third.money_entry_id]
    assert.ok(entryIds.every(id => typeof id === 'string' && id.length > 0))
    assert.equal(new Set(entryIds).size, 3)
    assert.deepEqual(
      third.next_entries.map(e => e.id).sort(),
      [...entryIds].sort(),
    )
    assert.equal(third.field_value, 214 + 189 + 245)
    assert.equal(third.next_entries.reduce((sum, e) => sum + e.amount, 0), 214 + 189 + 245)
    assert.deepEqual(
      third.next_entries.map(e => e.confirmation_id).sort(),
      ['POC-1920', 'TE-91718', 'TH-1819'],
    )
    assert.equal(first.city_night_key, 'TE-91718')
    assert.equal(second.city_night_key, 'TH-1819')
    assert.equal(third.city_night_key, 'POC-1920')

    const applyMoney = formatTravelScrapeApplyMoneyResponse({
      plan: third,
      moneyFieldId: 'shared-accommodation-row',
    })
    assert.equal(applyMoney.money_field_id, 'shared-accommodation-row')
    assert.equal(applyMoney.field_id, applyMoney.money_field_id)
    assert.equal(applyMoney.money_entry_id, third.money_entry_id)
    assert.equal(applyMoney.city_night_key, 'POC-1920')
    assert.notEqual(applyMoney.money_entry_id, first.money_entry_id)
    assert.notEqual(applyMoney.money_entry_id, second.money_entry_id)
  })

  it('second POST same confirmation updates that entry only', () => {
    const first = planTravelScrapeMoney({
      packet: THORNTON_SCRAPE_PACKET,
      existingEntries: [],
      confirm,
    })
    const second = planTravelScrapeMoney({
      packet: TAMWORTH_SCRAPE_PACKET,
      existingEntries: first.next_entries,
      confirm,
    })
    const third = planTravelScrapeMoney({
      packet: PORT_MACQUARIE_PACKET,
      existingEntries: second.next_entries,
      confirm,
    })
    const updated = planTravelScrapeMoney({
      packet: {
        ...THORNTON_SCRAPE_PACKET,
        money: { ...THORNTON_SCRAPE_PACKET.money, amount: 250 },
      },
      existingEntries: third.next_entries,
      confirm,
    })

    assert.equal(updated.next_entries.length, 3)
    assert.equal(updated.money_entry_id, first.money_entry_id)
    assert.equal(updated.city_night_key, 'TE-91718')
    const thornton = updated.next_entries.find(e => e.id === first.money_entry_id)
    const tamworth = updated.next_entries.find(e => e.id === second.money_entry_id)
    const port = updated.next_entries.find(e => e.id === third.money_entry_id)
    assert.equal(thornton?.amount, 250)
    assert.equal(tamworth?.amount, 189)
    assert.equal(port?.amount, 245)
    assert.equal(updated.field_value, 250 + 189 + 245)
  })

  it('PAID on one entry does not clear others', () => {
    const confirmed = {
      ...THORNTON_SCRAPE_PACKET.money,
      status_if_applied: 'CONFIRMED' as const,
    }
    const first = planTravelScrapeMoney({
      packet: { ...THORNTON_SCRAPE_PACKET, money: confirmed },
      existingEntries: [],
      confirm,
    })
    const second = planTravelScrapeMoney({
      packet: {
        ...TAMWORTH_SCRAPE_PACKET,
        money: { ...TAMWORTH_SCRAPE_PACKET.money, status_if_applied: 'CONFIRMED' },
      },
      existingEntries: first.next_entries,
      confirm,
    })
    const third = planTravelScrapeMoney({
      packet: {
        ...PORT_MACQUARIE_PACKET,
        money: { ...PORT_MACQUARIE_PACKET.money, status_if_applied: 'CONFIRMED' },
      },
      existingEntries: second.next_entries,
      confirm,
    })
    assert.equal(third.next_entries.every(e => e.paid === false), true)
    assert.equal(third.next_entries.every(e => e.confirmed === true), true)

    const paidSecond = planTravelScrapeMoney({
      packet: TAMWORTH_SCRAPE_PACKET,
      existingEntries: third.next_entries,
      confirm,
    })
    assert.equal(paidSecond.next_entries.length, 3)
    assert.equal(paidSecond.money_entry_id, second.money_entry_id)
    const thornton = paidSecond.next_entries.find(e => e.id === first.money_entry_id)
    const tamworth = paidSecond.next_entries.find(e => e.id === second.money_entry_id)
    const port = paidSecond.next_entries.find(e => e.id === third.money_entry_id)
    assert.equal(thornton?.paid, false)
    assert.equal(thornton?.confirmed, true)
    assert.equal(tamworth?.paid, true)
    assert.equal(tamworth?.confirmed, true)
    assert.equal(port?.paid, false)
    assert.equal(port?.confirmed, true)
    assert.equal(paidSecond.field_value, 214 + 189 + 245)
  })

  it('falls back to city:night when confirmation is absent', () => {
    const packet = {
      ...THORNTON_SCRAPE_PACKET,
      worksheet: { ...THORNTON_SCRAPE_PACKET.worksheet, confirmation: '', city: 'Maitland' },
      supersedes: { prior_conf_id: null, prior_message_id: null },
    }
    const plan = planTravelScrapeMoney({
      packet,
      existingEntries: [],
      confirm,
    })
    assert.equal(plan.city_night_key, 'maitland:2026-09-17')
    assert.ok(plan.money_entry_id)
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

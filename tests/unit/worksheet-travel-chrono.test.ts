import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  emptyCarBlock,
  emptyFerryBlock,
  emptyFlightBlock,
  emptyHotelBlock,
  emptyTransferBlock,
  EMPTY_TRAVEL_BLOCKS,
} from '../../lib/worksheet-travel-blocks.ts'
import {
  buildWorksheetChrono,
  parseChronoTime,
  type ChronoShowInput,
} from '../../lib/worksheet-travel-chrono.ts'

const profiles = [
  { id: '11111111-1111-4111-8111-111111111111', full_name: 'Gareth Hill', nickname: 'Gaz' },
]

function labelsOf(kind: string, model: ReturnType<typeof buildWorksheetChrono>) {
  const event = model.days.flatMap(day => day.events).find(row => row.kind === kind)
  return event?.fields.map(field => field.label) ?? []
}

describe('parseChronoTime', () => {
  it('parses 24-hour and worksheet am/pm call times', () => {
    assert.equal(parseChronoTime('06:30'), '06:30')
    assert.equal(parseChronoTime('6:30:00'), '06:30')
    assert.equal(parseChronoTime('1:00pm'), '13:00')
    assert.equal(parseChronoTime('7:30 pm'), '19:30')
    assert.equal(parseChronoTime('12:00am'), '00:00')
    assert.equal(parseChronoTime(''), null)
    assert.equal(parseChronoTime('after lunch'), null)
  })
})

describe('worksheet chrono itinerary', () => {
  it('mixes Alice Springs then Darwin in date/time order', () => {
    const model = buildWorksheetChrono({
      run: { name: '26R04', code: '26R04', regionLabel: 'Group 2 · Fly + Van' },
      profiles,
      blocks: {
        ...EMPTY_TRAVEL_BLOCKS,
        flights: [{
          ...emptyFlightBlock('mid', 'flight-asp-drw'),
          flight_number: 'QF1',
          date: '2027-03-03',
          from: 'ASP',
          to: 'DRW',
          dep_time: '11:00',
          arr_time: '13:00',
          airline: '',
        }],
        cars: [
          {
            ...emptyCarBlock('car-alice-1'),
            provider: 'Avis Alice 1',
            pickup_location: 'Alice Springs airport',
            pickup_date: '2027-03-01',
            pickup_time: '09:00',
            return_location: 'Alice Springs airport',
            return_date: '2027-03-03',
            return_time: '09:00',
            notes: 'Bay 4',
          },
          {
            ...emptyCarBlock('car-alice-2'),
            provider: 'Avis Alice 2',
            pickup_location: 'Alice Springs airport',
            pickup_date: '2027-03-01',
            pickup_time: '09:00',
            return_date: '2027-03-03',
            return_time: '09:30',
            return_location: 'Alice Springs airport',
          },
          {
            ...emptyCarBlock('car-darwin-1'),
            provider: 'Hertz Darwin',
            pickup_location: 'Darwin airport',
            pickup_date: '2027-03-03',
            pickup_time: '14:00',
            return_location: 'Darwin airport',
            return_date: '2027-03-04',
            return_time: '10:00',
          },
        ],
        hotels: [{
          ...emptyHotelBlock('hotel-alice'),
          name: 'Alice Springs Hotel',
          check_in_date: '2027-03-01',
          check_in_time: '15:00',
          check_out_date: '2027-03-03',
          check_out_time: '10:00',
          eta_notes: 'Early check-in if the room is ready',
          pin: '4321',
          guests: [{ profile_id: profiles[0].id, name: '' }],
        }],
      },
      shows: [
        show({
          id: 'show-alice',
          venue_name: 'Araluen',
          venue_city: 'Alice Springs',
          show_date: '2027-03-02',
          show_order: 1,
          sched_show: '7:30pm',
          travel_access_notes: 'Load-in via side door',
        }),
        show({
          id: 'show-darwin',
          venue_name: 'Darwin Entertainment Centre',
          venue_city: 'Darwin',
          show_date: '2027-03-04',
          show_order: 2,
          sched_show: '7:30pm',
        }),
      ],
    })

    const order = model.days.flatMap(day => day.events.map(event => `${event.date} ${event.timeLabel ?? ''} ${event.kind} ${event.title}`))
    assert.deepEqual(order, [
      '2027-03-01 09:00 car-pickup Avis Alice 1 · Alice Springs airport',
      '2027-03-01 09:00 car-pickup Avis Alice 2 · Alice Springs airport',
      '2027-03-01 15:00 hotel-check-in Alice Springs Hotel',
      '2027-03-02 7:30pm show Araluen',
      '2027-03-03 09:00 car-return Avis Alice 1 · Alice Springs airport',
      '2027-03-03 09:30 car-return Avis Alice 2 · Alice Springs airport',
      '2027-03-03 10:00 hotel-check-out Alice Springs Hotel',
      '2027-03-03 11:00 flight-depart QF1 · ASP → DRW',
      '2027-03-03 13:00 flight-arrive QF1 · DRW',
      '2027-03-03 14:00 car-pickup Hertz Darwin · Darwin airport',
      '2027-03-04 10:00 car-return Hertz Darwin · Darwin airport',
      '2027-03-04 7:30pm show Darwin Entertainment Centre',
    ])

    const pickup = model.days.flatMap(day => day.events).find(event => event.id === 'car-pickup:car-alice-1')
    const returned = model.days.flatMap(day => day.events).find(event => event.id === 'car-return:car-alice-1')
    assert.equal(pickup?.fields.find(field => field.label === 'Notes')?.value, 'Bay 4')
    assert.equal(returned?.fields.some(field => field.label === 'Notes'), false)

    const checkIn = model.days.flatMap(day => day.events).find(event => event.kind === 'hotel-check-in')
    const checkOut = model.days.flatMap(day => day.events).find(event => event.kind === 'hotel-check-out')
    assert.equal(checkIn?.fields.find(field => field.label === 'ETA / notes')?.value, 'Early check-in if the room is ready')
    assert.equal(checkOut?.fields.some(field => field.label === 'ETA / notes'), false)
    assert.equal(JSON.stringify(model).includes('4321'), false)
    assert.equal(JSON.stringify(model).includes('PIN'), false)

    const aliceShow = model.days.flatMap(day => day.events).find(event => event.id === 'show:show-alice')
    assert.equal(aliceShow?.fields.find(field => field.label === 'Notes')?.value, 'Load-in via side door')
    assert.equal(aliceShow?.fields.some(field => field.label === 'Access'), false)

    assert.equal(model.header.runName, '26R04')
    assert.equal(model.header.region, 'Group 2 · Fly + Van')
    assert.equal(model.header.people, 'Gareth Hill (Gaz)')
    assert.deepEqual(model.header.venues, ['Araluen', 'Darwin Entertainment Centre'])
    assert.equal(model.header.dateStart, '2027-03-01')
    assert.equal(model.header.dateEnd, '2027-03-04')
  })

  it('tie-breaks a same-morning flight ahead of a car pickup', () => {
    const model = buildWorksheetChrono({
      run: { name: 'Tie', code: 'T1', regionLabel: 'Group 2 · Fly + Van' },
      blocks: {
        ...EMPTY_TRAVEL_BLOCKS,
        flights: [{
          ...emptyFlightBlock('dep', 'flight-tie'),
          flight_number: 'QF9',
          date: '2027-04-01',
          dep_time: '08:00',
          from: 'SYD',
          to: 'ASP',
        }],
        cars: [{
          ...emptyCarBlock('car-tie'),
          provider: 'Avis',
          pickup_date: '2027-04-01',
          pickup_time: '08:00',
          pickup_location: 'Airport',
        }],
      },
    })
    assert.deepEqual(
      model.days[0].events.map(event => event.kind),
      ['flight-depart', 'car-pickup'],
    )
  })

  it('does not invent an overnight arrival date', () => {
    const model = buildWorksheetChrono({
      run: { name: 'Night', code: 'N1' },
      blocks: {
        ...EMPTY_TRAVEL_BLOCKS,
        flights: [{
          ...emptyFlightBlock('dep', 'red-eye'),
          flight_number: 'QF400',
          date: '2027-04-02',
          dep_time: '22:00',
          arr_time: '01:00',
          from: 'PER',
          to: 'SYD',
        }],
      },
    })
    const events = model.days.flatMap(day => day.events)
    assert.deepEqual(events.map(event => event.kind), ['flight-depart'])
    assert.equal(events[0].date, '2027-04-02')
    assert.equal(events[0].fields.find(field => field.label === 'Arr')?.value, '01:00')
    assert.equal(model.days.some(day => day.date === '2027-04-03'), false)
  })

  it('omits blank labels and drops empty cards', () => {
    const model = buildWorksheetChrono({
      run: { name: '', code: '', regionLabel: '', synopsis: '   ' },
      blocks: {
        ...EMPTY_TRAVEL_BLOCKS,
        flights: [
          emptyFlightBlock('dep', 'blank-flight'),
          {
            ...emptyFlightBlock('dep', 'partial-flight'),
            flight_number: 'QF441',
            date: '2027-05-01',
            dep_time: '06:30',
            from: 'SYD',
            to: 'BHQ',
            airline: '',
            confirmation: '',
          },
        ],
        transfers: [{
          ...emptyTransferBlock('transfer-1'),
          date: '2027-05-01',
          time: '07:00',
          from: 'Hotel',
          to: 'Airport',
          amount: null,
          notes: '',
        }],
      },
    })
    assert.equal(labelsOf('flight-depart', model).includes('Airline'), false)
    assert.equal(labelsOf('flight-depart', model).includes('Conf / PNR'), false)
    assert.equal(labelsOf('transfer', model).includes('Amount'), false)
    assert.equal(labelsOf('transfer', model).includes('Notes'), false)
    assert.equal(model.days.flatMap(day => day.events).some(event => event.sourceId === 'blank-flight'), false)
    const pinOnly = buildWorksheetChrono({
      run: { name: 'Pin', code: 'P1' },
      blocks: {
        ...EMPTY_TRAVEL_BLOCKS,
        hotels: [{
          ...emptyHotelBlock('pin-hotel'),
          name: 'Quiet Inn',
          pin: '9999',
          eta_notes: '',
        }],
      },
    })
    assert.equal(pinOnly.days[0].events[0].kind, 'hotel-stay')
    assert.equal(JSON.stringify(pinOnly).includes('9999'), false)
    assert.equal(JSON.stringify(pinOnly).includes('"PIN"'), false)

    assert.equal(model.header.runName, '')
    assert.equal(model.header.people, '')
    assert.equal(model.header.region, '')
    assert.equal(model.header.synopsis, '')
    assert.deepEqual(model.header.venues, [])
    assert.deepEqual(model.header.notes, [])
  })

  it('keeps a stored transfer amount and leaves ferries undated', () => {
    const model = buildWorksheetChrono({
      run: { name: 'Ferry', code: 'F1', regionLabel: 'Group 1 · Self-drive' },
      blocks: {
        ...EMPTY_TRAVEL_BLOCKS,
        transfers: [{
          ...emptyTransferBlock('uber'),
          date: '2027-06-01',
          time: '18:00',
          from: 'Venue',
          to: 'Hotel',
          amount: 42.5,
          notes: 'Driver will text',
        }],
        ferries: [{
          ...emptyFerryBlock('sea'),
          operator: 'Sealink',
          dep_port: 'Circular Quay',
          arr_port: 'Manly',
          dep_time: '09:15',
          confirmation: '',
        }],
      },
      shows: [show({
        id: 'show-1',
        venue_name: 'Enmore',
        show_date: '2027-06-01',
        show_order: 1,
      })],
    })
    const transfer = model.days.flatMap(day => day.events).find(event => event.kind === 'transfer')
    assert.equal(transfer?.fields.find(field => field.label === 'Amount')?.value, '42.5')
    assert.equal(transfer?.fields.find(field => field.label === 'Notes')?.value, 'Driver will text')
    const ferryDay = model.days.find(day => day.date == null)
    assert.ok(ferryDay)
    assert.equal(ferryDay?.heading, 'Date not set')
    assert.equal(ferryDay?.events[0].kind, 'ferry')
    assert.equal(ferryDay?.events[0].fields.some(field => field.label === 'Conf #'), false)
    assert.equal(model.days[0].date, '2027-06-01')
    assert.equal(model.header.notes.length, 0)
  })

  it('sorts a dateless call-time show after timed travel that day and skips schedule defaults', () => {
    const model = buildWorksheetChrono({
      run: {
        name: 'Show day',
        code: 'S1',
        regionLabel: 'Group 3 · Fly + Local Backline',
        synopsis: 'Two cities',
      },
      legacyNotes: { flights_notes: '', vehicles_notes: 'Van is the white HiAce', hotels_overview_notes: '  ' },
      blocks: {
        ...EMPTY_TRAVEL_BLOCKS,
        cars: [{
          ...emptyCarBlock('morning-car'),
          provider: 'Budget',
          pickup_date: '2027-07-01',
          pickup_time: '08:00',
          pickup_location: 'Airport',
        }],
      },
      shows: [show({
        id: 'bare-show',
        venue_name: 'Town Hall',
        venue_city: 'Bendigo',
        show_date: '2027-07-01',
        show_order: 1,
        sched_access: null,
        sched_show: null,
      })],
    })
    assert.deepEqual(
      model.days[0].events.map(event => event.kind),
      ['car-pickup', 'show'],
    )
    const showEvent = model.days[0].events[1]
    assert.equal(showEvent.timeLabel, null)
    assert.equal(JSON.stringify(showEvent).includes('1:00pm'), false)
    assert.equal(JSON.stringify(showEvent).includes('7:30pm'), false)
    assert.equal(model.header.notes.map(note => note.label).join(','), 'Cars notes')
    assert.equal(model.header.synopsis, 'Two cities')
    assert.equal(model.header.dateSpan.includes('2027') || model.header.dateSpan.includes('Jul'), true)
  })
})

function show(partial: Partial<ChronoShowInput> & Pick<ChronoShowInput, 'id' | 'venue_name' | 'show_date' | 'show_order'>): ChronoShowInput {
  return {
    venue_city: '',
    state_territory: null,
    capacity: null,
    sets_label: null,
    venue_address: null,
    venue_phone: null,
    venue_contact: null,
    sched_access: null,
    sched_soundcheck: null,
    sched_dinner: null,
    sched_doors: null,
    sched_show: null,
    sched_finish: null,
    travel_access_notes: null,
    hotel_notes: null,
    hospitality_merch_notes: null,
    michael_notes: null,
    ...partial,
  }
}

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  canExposeHotelPin,
  carHandoutFields,
  emptyCarBlock,
  emptyFerryBlock,
  emptyFlightBlock,
  emptyHotelBlock,
  emptyTransferBlock,
  EMPTY_TRAVEL_BLOCKS,
  ferryHandoutFields,
  flightHandoutFields,
  formatTravelPeople,
  formatWorksheetTravelBlocksAuditCopy,
  hotelHandoutFields,
  isBlankTravelValue,
  isCarBlockComplete,
  isFlightBlockComplete,
  isHotelBlockComplete,
  mergeHotelPinsPreservingHidden,
  omitBlankTravelFields,
  parseTravelBlocks,
  redactHotelPins,
  redactTravelBlocksForRole,
  sanitizeTravelBlocks,
  sortFlightBlocks,
  transferHandoutFields,
} from '../../lib/worksheet-travel-blocks.ts'

const profiles = [
  { id: '11111111-1111-4111-8111-111111111111', full_name: 'Gareth Hill', nickname: 'Gaz' },
  { id: '22222222-2222-4222-8222-222222222222', full_name: 'Michael', nickname: null },
]

function completeFlight() {
  return {
    ...emptyFlightBlock('dep', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
    flight_number: 'QF441',
    date: '2027-02-10',
    dep_time: '06:30',
    from: 'SYD',
    to: 'BHQ',
    travellers: [{ profile_id: profiles[0].id, name: 'Gareth Hill' }],
  }
}

function completeCar() {
  return {
    ...emptyCarBlock('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
    provider: 'Avis',
    pickup_location: 'Broken Hill airport',
    pickup_date: '2027-02-10',
    pickup_time: '08:00',
    return_location: 'Adelaide airport',
    return_date: '2027-02-13',
    return_time: '16:00',
    confirmation: 'AVI-99',
  }
}

function completeHotel() {
  return {
    ...emptyHotelBlock('cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
    name: 'Palace Hotel',
    check_in_date: '2027-02-10',
    check_out_date: '2027-02-11',
    rooms: 3,
    guests: [{ profile_id: null, name: 'Nigel' }],
    pin: '1234',
  }
}

describe('worksheet travel completeness', () => {
  it('marks a flight incomplete until required fields and a traveller are set', () => {
    const blank = emptyFlightBlock('dep')
    assert.equal(isFlightBlockComplete(blank), false)
    assert.equal(isFlightBlockComplete({
      ...completeFlight(),
      travellers: [],
    }), false)
    assert.equal(isFlightBlockComplete({
      ...completeFlight(),
      dep_time: '  ',
    }), false)
    assert.equal(isFlightBlockComplete(completeFlight()), true)
  })

  it('marks a car complete only with provider, pickup loc+time, return loc+time, and conf #', () => {
    assert.equal(isCarBlockComplete(emptyCarBlock()), false)
    assert.equal(isCarBlockComplete({ ...completeCar(), confirmation: '' }), false)
    assert.equal(isCarBlockComplete({ ...completeCar(), pickup_time: '' }), false)
    assert.equal(isCarBlockComplete({ ...completeCar(), vehicle_class: '' }), true)
  })

  it('marks a hotel complete with guests or explicit TBC guests', () => {
    assert.equal(isHotelBlockComplete(emptyHotelBlock()), false)
    assert.equal(isHotelBlockComplete({ ...completeHotel(), guests: [], guests_tbc: false }), false)
    assert.equal(isHotelBlockComplete({ ...completeHotel(), guests: [], guests_tbc: true }), true)
    assert.equal(isHotelBlockComplete({ ...completeHotel(), rooms: null }), false)
    assert.equal(isHotelBlockComplete(completeHotel()), true)
  })
})

describe('worksheet travel blank-omit', () => {
  it('treats empty string, whitespace, null, and empty arrays as blank', () => {
    assert.equal(isBlankTravelValue(''), true)
    assert.equal(isBlankTravelValue('   '), true)
    assert.equal(isBlankTravelValue(null), true)
    assert.equal(isBlankTravelValue([]), true)
    assert.equal(isBlankTravelValue(Number.NaN), true)
    assert.equal(isBlankTravelValue(0), false)
    assert.equal(isBlankTravelValue(false), false)
    assert.equal(isBlankTravelValue('QF441'), false)
    assert.equal(isBlankTravelValue(3), false)
  })

  it('omits blank values and their labels from handout fields', () => {
    const flight = {
      ...completeFlight(),
      airline: '',
      arr_time: '  ',
      airport_call: '',
      confirmation: 'ABC123',
    }
    const shown = omitBlankTravelFields(flightHandoutFields(flight, profiles))
    const labels = shown.map(row => row.label)
    assert.deepEqual(labels.includes('Airline'), false)
    assert.deepEqual(labels.includes('Arr'), false)
    assert.deepEqual(labels.includes('Airport call'), false)
    assert.ok(labels.includes('Flight #'))
    assert.ok(labels.includes('Conf / PNR'))
    assert.ok(labels.includes('Travellers'))
    assert.equal(shown.find(row => row.label === 'Travellers')?.value, 'Gareth Hill (Gaz)')
  })

  it('never includes hotel PIN on the default handout field list', () => {
    const shown = omitBlankTravelFields(hotelHandoutFields(completeHotel(), profiles))
    assert.equal(shown.some(row => row.label === 'PIN'), false)
    const withPin = hotelHandoutFields(completeHotel(), profiles, { includePin: true })
    assert.ok(withPin.some(row => row.label === 'PIN' && row.value === '1234'))
  })

  it('omits blank car condition labels and formats unlimited km', () => {
    const car = { ...completeCar(), fuel: '', e_tag: 'included', unlimited_km: true, notes: '' }
    const shown = omitBlankTravelFields(carHandoutFields(car))
    assert.equal(shown.some(row => row.label === 'Fuel'), false)
    assert.equal(shown.some(row => row.label === 'Notes'), false)
    assert.equal(shown.find(row => row.label === 'E-tag')?.value, 'included')
    assert.equal(shown.find(row => row.label === 'Unlimited km')?.value, 'Yes')
  })

  it('omits blank transfer and ferry labels', () => {
    const transfer = { ...emptyTransferBlock(), from: 'Hotel', to: 'Venue', amount: null, notes: '' }
    const ferry = { ...emptyFerryBlock(), operator: 'Sealink', confirmation: '' }
    const t = omitBlankTravelFields(transferHandoutFields(transfer))
    const f = omitBlankTravelFields(ferryHandoutFields(ferry))
    assert.deepEqual(t.map(row => row.label), ['From', 'To'])
    assert.deepEqual(f.map(row => row.label), ['Operator'])
  })

  it('shows TBC guests on hotel handout when flagged with no names', () => {
    const hotel = { ...completeHotel(), guests: [], guests_tbc: true }
    const shown = omitBlankTravelFields(hotelHandoutFields(hotel))
    assert.equal(shown.find(row => row.label === 'Guests')?.value, 'TBC guests')
  })
})

describe('worksheet travel sanitize + PIN', () => {
  it('parses junk as empty blocks and drops unknown keys', () => {
    assert.deepEqual(parseTravelBlocks(null), EMPTY_TRAVEL_BLOCKS)
    assert.deepEqual(parseTravelBlocks('nope'), EMPTY_TRAVEL_BLOCKS)
    const cleaned = sanitizeTravelBlocks({
      version: 99,
      flights: [{
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        kind: 'dep',
        flight_number: '  QF441  ',
        extra: 'drop me',
        travellers: [{ name: '  Nigel  ', profile_id: 'not-a-uuid' }],
      }],
      cost_fields: [{ id: 'never' }],
    })
    assert.equal(cleaned.version, 1)
    assert.equal(cleaned.flights[0].flight_number, 'QF441')
    assert.equal(cleaned.flights[0].travellers[0].profile_id, null)
    assert.equal(cleaned.flights[0].travellers[0].name, 'Nigel')
    assert.equal('extra' in cleaned.flights[0], false)
    assert.equal('cost_fields' in cleaned, false)
  })

  it('sorts flights Dep · Mid · Ret', () => {
    const sorted = sortFlightBlocks([
      { ...emptyFlightBlock('ret', 'r'), date: '2027-02-13' },
      { ...emptyFlightBlock('mid', 'm2'), date: '2027-02-12' },
      { ...emptyFlightBlock('dep', 'd'), date: '2027-02-10' },
      { ...emptyFlightBlock('mid', 'm1'), date: '2027-02-11' },
    ])
    assert.deepEqual(sorted.map(b => b.id), ['d', 'm1', 'm2', 'r'])
  })

  it('redacts hotel PIN except for admin/owner and preserves it on production writes', () => {
    const blocks = sanitizeTravelBlocks({ hotels: [completeHotel()] })
    assert.equal(canExposeHotelPin('admin'), true)
    assert.equal(canExposeHotelPin('owner'), true)
    assert.equal(canExposeHotelPin('production'), false)
    assert.equal(redactHotelPins(blocks).hotels[0].pin, '')
    assert.equal(redactTravelBlocksForRole(blocks, 'production').hotels[0].pin, '')
    assert.equal(redactTravelBlocksForRole(blocks, 'admin').hotels[0].pin, '1234')

    const incoming = sanitizeTravelBlocks({
      hotels: [{ ...completeHotel(), pin: '', address: 'Argent St' }],
    })
    const merged = mergeHotelPinsPreservingHidden(incoming, blocks, false)
    assert.equal(merged.hotels[0].pin, '1234')
    assert.equal(merged.hotels[0].address, 'Argent St')
    const exposed = mergeHotelPinsPreservingHidden(incoming, blocks, true)
    assert.equal(exposed.hotels[0].pin, '')
  })

  it('formats people with profile nicknames and unmatched free-text', () => {
    assert.equal(
      formatTravelPeople([
        { profile_id: profiles[0].id, name: '' },
        { profile_id: null, name: 'Dave the driver' },
      ], profiles),
      'Gareth Hill (Gaz), Dave the driver',
    )
  })

  it('writes an audit sentence without PIN or raw JSON', () => {
    const copy = formatWorksheetTravelBlocksAuditCopy({
      actorName: 'Gareth',
      runCode: 'R01',
      blocks: sanitizeTravelBlocks({
        flights: [completeFlight()],
        cars: [completeCar()],
        hotels: [completeHotel()],
      }),
    })
    assert.equal(copy.fieldName, 'Worksheet travel blocks')
    assert.match(copy.newValue, /Gareth updated Worksheet travel blocks on R01/)
    assert.match(copy.newValue, /1 flight/)
    assert.equal(copy.newValue.includes('1234'), false)
    assert.equal(copy.newValue.includes('pin'), false)
  })
})

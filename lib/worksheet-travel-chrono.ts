/**
 * Wave 2 — published Worksheet / Handout chronological itinerary.
 *
 * Edit view stays sectioned cards. This module only builds the band-facing
 * rundown: run header + one date/time-sorted list. Blank fields are dropped
 * with `omitBlankTravelFields` (labels included). Hotel PIN is never included.
 *
 * Open items (documented defaults, not a product ruling):
 *
 * 1. Same timestamp tie-break. When two events share a date and a clock time,
 *    order follows the chrono spec list, then source id:
 *    flight depart, flight arrive, car pickup, car return, car hire (no
 *    pickup/return moment), hotel check-in, hotel stay, hotel check-out,
 *    transfer, ferry, show. Example: a flight and a car pickup both at 08:00
 *    sort flight first. This is deterministic, not a claim about the real
 *    morning.
 *
 * 2. Show-day source. Each `shows` row is one Show event. Sort time is the
 *    earliest *stored* schedule value that parses (access, soundcheck, dinner,
 *    doors, show — not finish). Worksheet schedule defaults (1:00pm access and
 *    the rest) are not invented here. A show with a date and no parseable call
 *    time sorts after timed events that day. Venue, city, and stored schedule
 *    text come from the worksheet show row.
 *
 * 3. Ferry rows have no date column, so they stay in the undated group. Do not
 *    invent a sailing date. Print CSS is out of this wave.
 *
 * 4. Overnight flights. A separate Arrive row is emitted only when departure
 *    and arrival both parse and arrival is later the same date. If arrival
 *    clock time is earlier, the next calendar day is not invented; Arr stays
 *    on the departure row.
 *
 * 5. Notes. Card notes sit on the moment they belong to (car notes on pickup,
 *    hotel ETA on check-in, transfer notes on the transfer, show notes on the
 *    show). They are not collected into a bottom pile. Legacy run free-text
 *    (flights / cars / hotels overview) is run-level, so non-blank lines stay
 *    in the header. Show hotel notes stay on the show row — they are not
 *    matched to a hotel card.
 */

import { formatDateAU } from './dates.ts'
import { toIsoDateOnly } from './run-dates.ts'
import {
  ferryHandoutFields,
  flightHandoutFields,
  formatTravelPeople,
  hasTravelText,
  hotelHandoutFields,
  omitBlankTravelFields,
  resolveTravelPersonName,
  transferHandoutFields,
  type FerryBlock,
  type HotelBlock,
  type LabeledTravelField,
  type ProfileDirectoryRow,
  type TransferBlock,
  type TravelPerson,
  type WorksheetTravelBlocks,
} from './worksheet-travel-blocks.ts'

export const CHRONO_TIE_BREAK = {
  'flight-depart': 10,
  'flight-arrive': 20,
  'car-pickup': 30,
  'car-return': 40,
  'car-hire': 45,
  'hotel-check-in': 50,
  'hotel-stay': 55,
  'hotel-check-out': 60,
  transfer: 70,
  ferry: 80,
  show: 90,
} as const

export type WorksheetChronoKind = keyof typeof CHRONO_TIE_BREAK

const KIND_LABEL: Record<WorksheetChronoKind, string> = {
  'flight-depart': 'Flight',
  'flight-arrive': 'Arrive',
  'car-pickup': 'Car pickup',
  'car-return': 'Car return',
  'car-hire': 'Car hire',
  'hotel-check-in': 'Hotel check-in',
  'hotel-stay': 'Hotel',
  'hotel-check-out': 'Hotel check-out',
  transfer: 'Transfer',
  ferry: 'Ferry',
  show: 'Show',
}

/** Dated events with no parseable clock time sort after timed events that day. */
const END_OF_DAY = '99:99'
const UNDATED = '9999-99-99'

export type ChronoShowInput = {
  id: string
  venue_name: string
  venue_city: string
  state_territory?: string | null
  show_date: string | null
  show_order: number
  capacity?: number | null
  sets_label?: string | null
  venue_address?: string | null
  venue_phone?: string | null
  venue_contact?: string | null
  sched_access?: string | null
  sched_soundcheck?: string | null
  sched_dinner?: string | null
  sched_doors?: string | null
  sched_show?: string | null
  sched_finish?: string | null
  travel_access_notes?: string | null
  hotel_notes?: string | null
  hospitality_merch_notes?: string | null
  michael_notes?: string | null
}

export type WorksheetChronoEvent = {
  id: string
  kind: WorksheetChronoKind
  kindLabel: string
  title: string
  date: string | null
  /** Stored time text. Not a fabricated clock time. */
  timeLabel: string | null
  fields: { label: string; value: string }[]
  sourceId: string
}

export type WorksheetChronoDay = {
  date: string | null
  heading: string
  events: WorksheetChronoEvent[]
}

export type WorksheetChronoHeader = {
  runName: string
  runCode: string
  region: string
  people: string
  dateStart: string | null
  dateEnd: string | null
  dateSpan: string
  venues: string[]
  synopsis: string
  notes: { label: string; value: string }[]
}

export type WorksheetChronoModel = {
  header: WorksheetChronoHeader
  days: WorksheetChronoDay[]
}

type BuiltEvent = WorksheetChronoEvent & {
  sortTime: string | null
  sortTie: string
}

const SHOW_TIME_FIELDS = [
  'sched_access',
  'sched_soundcheck',
  'sched_dinner',
  'sched_doors',
  'sched_show',
] as const

export function parseChronoTime(value: string | null | undefined): string | null {
  if (!value) return null
  const v = value.trim().toLowerCase().replace(/\./g, '')
  if (!v) return null
  const hms = v.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/)
  if (hms) {
    const h = Number(hms[1])
    const m = Number(hms[2])
    if (h > 23 || m > 59) return null
    return `${pad2(h)}:${hms[2]}`
  }
  const ampm = v.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/)
  if (!ampm) return null
  let h = Number(ampm[1])
  const m = ampm[2] ?? '00'
  if (h < 1 || h > 12 || Number(m) > 59) return null
  if (ampm[3] === 'am') {
    if (h === 12) h = 0
  } else if (h !== 12) {
    h += 12
  }
  return `${pad2(h)}:${m}`
}

export function collectChronoPeople(
  blocks: WorksheetTravelBlocks,
  profiles: ProfileDirectoryRow[] = [],
): string {
  const names: string[] = []
  const seen = new Set<string>()
  const addPeople = (people: TravelPerson[]) => {
    for (const person of people) {
      const name = resolveTravelPersonName(person, profiles).trim()
      const key = name.toLowerCase()
      if (!name || seen.has(key)) continue
      seen.add(key)
      names.push(name)
    }
  }
  for (const flight of blocks.flights) addPeople(flight.travellers)
  for (const car of blocks.cars) addPeople(car.drivers)
  for (const hotel of blocks.hotels) {
    addPeople(hotel.guests)
    if (hotel.guests_tbc && hotel.guests.length === 0 && !seen.has('tbc guests')) {
      seen.add('tbc guests')
      names.push('TBC guests')
    }
  }
  for (const ferry of blocks.ferries) addPeople(ferry.travellers)
  return names.join(', ')
}

export function buildWorksheetChrono(input: {
  blocks: WorksheetTravelBlocks
  shows?: ChronoShowInput[]
  profiles?: ProfileDirectoryRow[]
  run: {
    name?: string | null
    code?: string | null
    regionLabel?: string | null
    synopsis?: string | null
    startDate?: string | null
    endDate?: string | null
  }
  legacyNotes?: {
    flights_notes?: string | null
    vehicles_notes?: string | null
    hotels_overview_notes?: string | null
  }
}): WorksheetChronoModel {
  const profiles = input.profiles ?? []
  const shows = input.shows ?? []
  const events = [
    ...eventsFromBlocks(input.blocks, profiles),
    ...shows.map(show => eventFromShow(show)),
  ].filter((event): event is BuiltEvent => event != null)

  events.sort((a, b) => eventSortKey(a).localeCompare(eventSortKey(b)))

  const days = groupDays(events)
  const dated = events.map(event => event.date).filter((date): date is string => Boolean(date)).sort()
  const fallbackStart = toIsoDateOnly(input.run.startDate)
  const fallbackEnd = toIsoDateOnly(input.run.endDate)
  const dateStart = dated[0] ?? fallbackStart
  const dateEnd = dated[dated.length - 1] ?? fallbackEnd

  return {
    header: {
      runName: (input.run.name ?? '').trim(),
      runCode: (input.run.code ?? '').trim(),
      region: (input.run.regionLabel ?? '').trim(),
      people: collectChronoPeople(input.blocks, profiles),
      dateStart,
      dateEnd,
      dateSpan: formatChronoSpan(dateStart, dateEnd),
      venues: uniqueVenues(shows),
      synopsis: (input.run.synopsis ?? '').trim(),
      notes: omitBlankTravelFields([
        { label: 'Flights notes', value: input.legacyNotes?.flights_notes ?? '' },
        { label: 'Cars notes', value: input.legacyNotes?.vehicles_notes ?? '' },
        { label: 'Hotels notes', value: input.legacyNotes?.hotels_overview_notes ?? '' },
      ]),
    },
    days,
  }
}

function eventsFromBlocks(
  blocks: WorksheetTravelBlocks,
  profiles: ProfileDirectoryRow[],
): Array<BuiltEvent | null> {
  return [
    ...blocks.flights.flatMap(flight => flightEvents(flight, profiles)),
    ...blocks.cars.flatMap(car => carEvents(car, profiles)),
    ...blocks.hotels.flatMap(hotel => hotelEvents(hotel, profiles)),
    ...blocks.transfers.map(transfer => transferEvent(transfer)),
    ...blocks.ferries.map(ferry => ferryEvent(ferry, profiles)),
  ]
}

function flightEvents(
  block: WorksheetTravelBlocks['flights'][number],
  profiles: ProfileDirectoryRow[],
): BuiltEvent[] {
  const base = flightHandoutFields(block, profiles)
  if (omitBlankTravelFields(base).length === 0) return []

  const date = toIsoDateOnly(block.date)
  const depSort = parseChronoTime(block.dep_time)
  const arrSort = parseChronoTime(block.arr_time)
  const separateArrive = Boolean(date && depSort && arrSort && arrSort > depSort)
  const departFields = omitBlankTravelFields(withoutLabels(base, [
    'Date',
    ...(hasTravelText(block.dep_time) ? ['Dep'] : []),
    ...(separateArrive ? ['Arr', 'Arr terminal'] : []),
  ]))

  const depart = makeEvent({
    kind: 'flight-depart',
    sourceId: block.id,
    title: joinTitle(block.flight_number, routeLabel(block.from, block.to)),
    date,
    timeLabel: hasTravelText(block.dep_time) ? block.dep_time.trim() : null,
    sortTime: depSort,
    fields: departFields,
  })

  if (!separateArrive || !arrSort) return [depart]

  const arrive = makeEvent({
    kind: 'flight-arrive',
    sourceId: block.id,
    title: joinTitle(block.flight_number, block.to.trim() || routeLabel(block.from, block.to)),
    date,
    timeLabel: block.arr_time.trim(),
    sortTime: arrSort,
    fields: omitBlankTravelFields([
      { label: 'Flight #', value: block.flight_number },
      { label: 'Airline', value: block.airline },
      { label: 'To', value: block.to },
      { label: 'Arr terminal', value: block.arr_terminal },
      { label: 'Conf / PNR', value: block.confirmation },
      { label: 'Travellers', value: formatTravelPeople(block.travellers, profiles) },
    ]),
  })
  return [depart, arrive]
}

function carEvents(
  block: WorksheetTravelBlocks['cars'][number],
  profiles: ProfileDirectoryRow[],
): BuiltEvent[] {
  const drivers = formatTravelPeople(block.drivers, profiles)
  const shared: LabeledTravelField[] = [
    { label: 'Provider', value: block.provider },
    { label: 'Vehicle class', value: block.vehicle_class },
    { label: 'Conf #', value: block.confirmation },
    { label: 'Drivers', value: drivers },
    { label: 'Fuel', value: block.fuel },
    { label: 'E-tag', value: block.e_tag },
    { label: 'Unlimited km', value: block.unlimited_km },
    { label: 'After-hours', value: block.after_hours },
  ]
  const hasPickup = hasTravelText(block.pickup_location)
    || hasTravelText(block.pickup_date)
    || hasTravelText(block.pickup_time)
  const hasReturn = hasTravelText(block.return_location)
    || hasTravelText(block.return_date)
    || hasTravelText(block.return_time)

  if (!hasPickup && !hasReturn) {
    const fields = omitBlankTravelFields([
      ...shared,
      { label: 'Notes', value: block.notes },
    ])
    if (fields.length === 0) return []
    return [makeEvent({
      kind: 'car-hire',
      sourceId: block.id,
      title: block.provider.trim() || 'Car hire',
      date: null,
      timeLabel: null,
      sortTime: null,
      fields,
    })]
  }

  const events: BuiltEvent[] = []
  if (hasPickup) {
    events.push(makeEvent({
      kind: 'car-pickup',
      sourceId: block.id,
      title: joinTitle(block.provider, block.pickup_location),
      date: toIsoDateOnly(block.pickup_date),
      timeLabel: hasTravelText(block.pickup_time) ? block.pickup_time.trim() : null,
      sortTime: parseChronoTime(block.pickup_time),
      fields: omitBlankTravelFields([
        ...shared,
        { label: 'Location', value: block.pickup_location },
        { label: 'Notes', value: block.notes },
      ]),
    }))
  }
  if (hasReturn) {
    events.push(makeEvent({
      kind: 'car-return',
      sourceId: block.id,
      title: joinTitle(block.provider, block.return_location),
      date: toIsoDateOnly(block.return_date),
      timeLabel: hasTravelText(block.return_time) ? block.return_time.trim() : null,
      sortTime: parseChronoTime(block.return_time),
      fields: omitBlankTravelFields([
        ...shared,
        { label: 'Location', value: block.return_location },
        { label: 'Notes', value: hasPickup ? '' : block.notes },
      ]),
    }))
  }
  return events
}

function hotelEvents(block: HotelBlock, profiles: ProfileDirectoryRow[]): BuiltEvent[] {
  const hasCheckIn = hasTravelText(block.check_in_date) || hasTravelText(block.check_in_time)
  const hasCheckOut = hasTravelText(block.check_out_date) || hasTravelText(block.check_out_time)
  const stayFields = withoutLabels(hotelHandoutFields(block, profiles), ['Check-in', 'Check-out'])

  if (!hasCheckIn && !hasCheckOut) {
    const fields = omitBlankTravelFields(stayFields)
    if (fields.length === 0) return []
    return [makeEvent({
      kind: 'hotel-stay',
      sourceId: block.id,
      title: block.name.trim() || 'Hotel',
      date: null,
      timeLabel: null,
      sortTime: null,
      fields,
    })]
  }

  const events: BuiltEvent[] = []
  if (hasCheckIn) {
    events.push(makeEvent({
      kind: 'hotel-check-in',
      sourceId: block.id,
      title: block.name.trim() || 'Hotel',
      date: toIsoDateOnly(block.check_in_date),
      timeLabel: hasTravelText(block.check_in_time) ? block.check_in_time.trim() : null,
      sortTime: parseChronoTime(block.check_in_time),
      fields: omitBlankTravelFields(stayFields),
    }))
  }
  if (hasCheckOut) {
    const checkOutFields: LabeledTravelField[] = [
      { label: 'Name', value: block.name },
      { label: 'Address', value: block.address },
      { label: 'Phone', value: block.phone },
      { label: 'Conf #', value: block.confirmation },
    ]
    if (!hasCheckIn) checkOutFields.push({ label: 'ETA / notes', value: block.eta_notes })
    events.push(makeEvent({
      kind: 'hotel-check-out',
      sourceId: block.id,
      title: block.name.trim() || 'Hotel',
      date: toIsoDateOnly(block.check_out_date),
      timeLabel: hasTravelText(block.check_out_time) ? block.check_out_time.trim() : null,
      sortTime: parseChronoTime(block.check_out_time),
      fields: omitBlankTravelFields(checkOutFields),
    }))
  }
  return events
}

function transferEvent(block: TransferBlock): BuiltEvent | null {
  const when = transferWhen(block)
  const fields = omitBlankTravelFields(withoutLabels(transferHandoutFields(block), ['When']))
  const hasMoment = Boolean(when.date || when.timeLabel)
  if (fields.length === 0 && !hasMoment) return null
  return makeEvent({
    kind: 'transfer',
    sourceId: block.id,
    title: joinTitle(block.provider, routeLabel(block.from, block.to)) || 'Transfer',
    date: when.date,
    timeLabel: when.timeLabel,
    sortTime: when.sortTime,
    fields,
  })
}

function ferryEvent(block: FerryBlock, profiles: ProfileDirectoryRow[]): BuiltEvent | null {
  const dep = hasTravelText(block.dep_time) ? block.dep_time.trim() : null
  const fields = omitBlankTravelFields(withoutLabels(
    ferryHandoutFields(block, profiles),
    dep ? ['Dep'] : [],
  ))
  if (fields.length === 0 && !dep) return null
  return makeEvent({
    kind: 'ferry',
    sourceId: block.id,
    title: joinTitle(block.operator, routeLabel(block.dep_port, block.arr_port)) || 'Ferry',
    date: null,
    timeLabel: dep,
    sortTime: parseChronoTime(block.dep_time),
    fields,
  })
}

function eventFromShow(show: ChronoShowInput): BuiltEvent | null {
  const city = [show.venue_city, show.state_territory].filter(part => hasTravelText(part)).join(', ')
  const travelNotes = (show.travel_access_notes ?? '').trim()
  const michael = (show.michael_notes ?? '').trim()
  const fields = omitBlankTravelFields([
    { label: 'City', value: city },
    { label: 'Sets', value: show.sets_label ?? '' },
    { label: 'Capacity', value: show.capacity },
    { label: 'Address', value: show.venue_address ?? '' },
    { label: 'Phone', value: show.venue_phone ?? '' },
    { label: 'Contact', value: show.venue_contact ?? '' },
    { label: 'Access', value: show.sched_access ?? '' },
    { label: 'Soundcheck', value: show.sched_soundcheck ?? '' },
    { label: 'Dinner', value: show.sched_dinner ?? '' },
    { label: 'Doors', value: show.sched_doors ?? '' },
    { label: 'Show time', value: show.sched_show ?? '' },
    { label: 'Finish', value: show.sched_finish ?? '' },
    { label: 'Notes', value: travelNotes || michael },
    { label: 'Michael notes', value: travelNotes && michael && travelNotes !== michael ? michael : '' },
    { label: 'Hotel notes', value: show.hotel_notes ?? '' },
    { label: 'Hospitality / merch', value: show.hospitality_merch_notes ?? '' },
  ])
  const date = toIsoDateOnly(show.show_date)
  const earliest = earliestShowTime(show)
  const venue = show.venue_name.trim()
  if (!venue && !date && fields.length === 0) return null
  return makeEvent({
    kind: 'show',
    sourceId: show.id,
    title: venue || 'Show',
    date,
    timeLabel: earliest?.label ?? null,
    sortTime: earliest?.sort ?? null,
    sortTie: `${pad2(show.show_order)}|${show.id}`,
    fields,
  })
}

function earliestShowTime(show: ChronoShowInput): { label: string; sort: string } | null {
  let best: { label: string; sort: string } | null = null
  for (const key of SHOW_TIME_FIELDS) {
    const raw = show[key]
    if (typeof raw !== 'string') continue
    const label = raw.trim()
    if (!label) continue
    const sort = parseChronoTime(label)
    if (!sort) continue
    if (!best || sort < best.sort) best = { label, sort }
  }
  return best
}

function transferWhen(block: TransferBlock): {
  date: string | null
  timeLabel: string | null
  sortTime: string | null
} {
  const date = toIsoDateOnly(block.date) ?? toIsoDateOnly(block.datetime)
  if (hasTravelText(block.time)) {
    return {
      date,
      timeLabel: block.time.trim(),
      sortTime: parseChronoTime(block.time),
    }
  }
  const embedded = block.datetime.match(/T(\d{2}:\d{2})/)
  if (embedded) {
    return { date, timeLabel: embedded[1], sortTime: embedded[1] }
  }
  return { date, timeLabel: null, sortTime: null }
}

function makeEvent(input: {
  kind: WorksheetChronoKind
  sourceId: string
  title: string
  date: string | null
  timeLabel: string | null
  sortTime: string | null
  fields: { label: string; value: string }[]
  sortTie?: string
}): BuiltEvent {
  return {
    id: `${input.kind}:${input.sourceId}`,
    kind: input.kind,
    kindLabel: KIND_LABEL[input.kind],
    title: input.title.trim() || KIND_LABEL[input.kind],
    date: input.date,
    timeLabel: input.timeLabel,
    sortTime: input.sortTime,
    fields: input.fields,
    sourceId: input.sourceId,
    sortTie: input.sortTie ?? input.sourceId,
  }
}

function toPublicEvent(event: BuiltEvent): WorksheetChronoEvent {
  return {
    id: event.id,
    kind: event.kind,
    kindLabel: event.kindLabel,
    title: event.title,
    date: event.date,
    timeLabel: event.timeLabel,
    fields: event.fields,
    sourceId: event.sourceId,
  }
}

function eventSortKey(event: BuiltEvent): string {
  const date = event.date ?? UNDATED
  const time = event.sortTime ?? END_OF_DAY
  const tie = String(CHRONO_TIE_BREAK[event.kind]).padStart(2, '0')
  return `${date}T${time}|${tie}|${event.sortTie}|${event.kind}`
}

function groupDays(events: BuiltEvent[]): WorksheetChronoDay[] {
  const days: WorksheetChronoDay[] = []
  for (const event of events) {
    const publicEvent = toPublicEvent(event)
    const last = days[days.length - 1]
    if (!last || last.date !== event.date) {
      days.push({
        date: event.date,
        heading: event.date ? formatDateAU(event.date, { weekday: 'short' }) : 'Date not set',
        events: [publicEvent],
      })
    } else {
      last.events.push(publicEvent)
    }
  }
  return days
}

function uniqueVenues(shows: ChronoShowInput[]): string[] {
  const names: string[] = []
  const seen = new Set<string>()
  const ordered = [...shows].sort((a, b) => a.show_order - b.show_order)
  for (const show of ordered) {
    const name = show.venue_name.trim()
    const key = name.toLowerCase()
    if (!name || seen.has(key)) continue
    seen.add(key)
    names.push(name)
  }
  return names
}

function formatChronoSpan(start: string | null, end: string | null): string {
  if (!start && !end) return ''
  if (start && end && start !== end) return `${formatDateAU(start)} – ${formatDateAU(end)}`
  return formatDateAU(start ?? end)
}

function withoutLabels(fields: LabeledTravelField[], labels: string[]): LabeledTravelField[] {
  const drop = new Set(labels)
  return fields.filter(field => !drop.has(field.label))
}

function joinTitle(...parts: Array<string | null | undefined>): string {
  return parts.map(part => (part ?? '').trim()).filter(Boolean).join(' · ')
}

function routeLabel(from: string, to: string): string {
  const left = from.trim()
  const right = to.trim()
  if (left && right) return `${left} → ${right}`
  return left || right
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

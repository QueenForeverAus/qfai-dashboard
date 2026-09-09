/**
 * W1 structured Worksheet travel cards (staging).
 *
 * Stored on the BOOKED Run Advancing workspace (`travel_blocks` JSONB).
 * Never writes locked Run Costings / cost_fields. W4 flight-# lookup +
 * airport-call auto live on the Worksheet cards (`lib/flight-lookup`).
 */

export const WORKSHEET_TRAVEL_BLOCKS_VERSION = 1 as const

export const FLIGHT_KINDS = ['dep', 'mid', 'ret'] as const
export type FlightKind = (typeof FLIGHT_KINDS)[number]

export const FLIGHT_KIND_LABEL: Record<FlightKind, string> = {
  dep: 'Dep',
  mid: 'Mid',
  ret: 'Ret',
}

export const FLIGHT_KIND_ORDER: Record<FlightKind, number> = {
  dep: 0,
  mid: 1,
  ret: 2,
}

export type TravelPerson = {
  profile_id: string | null
  name: string
}

export type FlightBlock = {
  id: string
  kind: FlightKind
  flight_number: string
  date: string
  airline: string
  from: string
  to: string
  dep_time: string
  arr_time: string
  dep_terminal: string
  arr_terminal: string
  airport_call: string
  check_in_open: string
  confirmation: string
  travellers: TravelPerson[]
}

export type CarBlock = {
  id: string
  provider: string
  vehicle_class: string
  pickup_location: string
  pickup_date: string
  pickup_time: string
  return_location: string
  return_date: string
  return_time: string
  confirmation: string
  drivers: TravelPerson[]
  fuel: string
  e_tag: string
  unlimited_km: boolean | null
  after_hours: string
  notes: string
}

export type HotelBlock = {
  id: string
  name: string
  address: string
  phone: string
  check_in_date: string
  check_in_time: string
  check_out_date: string
  check_out_time: string
  rooms: number | null
  room_type: string
  confirmation: string
  /** PII — never audit; expose only to admin/owner. */
  pin: string
  guests: TravelPerson[]
  guests_tbc: boolean
  eta_notes: string
}

export type TransferBlock = {
  id: string
  datetime: string
  date: string
  time: string
  from: string
  to: string
  provider: string
  amount: number | null
  notes: string
}

export type FerryBlock = {
  id: string
  operator: string
  dep_port: string
  arr_port: string
  dep_time: string
  arr_time: string
  confirmation: string
  travellers: TravelPerson[]
}

export type WorksheetTravelBlocks = {
  version: typeof WORKSHEET_TRAVEL_BLOCKS_VERSION
  flights: FlightBlock[]
  cars: CarBlock[]
  hotels: HotelBlock[]
  transfers: TransferBlock[]
  ferries: FerryBlock[]
}

export type LabeledTravelField = {
  label: string
  value: string | number | boolean | null | undefined
}

export type ProfileDirectoryRow = {
  id: string
  full_name: string
  nickname: string | null
}

export const EMPTY_TRAVEL_BLOCKS: WorksheetTravelBlocks = {
  version: WORKSHEET_TRAVEL_BLOCKS_VERSION,
  flights: [],
  cars: [],
  hotels: [],
  transfers: [],
  ferries: [],
}

export const AUDIT_FIELD_WORKSHEET_TRAVEL_BLOCKS = 'Worksheet travel blocks'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MAX_BLOCKS = 40
const MAX_PEOPLE = 30
const MAX_SHORT = 80
const MAX_MED = 200
const MAX_NOTES = 500
const MAX_PIN = 40

export function newTravelId(): string {
  return crypto.randomUUID()
}

export function hasTravelText(value: string | null | undefined): boolean {
  return Boolean(value && value.trim() !== '')
}

export function isBlankTravelValue(value: unknown): boolean {
  if (value == null) return true
  if (typeof value === 'string') return value.trim() === ''
  if (typeof value === 'number') return !Number.isFinite(value)
  if (typeof value === 'boolean') return false
  if (Array.isArray(value)) return value.length === 0
  return false
}

export function formatTravelFieldValue(value: unknown): string {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return String(value ?? '').trim()
}

/** Band-facing / print: drop blank values and their labels. */
export function omitBlankTravelFields(fields: LabeledTravelField[]): { label: string; value: string }[] {
  const kept: { label: string; value: string }[] = []
  for (const field of fields) {
    if (isBlankTravelValue(field.value)) continue
    const label = field.label.trim()
    if (!label) continue
    kept.push({ label, value: formatTravelFieldValue(field.value) })
  }
  return kept
}

export function formatTravelPeople(
  people: TravelPerson[] | null | undefined,
  profiles: ProfileDirectoryRow[] = [],
): string {
  if (!people?.length) return ''
  const names = people
    .map(person => resolveTravelPersonName(person, profiles))
    .filter(hasTravelText)
  return names.join(', ')
}

export function resolveTravelPersonName(
  person: TravelPerson,
  profiles: ProfileDirectoryRow[] = [],
): string {
  if (person.profile_id) {
    const match = profiles.find(row => row.id === person.profile_id)
    if (match) {
      const nick = match.nickname?.trim()
      return nick && nick !== match.full_name ? `${match.full_name} (${nick})` : match.full_name
    }
  }
  return person.name.trim()
}

export function isFlightBlockComplete(block: FlightBlock): boolean {
  return (
    hasTravelText(block.flight_number)
    && hasTravelText(block.date)
    && hasTravelText(block.dep_time)
    && hasTravelText(block.from)
    && hasTravelText(block.to)
    && block.travellers.length >= 1
  )
}

export function isCarBlockComplete(block: CarBlock): boolean {
  return (
    hasTravelText(block.provider)
    && hasTravelText(block.pickup_location)
    && hasTravelText(block.pickup_time)
    && hasTravelText(block.return_location)
    && hasTravelText(block.return_time)
    && hasTravelText(block.confirmation)
  )
}

export function isHotelBlockComplete(block: HotelBlock): boolean {
  const guestsOk = block.guests_tbc === true || block.guests.length >= 1
  return (
    hasTravelText(block.name)
    && hasTravelText(block.check_in_date)
    && hasTravelText(block.check_out_date)
    && block.rooms != null
    && Number.isFinite(block.rooms)
    && block.rooms >= 1
    && guestsOk
  )
}

export function sortFlightBlocks(flights: FlightBlock[]): FlightBlock[] {
  return [...flights].sort((a, b) => {
    const kindDiff = FLIGHT_KIND_ORDER[a.kind] - FLIGHT_KIND_ORDER[b.kind]
    if (kindDiff !== 0) return kindDiff
    if (a.date !== b.date) return a.date.localeCompare(b.date)
    return a.dep_time.localeCompare(b.dep_time)
  })
}

export function emptyFlightBlock(kind: FlightKind = 'dep', id = newTravelId()): FlightBlock {
  return {
    id,
    kind,
    flight_number: '',
    date: '',
    airline: '',
    from: '',
    to: '',
    dep_time: '',
    arr_time: '',
    dep_terminal: '',
    arr_terminal: '',
    airport_call: '',
    check_in_open: '',
    confirmation: '',
    travellers: [],
  }
}

export function emptyCarBlock(id = newTravelId()): CarBlock {
  return {
    id,
    provider: '',
    vehicle_class: '',
    pickup_location: '',
    pickup_date: '',
    pickup_time: '',
    return_location: '',
    return_date: '',
    return_time: '',
    confirmation: '',
    drivers: [],
    fuel: '',
    e_tag: '',
    unlimited_km: null,
    after_hours: '',
    notes: '',
  }
}

export function emptyHotelBlock(id = newTravelId()): HotelBlock {
  return {
    id,
    name: '',
    address: '',
    phone: '',
    check_in_date: '',
    check_in_time: '',
    check_out_date: '',
    check_out_time: '',
    rooms: null,
    room_type: '',
    confirmation: '',
    pin: '',
    guests: [],
    guests_tbc: false,
    eta_notes: '',
  }
}

export function emptyTransferBlock(id = newTravelId()): TransferBlock {
  return {
    id,
    datetime: '',
    date: '',
    time: '',
    from: '',
    to: '',
    provider: '',
    amount: null,
    notes: '',
  }
}

export function emptyFerryBlock(id = newTravelId()): FerryBlock {
  return {
    id,
    operator: '',
    dep_port: '',
    arr_port: '',
    dep_time: '',
    arr_time: '',
    confirmation: '',
    travellers: [],
  }
}

export function flightHandoutFields(
  block: FlightBlock,
  profiles: ProfileDirectoryRow[] = [],
): LabeledTravelField[] {
  return [
    { label: 'Flight #', value: block.flight_number },
    { label: 'Date', value: block.date },
    { label: 'Airline', value: block.airline },
    { label: 'From', value: block.from },
    { label: 'To', value: block.to },
    { label: 'Dep', value: block.dep_time },
    { label: 'Arr', value: block.arr_time },
    { label: 'Dep terminal', value: block.dep_terminal },
    { label: 'Arr terminal', value: block.arr_terminal },
    { label: 'Airport call', value: block.airport_call },
    { label: 'Check-in open', value: block.check_in_open },
    { label: 'Conf / PNR', value: block.confirmation },
    { label: 'Travellers', value: formatTravelPeople(block.travellers, profiles) },
  ]
}

export function carHandoutFields(
  block: CarBlock,
  profiles: ProfileDirectoryRow[] = [],
): LabeledTravelField[] {
  return [
    { label: 'Provider', value: block.provider },
    { label: 'Vehicle class', value: block.vehicle_class },
    { label: 'Pickup', value: joinWhen(block.pickup_location, joinWhen(block.pickup_date, block.pickup_time)) },
    { label: 'Return', value: joinWhen(block.return_location, joinWhen(block.return_date, block.return_time)) },
    { label: 'Conf #', value: block.confirmation },
    { label: 'Drivers', value: formatTravelPeople(block.drivers, profiles) },
    { label: 'Fuel', value: block.fuel },
    { label: 'E-tag', value: block.e_tag },
    { label: 'Unlimited km', value: block.unlimited_km },
    { label: 'After-hours', value: block.after_hours },
    { label: 'Notes', value: block.notes },
  ]
}

export function hotelHandoutFields(
  block: HotelBlock,
  profiles: ProfileDirectoryRow[] = [],
  opts: { includePin?: boolean } = {},
): LabeledTravelField[] {
  const guests = block.guests_tbc && block.guests.length === 0
    ? 'TBC guests'
    : formatTravelPeople(block.guests, profiles)
  const fields: LabeledTravelField[] = [
    { label: 'Name', value: block.name },
    { label: 'Address', value: block.address },
    { label: 'Phone', value: block.phone },
    { label: 'Check-in', value: joinWhen(block.check_in_date, block.check_in_time) },
    { label: 'Check-out', value: joinWhen(block.check_out_date, block.check_out_time) },
    { label: '# rooms', value: block.rooms },
    { label: 'Room type', value: block.room_type },
    { label: 'Conf #', value: block.confirmation },
    { label: 'Guests', value: guests },
    { label: 'ETA / notes', value: block.eta_notes },
  ]
  // PIN is PII — never on band-facing/handout unless explicitly opted in (admin edit).
  if (opts.includePin) fields.splice(8, 0, { label: 'PIN', value: block.pin })
  return fields
}

export function transferHandoutFields(block: TransferBlock): LabeledTravelField[] {
  const when = hasTravelText(block.datetime) ? block.datetime : joinWhen(block.date, block.time)
  return [
    { label: 'When', value: when },
    { label: 'From', value: block.from },
    { label: 'To', value: block.to },
    { label: 'Provider', value: block.provider },
    { label: 'Amount', value: block.amount },
    { label: 'Notes', value: block.notes },
  ]
}

export function ferryHandoutFields(
  block: FerryBlock,
  profiles: ProfileDirectoryRow[] = [],
): LabeledTravelField[] {
  return [
    { label: 'Operator', value: block.operator },
    { label: 'From', value: block.dep_port },
    { label: 'To', value: block.arr_port },
    { label: 'Dep', value: block.dep_time },
    { label: 'Arr', value: block.arr_time },
    { label: 'Conf #', value: block.confirmation },
    { label: 'Travellers', value: formatTravelPeople(block.travellers, profiles) },
  ]
}

export function canExposeHotelPin(role: string | undefined): boolean {
  return role === 'owner' || role === 'admin'
}

export function redactHotelPins(blocks: WorksheetTravelBlocks): WorksheetTravelBlocks {
  return {
    ...blocks,
    hotels: blocks.hotels.map(hotel => ({ ...hotel, pin: '' })),
  }
}

export function redactTravelBlocksForRole(
  blocks: WorksheetTravelBlocks,
  role: string | undefined,
): WorksheetTravelBlocks {
  return canExposeHotelPin(role) ? blocks : redactHotelPins(blocks)
}

/** Production (and any non-admin) must not wipe PINs they cannot read. */
export function mergeHotelPinsPreservingHidden(
  incoming: WorksheetTravelBlocks,
  existing: WorksheetTravelBlocks,
  canExposePin: boolean,
): WorksheetTravelBlocks {
  if (canExposePin) return incoming
  const byId = new Map(existing.hotels.map(hotel => [hotel.id, hotel.pin]))
  return {
    ...incoming,
    hotels: incoming.hotels.map(hotel => ({
      ...hotel,
      pin: byId.get(hotel.id) ?? '',
    })),
  }
}

export function parseTravelBlocks(raw: unknown): WorksheetTravelBlocks {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...EMPTY_TRAVEL_BLOCKS }
  return sanitizeTravelBlocks(raw)
}

export function sanitizeTravelBlocks(raw: unknown): WorksheetTravelBlocks {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {}
  return {
    version: WORKSHEET_TRAVEL_BLOCKS_VERSION,
    flights: takeArray(src.flights).slice(0, MAX_BLOCKS).map(sanitizeFlight),
    cars: takeArray(src.cars).slice(0, MAX_BLOCKS).map(sanitizeCar),
    hotels: takeArray(src.hotels).slice(0, MAX_BLOCKS).map(sanitizeHotel),
    transfers: takeArray(src.transfers).slice(0, MAX_BLOCKS).map(sanitizeTransfer),
    ferries: takeArray(src.ferries).slice(0, MAX_BLOCKS).map(sanitizeFerry),
  }
}

export function travelBlocksCounts(blocks: WorksheetTravelBlocks): {
  flights: number
  cars: number
  hotels: number
  transfers: number
  ferries: number
} {
  return {
    flights: blocks.flights.length,
    cars: blocks.cars.length,
    hotels: blocks.hotels.length,
    transfers: blocks.transfers.length,
    ferries: blocks.ferries.length,
  }
}

export function formatWorksheetTravelBlocksAuditCopy(opts: {
  actorName: string
  runCode: string
  blocks: WorksheetTravelBlocks
}): { fieldName: string; oldValue: string; newValue: string } {
  const actor = opts.actorName.trim() || 'Someone'
  const c = travelBlocksCounts(opts.blocks)
  return {
    fieldName: AUDIT_FIELD_WORKSHEET_TRAVEL_BLOCKS,
    oldValue: 'worksheet travel blocks',
    newValue:
      `${actor} updated Worksheet travel blocks on ${opts.runCode} `
      + `(${c.flights} flight${c.flights === 1 ? '' : 's'}, `
      + `${c.cars} car${c.cars === 1 ? '' : 's'}, `
      + `${c.hotels} hotel${c.hotels === 1 ? '' : 's'}, `
      + `${c.transfers} transfer${c.transfers === 1 ? '' : 's'}, `
      + `${c.ferries} ${c.ferries === 1 ? 'ferry' : 'ferries'}).`,
  }
}

function joinWhen(a: string, b: string): string {
  const left = a.trim()
  const right = b.trim()
  if (left && right) return `${left} ${right}`
  return left || right
}

function takeArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function clip(value: unknown, max: number): string {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, max)
}

function asKind(value: unknown): FlightKind {
  return FLIGHT_KINDS.includes(value as FlightKind) ? value as FlightKind : 'mid'
}

function asId(value: unknown): string {
  return typeof value === 'string' && UUID_RE.test(value) ? value : newTravelId()
}

function asInt(value: unknown, min: number, max: number): number | null {
  if (value == null || value === '') return null
  const n = typeof value === 'number' ? value : Number(String(value).trim())
  if (!Number.isFinite(n)) return null
  const rounded = Math.round(n)
  if (rounded < min || rounded > max) return null
  return rounded
}

function asAmount(value: unknown): number | null {
  if (value == null || value === '') return null
  const n = typeof value === 'number' ? value : Number(String(value).trim())
  if (!Number.isFinite(n)) return null
  return Math.round(n * 100) / 100
}

function asBool(value: unknown): boolean {
  return value === true || value === 'true' || value === 1 || value === '1'
}

function asOptionalBool(value: unknown): boolean | null {
  if (value == null || value === '') return null
  if (value === true || value === 'true' || value === 'yes' || value === 1 || value === '1') return true
  if (value === false || value === 'false' || value === 'no' || value === 0 || value === '0') return false
  return null
}

function sanitizePeople(value: unknown): TravelPerson[] {
  return takeArray(value).slice(0, MAX_PEOPLE).map(row => {
    const rec = asRecord(row)
    const profileId = typeof rec.profile_id === 'string' && UUID_RE.test(rec.profile_id)
      ? rec.profile_id
      : null
    return {
      profile_id: profileId,
      name: clip(rec.name, MAX_SHORT),
    }
  }).filter(person => person.profile_id || hasTravelText(person.name))
}

function sanitizeFlight(value: unknown): FlightBlock {
  const rec = asRecord(value)
  return {
    id: asId(rec.id),
    kind: asKind(rec.kind),
    flight_number: clip(rec.flight_number, MAX_SHORT),
    date: clip(rec.date, 32),
    airline: clip(rec.airline, MAX_MED),
    from: clip(rec.from, MAX_MED),
    to: clip(rec.to, MAX_MED),
    dep_time: clip(rec.dep_time, 32),
    arr_time: clip(rec.arr_time, 32),
    dep_terminal: clip(rec.dep_terminal, MAX_SHORT),
    arr_terminal: clip(rec.arr_terminal, MAX_SHORT),
    airport_call: clip(rec.airport_call, MAX_MED),
    check_in_open: clip(rec.check_in_open, MAX_SHORT),
    confirmation: clip(rec.confirmation, MAX_SHORT),
    travellers: sanitizePeople(rec.travellers),
  }
}

function sanitizeCar(value: unknown): CarBlock {
  const rec = asRecord(value)
  return {
    id: asId(rec.id),
    provider: clip(rec.provider, MAX_MED),
    vehicle_class: clip(rec.vehicle_class, MAX_SHORT),
    pickup_location: clip(rec.pickup_location, MAX_MED),
    pickup_date: clip(rec.pickup_date, 32),
    pickup_time: clip(rec.pickup_time, 32),
    return_location: clip(rec.return_location, MAX_MED),
    return_date: clip(rec.return_date, 32),
    return_time: clip(rec.return_time, 32),
    confirmation: clip(rec.confirmation, MAX_SHORT),
    drivers: sanitizePeople(rec.drivers),
    fuel: clip(rec.fuel, MAX_MED),
    e_tag: clip(rec.e_tag, MAX_SHORT),
    unlimited_km: asOptionalBool(rec.unlimited_km),
    after_hours: clip(rec.after_hours, MAX_MED),
    notes: clip(rec.notes, MAX_NOTES),
  }
}

function sanitizeHotel(value: unknown): HotelBlock {
  const rec = asRecord(value)
  return {
    id: asId(rec.id),
    name: clip(rec.name, MAX_MED),
    address: clip(rec.address, MAX_NOTES),
    phone: clip(rec.phone, MAX_SHORT),
    check_in_date: clip(rec.check_in_date, 32),
    check_in_time: clip(rec.check_in_time, 32),
    check_out_date: clip(rec.check_out_date, 32),
    check_out_time: clip(rec.check_out_time, 32),
    rooms: asInt(rec.rooms, 1, 99),
    room_type: clip(rec.room_type, MAX_MED),
    confirmation: clip(rec.confirmation, MAX_SHORT),
    pin: clip(rec.pin, MAX_PIN),
    guests: sanitizePeople(rec.guests),
    guests_tbc: asBool(rec.guests_tbc),
    eta_notes: clip(rec.eta_notes, MAX_NOTES),
  }
}

function sanitizeTransfer(value: unknown): TransferBlock {
  const rec = asRecord(value)
  return {
    id: asId(rec.id),
    datetime: clip(rec.datetime, 64),
    date: clip(rec.date, 32),
    time: clip(rec.time, 32),
    from: clip(rec.from, MAX_MED),
    to: clip(rec.to, MAX_MED),
    provider: clip(rec.provider, MAX_MED),
    amount: asAmount(rec.amount),
    notes: clip(rec.notes, MAX_NOTES),
  }
}

function sanitizeFerry(value: unknown): FerryBlock {
  const rec = asRecord(value)
  return {
    id: asId(rec.id),
    operator: clip(rec.operator, MAX_MED),
    dep_port: clip(rec.dep_port, MAX_MED),
    arr_port: clip(rec.arr_port, MAX_MED),
    dep_time: clip(rec.dep_time, 32),
    arr_time: clip(rec.arr_time, 32),
    confirmation: clip(rec.confirmation, MAX_SHORT),
    travellers: sanitizePeople(rec.travellers),
  }
}

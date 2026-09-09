/**
 * Map a travel-scrape packet onto W1 Worksheet travel_blocks.
 * Source notes stay off the cards — checklist only.
 */

import { formatDdMmYy } from '../receipts/dates.ts'
import {
  emptyCarBlock,
  emptyFerryBlock,
  emptyFlightBlock,
  emptyHotelBlock,
  emptyTransferBlock,
  sanitizeTravelBlocks,
  type CarBlock,
  type FerryBlock,
  type FlightBlock,
  type FlightKind,
  type HotelBlock,
  type ProfileDirectoryRow,
  type TransferBlock,
  type TravelPerson,
  type WorksheetTravelBlocks,
} from '../worksheet-travel-blocks.ts'
import {
  packetHasBlockingRunFlag,
  readWorksheetString,
  worksheetCollectionForCategory,
  type TravelScrapePacket,
  type TravelScrapeTraveller,
  type TravelWorksheetCollection,
} from './packet.ts'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type TravelBlockDraft = {
  collection: TravelWorksheetCollection
  block: FlightBlock | CarBlock | HotelBlock | TransferBlock | FerryBlock
}

function normName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function matchProfileForTraveller(
  traveller: TravelScrapeTraveller,
  profiles: ProfileDirectoryRow[],
): ProfileDirectoryRow | null {
  if (traveller.profile_user_id && UUID_RE.test(traveller.profile_user_id)) {
    const byId = profiles.find(row => row.id === traveller.profile_user_id)
    if (byId) return byId
    if (traveller.match === 'profile') return null
  }
  const raw = normName(traveller.raw_name)
  if (!raw) return null
  return profiles.find(row => {
    const full = normName(row.full_name)
    const nick = normName(row.nickname ?? '')
    if (full && (full === raw || full.startsWith(raw) || raw.startsWith(full))) return true
    if (nick && (nick === raw || raw.includes(nick) || nick.includes(raw))) return true
    const first = full.split(' ')[0]
    return Boolean(first && first === raw.split(' ')[0] && raw.split(' ').length === 1)
  }) ?? null
}

export function resolvePacketTravellers(
  travellers: TravelScrapeTraveller[],
  profiles: ProfileDirectoryRow[] = [],
): TravelPerson[] {
  const people: TravelPerson[] = []
  const seen = new Set<string>()
  for (const traveller of travellers) {
    if (traveller.match === 'free_text') {
      const name = traveller.raw_name.trim()
      if (!name) continue
      const key = `text:${normName(name)}`
      if (seen.has(key)) continue
      seen.add(key)
      people.push({ profile_id: null, name })
      continue
    }
    const matched = matchProfileForTraveller(traveller, profiles)
    if (matched) {
      const key = `id:${matched.id}`
      if (seen.has(key)) continue
      seen.add(key)
      people.push({ profile_id: matched.id, name: traveller.raw_name.trim() || matched.full_name })
      continue
    }
    if (traveller.profile_user_id && UUID_RE.test(traveller.profile_user_id) && traveller.match === 'profile') {
      const key = `id:${traveller.profile_user_id}`
      if (seen.has(key)) continue
      seen.add(key)
      people.push({
        profile_id: traveller.profile_user_id,
        name: traveller.raw_name.trim(),
      })
      continue
    }
    const name = traveller.raw_name.trim()
    if (!name) continue
    const key = `text:${normName(name)}`
    if (seen.has(key)) continue
    seen.add(key)
    people.push({ profile_id: null, name })
  }
  return people
}

function pickStr(incoming: string, existing: string): string {
  return incoming.trim() ? incoming : existing
}

function pickNum(incoming: number | null, existing: number | null): number | null {
  return incoming != null && Number.isFinite(incoming) ? incoming : existing
}

function pickBool(incoming: boolean | null, existing: boolean | null): boolean | null {
  return incoming == null ? existing : incoming
}

function mergePeople(existing: TravelPerson[], incoming: TravelPerson[]): TravelPerson[] {
  const out = [...existing]
  const keys = new Set(existing.map(person =>
    person.profile_id ? `id:${person.profile_id}` : `text:${normName(person.name)}`,
  ))
  for (const person of incoming) {
    const key = person.profile_id ? `id:${person.profile_id}` : `text:${normName(person.name)}`
    if (keys.has(key)) continue
    keys.add(key)
    out.push(person)
  }
  return out
}

function worksheetFlightKind(worksheet: TravelScrapePacket['worksheet']): FlightKind {
  const kind = readWorksheetString(worksheet, 'kind')
  return kind === 'dep' || kind === 'mid' || kind === 'ret' ? kind : 'mid'
}

function hotelRooms(worksheet: TravelScrapePacket['worksheet']): number | null {
  const raw = worksheet.rooms
  if (raw == null || raw === '') return null
  const n = typeof raw === 'number' ? raw : Number(String(raw).trim())
  if (!Number.isFinite(n)) return null
  return Math.round(n)
}

function transferAmount(worksheet: TravelScrapePacket['worksheet']): number | null {
  const raw = worksheet.amount
  if (raw == null || raw === '') return null
  const n = typeof raw === 'number' ? raw : Number(String(raw).trim())
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null
}

function unlimitedKm(worksheet: TravelScrapePacket['worksheet']): boolean | null {
  const raw = worksheet.unlimited_km
  if (raw == null || raw === '') return null
  if (raw === true || raw === 'true' || raw === 'yes' || raw === 1 || raw === '1') return true
  if (raw === false || raw === 'false' || raw === 'no' || raw === 0 || raw === '0') return false
  return null
}

export function vendorLabel(packet: TravelScrapePacket): string {
  return packet.email.vendor_domain
    || packet.email.from
    || readWorksheetString(packet.worksheet, 'name')
    || readWorksheetString(packet.worksheet, 'provider')
    || readWorksheetString(packet.worksheet, 'operator')
    || readWorksheetString(packet.worksheet, 'airline')
    || packet.category
}

export function packetConfirmation(packet: TravelScrapePacket): string {
  return readWorksheetString(packet.worksheet, 'confirmation')
    || packet.supersedes.prior_conf_id
    || ''
}

export function formatTravelScrapeSourceNote(packet: TravelScrapePacket): string {
  const provided = packet.checklist.source_note.trim()
  if (provided) return provided
  const vendor = vendorLabel(packet)
  const dateIso = (packet.email.date || packet.captured_at).slice(0, 10)
  const date = /^\d{4}-\d{2}-\d{2}$/.test(dateIso) ? formatDdMmYy(dateIso) : dateIso
  const conf = packetConfirmation(packet) || 'unknown'
  return `from ${vendor} email ${date} · conf ${conf}`
}

export function draftTravelBlock(
  packet: TravelScrapePacket,
  profiles: ProfileDirectoryRow[] = [],
  existingId?: string,
): TravelBlockDraft | null {
  const collection = worksheetCollectionForCategory(packet.category)
  if (!collection) return null

  const people = resolvePacketTravellers(packet.travellers, profiles)
  const ws = packet.worksheet

  if (packet.category === 'hotel') {
    const base = emptyHotelBlock(existingId)
    const block: HotelBlock = {
      ...base,
      name: readWorksheetString(ws, 'name') || vendorLabel(packet),
      address: readWorksheetString(ws, 'address'),
      phone: readWorksheetString(ws, 'phone'),
      check_in_date: readWorksheetString(ws, 'check_in_date'),
      check_in_time: readWorksheetString(ws, 'check_in_time'),
      check_out_date: readWorksheetString(ws, 'check_out_date'),
      check_out_time: readWorksheetString(ws, 'check_out_time'),
      rooms: hotelRooms(ws),
      room_type: readWorksheetString(ws, 'room_type'),
      confirmation: packetConfirmation(packet),
      pin: readWorksheetString(ws, 'pin'),
      guests: people,
      guests_tbc: ws.guests_tbc === true || ws.guests_tbc === 'true' || packet.checklist.partial_names,
      eta_notes: readWorksheetString(ws, 'eta_notes'),
    }
    return { collection, block }
  }

  if (packet.category === 'flight') {
    const kind = worksheetFlightKind(ws)
    const base = emptyFlightBlock(kind, existingId)
    const block: FlightBlock = {
      ...base,
      kind,
      flight_number: readWorksheetString(ws, 'flight_number'),
      date: readWorksheetString(ws, 'date'),
      airline: readWorksheetString(ws, 'airline'),
      from: readWorksheetString(ws, 'from'),
      to: readWorksheetString(ws, 'to'),
      dep_time: readWorksheetString(ws, 'dep_time'),
      arr_time: readWorksheetString(ws, 'arr_time'),
      dep_terminal: readWorksheetString(ws, 'dep_terminal'),
      arr_terminal: readWorksheetString(ws, 'arr_terminal'),
      airport_call: readWorksheetString(ws, 'airport_call'),
      check_in_open: readWorksheetString(ws, 'check_in_open'),
      confirmation: packetConfirmation(packet),
      travellers: people,
    }
    return { collection, block }
  }

  if (packet.category === 'car') {
    const base = emptyCarBlock(existingId)
    const block: CarBlock = {
      ...base,
      provider: readWorksheetString(ws, 'provider') || vendorLabel(packet),
      vehicle_class: readWorksheetString(ws, 'vehicle_class'),
      pickup_location: readWorksheetString(ws, 'pickup_location'),
      pickup_date: readWorksheetString(ws, 'pickup_date'),
      pickup_time: readWorksheetString(ws, 'pickup_time'),
      return_location: readWorksheetString(ws, 'return_location'),
      return_date: readWorksheetString(ws, 'return_date'),
      return_time: readWorksheetString(ws, 'return_time'),
      confirmation: packetConfirmation(packet),
      drivers: people,
      fuel: readWorksheetString(ws, 'fuel'),
      e_tag: readWorksheetString(ws, 'e_tag'),
      unlimited_km: unlimitedKm(ws),
      after_hours: readWorksheetString(ws, 'after_hours'),
      notes: readWorksheetString(ws, 'notes'),
    }
    return { collection, block }
  }

  if (packet.category === 'uber_transfer') {
    const base = emptyTransferBlock(existingId)
    const block: TransferBlock = {
      ...base,
      datetime: readWorksheetString(ws, 'datetime'),
      date: readWorksheetString(ws, 'date'),
      time: readWorksheetString(ws, 'time'),
      from: readWorksheetString(ws, 'from'),
      to: readWorksheetString(ws, 'to'),
      provider: readWorksheetString(ws, 'provider') || vendorLabel(packet),
      amount: transferAmount(ws),
      notes: readWorksheetString(ws, 'notes'),
    }
    return { collection, block }
  }

  const base = emptyFerryBlock(existingId)
  const block: FerryBlock = {
    ...base,
    operator: readWorksheetString(ws, 'operator') || vendorLabel(packet),
    dep_port: readWorksheetString(ws, 'dep_port'),
    arr_port: readWorksheetString(ws, 'arr_port'),
    dep_time: readWorksheetString(ws, 'dep_time'),
    arr_time: readWorksheetString(ws, 'arr_time'),
    confirmation: packetConfirmation(packet),
    travellers: people,
  }
  return { collection, block }
}

function confirmationOf(block: TravelBlockDraft['block']): string {
  if ('confirmation' in block) return String(block.confirmation ?? '').trim()
  return ''
}

export function findExistingTravelBlock(
  blocks: WorksheetTravelBlocks,
  packet: TravelScrapePacket,
): TravelBlockDraft['block'] | null {
  const collection = worksheetCollectionForCategory(packet.category)
  if (!collection) return null
  const list = blocks[collection] as TravelBlockDraft['block'][]
  const prior = packet.supersedes.prior_conf_id?.trim()
  const conf = packetConfirmation(packet)
  if (prior) {
    const hit = list.find(row => confirmationOf(row) === prior)
    if (hit) return hit
  }
  if (conf) {
    const hit = list.find(row => confirmationOf(row) === conf)
    if (hit) return hit
  }
  if (packet.category === 'flight') {
    const kind = worksheetFlightKind(packet.worksheet)
    const number = readWorksheetString(packet.worksheet, 'flight_number')
    const date = readWorksheetString(packet.worksheet, 'date')
    if (number && date) {
      const hit = list.find(row =>
        'kind' in row
        && row.kind === kind
        && row.flight_number === number
        && row.date === date,
      )
      if (hit) return hit
    }
  }
  return null
}

function overlayBlock(
  existing: TravelBlockDraft['block'],
  incoming: TravelBlockDraft['block'],
): TravelBlockDraft['block'] {
  if ('check_in_date' in existing && 'check_in_date' in incoming) {
    return {
      ...existing,
      name: pickStr(incoming.name, existing.name),
      address: pickStr(incoming.address, existing.address),
      phone: pickStr(incoming.phone, existing.phone),
      check_in_date: pickStr(incoming.check_in_date, existing.check_in_date),
      check_in_time: pickStr(incoming.check_in_time, existing.check_in_time),
      check_out_date: pickStr(incoming.check_out_date, existing.check_out_date),
      check_out_time: pickStr(incoming.check_out_time, existing.check_out_time),
      rooms: pickNum(incoming.rooms, existing.rooms),
      room_type: pickStr(incoming.room_type, existing.room_type),
      confirmation: pickStr(incoming.confirmation, existing.confirmation),
      pin: pickStr(incoming.pin, existing.pin),
      guests: mergePeople(existing.guests, incoming.guests),
      guests_tbc: incoming.guests_tbc || existing.guests_tbc,
      eta_notes: pickStr(incoming.eta_notes, existing.eta_notes),
    }
  }
  if ('flight_number' in existing && 'flight_number' in incoming) {
    return {
      ...existing,
      kind: incoming.kind || existing.kind,
      flight_number: pickStr(incoming.flight_number, existing.flight_number),
      date: pickStr(incoming.date, existing.date),
      airline: pickStr(incoming.airline, existing.airline),
      from: pickStr(incoming.from, existing.from),
      to: pickStr(incoming.to, existing.to),
      dep_time: pickStr(incoming.dep_time, existing.dep_time),
      arr_time: pickStr(incoming.arr_time, existing.arr_time),
      dep_terminal: pickStr(incoming.dep_terminal, existing.dep_terminal),
      arr_terminal: pickStr(incoming.arr_terminal, existing.arr_terminal),
      airport_call: pickStr(incoming.airport_call, existing.airport_call),
      check_in_open: pickStr(incoming.check_in_open, existing.check_in_open),
      confirmation: pickStr(incoming.confirmation, existing.confirmation),
      travellers: mergePeople(existing.travellers, incoming.travellers),
    }
  }
  if ('pickup_location' in existing && 'pickup_location' in incoming) {
    return {
      ...existing,
      provider: pickStr(incoming.provider, existing.provider),
      vehicle_class: pickStr(incoming.vehicle_class, existing.vehicle_class),
      pickup_location: pickStr(incoming.pickup_location, existing.pickup_location),
      pickup_date: pickStr(incoming.pickup_date, existing.pickup_date),
      pickup_time: pickStr(incoming.pickup_time, existing.pickup_time),
      return_location: pickStr(incoming.return_location, existing.return_location),
      return_date: pickStr(incoming.return_date, existing.return_date),
      return_time: pickStr(incoming.return_time, existing.return_time),
      confirmation: pickStr(incoming.confirmation, existing.confirmation),
      drivers: mergePeople(existing.drivers, incoming.drivers),
      fuel: pickStr(incoming.fuel, existing.fuel),
      e_tag: pickStr(incoming.e_tag, existing.e_tag),
      unlimited_km: pickBool(incoming.unlimited_km, existing.unlimited_km),
      after_hours: pickStr(incoming.after_hours, existing.after_hours),
      notes: pickStr(incoming.notes, existing.notes),
    }
  }
  if ('dep_port' in existing && 'dep_port' in incoming) {
    return {
      ...existing,
      operator: pickStr(incoming.operator, existing.operator),
      dep_port: pickStr(incoming.dep_port, existing.dep_port),
      arr_port: pickStr(incoming.arr_port, existing.arr_port),
      dep_time: pickStr(incoming.dep_time, existing.dep_time),
      arr_time: pickStr(incoming.arr_time, existing.arr_time),
      confirmation: pickStr(incoming.confirmation, existing.confirmation),
      travellers: mergePeople(existing.travellers, incoming.travellers),
    }
  }
  if ('provider' in existing && 'from' in existing && 'provider' in incoming && 'from' in incoming) {
    return {
      ...existing,
      datetime: pickStr(incoming.datetime, existing.datetime),
      date: pickStr(incoming.date, existing.date),
      time: pickStr(incoming.time, existing.time),
      from: pickStr(incoming.from, existing.from),
      to: pickStr(incoming.to, existing.to),
      provider: pickStr(incoming.provider, existing.provider),
      amount: pickNum(incoming.amount, existing.amount),
      notes: pickStr(incoming.notes, existing.notes),
    }
  }
  return incoming
}

export function mergeTravelBlocksFromPacket(opts: {
  existing: WorksheetTravelBlocks
  packet: TravelScrapePacket
  profiles?: ProfileDirectoryRow[]
}): { next: WorksheetTravelBlocks; action: 'create' | 'update' | 'none'; block_id: string | null } {
  const draft = draftTravelBlock(opts.packet, opts.profiles ?? [])
  if (!draft) {
    return { next: sanitizeTravelBlocks(opts.existing), action: 'none', block_id: null }
  }
  const found = findExistingTravelBlock(opts.existing, opts.packet)
  const incoming = found
    ? draftTravelBlock(opts.packet, opts.profiles ?? [], found.id)?.block ?? draft.block
    : draft.block
  const mergedBlock = found ? overlayBlock(found, incoming) : incoming
  const collection = draft.collection
  const list = [...(opts.existing[collection] as TravelBlockDraft['block'][])]
  if (found) {
    const idx = list.findIndex(row => row.id === found.id)
    if (idx >= 0) list[idx] = mergedBlock
    else list.push(mergedBlock)
  } else {
    list.push(mergedBlock)
  }
  const next = sanitizeTravelBlocks({
    ...opts.existing,
    [collection]: list,
  })
  return {
    next,
    action: found ? 'update' : 'create',
    block_id: mergedBlock.id,
  }
}

export function canApplyTravelDetails(opts: {
  packet: TravelScrapePacket
  targetRunId?: string | null
}): { apply: boolean; hold: 'ask' | 'watch' | null; reason: string } {
  const packet = opts.packet
  if (packet.details_action === 'watch') {
    return { apply: false, hold: 'watch', reason: 'details_action is watch — do not mutate Worksheet cards.' }
  }
  if (packet.details_action === 'ask') {
    return { apply: false, hold: 'ask', reason: 'details_action is ask — wait for a human before filling cards.' }
  }
  if (packet.confidence !== 'high') {
    return {
      apply: false,
      hold: 'ask',
      reason: `Confidence is ${packet.confidence} — Worksheet details apply only when confidence is high.`,
    }
  }
  if (packetHasBlockingRunFlag(packet)) {
    return {
      apply: false,
      hold: 'ask',
      reason: 'Blocking run-match flag (run_ambiguous / run_unknown) — will not attach details.',
    }
  }
  const matchedRun = packet.run_match.run_id
  const target = opts.targetRunId?.trim()
  if (matchedRun && target && matchedRun.toLowerCase() !== target.toLowerCase()) {
    return {
      apply: false,
      hold: 'ask',
      reason: 'Packet run_match.run_id does not match this BOOKED run.',
    }
  }
  if (packet.run_match.ambiguous_candidates.length > 1 && !matchedRun) {
    return {
      apply: false,
      hold: 'ask',
      reason: 'Packet lists ambiguous run candidates and no chosen run_id.',
    }
  }
  return { apply: true, hold: null, reason: 'details_action auto, confidence high, no blocking flags.' }
}

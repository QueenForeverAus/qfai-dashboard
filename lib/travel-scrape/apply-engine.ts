/**
 * Pure travel-scrape apply planner.
 * Worksheet cards + checklist follow details policy.
 * Money/PAID on Advancing never auto — explicit Gareth confirm only.
 * Never writes locked Run Costings.
 *
 * apply_env=production is accepted on the real prod deploy (and staging
 * packets stay valid). Unset TRAVEL_SCRAPE_APPLY_SECRET is the machine-auth
 * kill switch — this planner does not refuse production packets.
 *
 * Shared `money_field_id` is intentional: CostFieldsTab keeps one defined
 * run field `accommodation` with expandable `entries[]`. Do not invent
 * extra DEFINED_RUN_COST_FIELDS keys. Hotel nights are entry lines on that
 * row (upsert by confirmation_id, else city+night_date) — never replace the
 * whole entries array with a single night. PAID is per-entry.
 *
 * Non-accom (flights, car, etc.) upserts once per confirmation_id on the
 * shared field. A blank confirmation refuses the money write so a second
 * confirm cannot invent a confirmation_id=null duplicate beside the PNR total.
 *
 * Apply responses identify the night with `money_field_id` (the shared
 * accommodation row) + `money_entry_id` (this night’s entry uuid) +
 * `city_night_key` (`maitland:2026-09-17` or the hotel confirmation).
 */

import { KNOWN_ITEM_KEYS } from '../advancement-checklist.ts'
import { isBookedBookingStatus } from '../booked-cost-freeze.ts'
import {
  DEFINED_RUN_COST_FIELDS,
  entriesSum,
  normalizeEntries,
  type CostEntry,
} from '../cost-fields.ts'
import { ADVANCING_WRITES_BACK_TO_COSTING } from '../run-advancing.ts'
import {
  parseTravelBlocks,
  type ProfileDirectoryRow,
  type WorksheetTravelBlocks,
} from '../worksheet-travel-blocks.ts'
import {
  parseTravelScrapePacket,
  readWorksheetString,
  resolveTravelScrapeChecklistItemKey,
  type TravelScrapeLineHint,
  type TravelScrapePacket,
} from './packet.ts'
import {
  canApplyTravelDetails,
  formatTravelScrapeSourceNote,
  mergeTravelBlocksFromPacket,
  packetConfirmation,
  vendorLabel,
  worksheetFlightFields,
  worksheetHotelFields,
} from './worksheet.ts'

export const TRAVEL_SCRAPE_APPLY_WRITES_COST_FIELDS = false as const
export const TRAVEL_SCRAPE_WRITES_BACK_TO_COSTING = ADVANCING_WRITES_BACK_TO_COSTING

export const TRAVEL_SCRAPE_APPLY_TABLES = [
  'run_advancing_workspaces',
  'advancing_cost_fields',
  'advancement_items',
  'audit_log',
] as const

export type TravelScrapeApplyTable = (typeof TRAVEL_SCRAPE_APPLY_TABLES)[number]

export const AUDIT_FIELD_TRAVEL_SCRAPE_APPLY = 'Travel scrape apply'

export const TRAVEL_SCRAPE_PROPOSED_ERROR =
  'Never attach a travel scrape on a proposed-only run. BOOK the run first so Run Advancing exists.'

export const TRAVEL_SCRAPE_NOT_BOOKED_ERROR =
  'Travel scrape apply is only available on BOOKED runs with an active Advancing workspace.'

export const TRAVEL_SCRAPE_NO_WORKSPACE_ERROR =
  'No active Run Advancing workspace. BOOK the run to copy the cost sheet, then apply here.'

export const TRAVEL_SCRAPE_NON_ACCOM_CONFIRMATION_ERROR =
  'Non-accommodation money requires confirmation_id (PNR / booking ref). Refusing write so a blank confirmation cannot create a second full-fare charge.'

export const LINE_HINT_TO_FIELD_KEY: Record<TravelScrapeLineHint, string | null> = {
  accom_night: 'accommodation',
  flights: 'flights',
  car_hire: 'ground_transport',
  ferry: 'ground_transport',
  uber: 'ground_transport',
  band_meals: 'food_basics',
  fuel: 'ground_transport',
  other: null,
}

export type TravelScrapeApplyGate = {
  bookingStatus: string | null | undefined
  hasActiveWorkspace: boolean
  targetRunId?: string | null
}

export type TravelScrapeMoneyConfirm = {
  confirmMoney?: boolean
  moneyConfirmedBy?: string | null
}

export type TravelScrapeDetailsPlan = {
  will_apply: boolean
  action: 'applied' | 'ask' | 'watch' | 'blocked' | 'none'
  reason: string
  merge_action: 'create' | 'update' | 'none'
  block_id: string | null
}

export type TravelScrapeChecklistPlan = {
  will_apply: boolean
  item_keys: string[]
  skipped_keys: string[]
  source_note: string
}

export type TravelScrapeMoneyPlan = {
  will_write: boolean
  action: 'written' | 'confirm_needed' | 'none' | 'skipped'
  reason: string
  field_key: string | null
  field_label: string | null
  amount: number | null
  writes_paid: boolean
  writes_confirmed: boolean
  next_entries: CostEntry[]
  field_value: number
  /** Entry uuid for this night / charge. Distinct per hotel night. */
  money_entry_id: string | null
  /**
   * Stable night identity for Comms/Lead: hotel confirmation when present,
   * else `normalizedCity:YYYY-MM-DD` (e.g. maitland:2026-09-17).
   */
  city_night_key: string | null
}

/** Apply JSON `money` object — shared field id plus per-night identity. */
export type TravelScrapeApplyMoneyResponse = {
  action: TravelScrapeMoneyPlan['action']
  reason: string
  field_key: string | null
  amount: number | null
  writes_paid: boolean
  field_id: string | null
  money_field_id: string | null
  money_entry_id: string | null
  city_night_key: string | null
}

export type TravelScrapeApplyPlan = {
  ok: boolean
  error: string | null
  schema_version: 'travel-scrape-packet-v1'
  packet: TravelScrapePacket | null
  details: TravelScrapeDetailsPlan
  checklist: TravelScrapeChecklistPlan
  money: TravelScrapeMoneyPlan
  next_travel_blocks: WorksheetTravelBlocks
  writes_cost_fields: false
}

function newEntryId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `tscrape-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function assertTravelScrapeApplyTable(table: string): asserts table is TravelScrapeApplyTable {
  if (table === 'cost_fields') {
    throw new Error('Travel scrape apply must never write cost_fields')
  }
  if (!(TRAVEL_SCRAPE_APPLY_TABLES as readonly string[]).includes(table)) {
    throw new Error(`Travel scrape apply cannot write table ${table}`)
  }
}

export function travelScrapeBlockedReason(opts: TravelScrapeApplyGate & { applyEnv?: string }): string | null {
  // apply_env is packet metadata (staging | production). It is not a host
  // kill switch — production packets are accepted on the real prod deploy.
  const status = String(opts.bookingStatus ?? '').trim().toLowerCase()
  if (status === 'proposed') return TRAVEL_SCRAPE_PROPOSED_ERROR
  if (!isBookedBookingStatus(opts.bookingStatus)) return TRAVEL_SCRAPE_NOT_BOOKED_ERROR
  if (!opts.hasActiveWorkspace) return TRAVEL_SCRAPE_NO_WORKSPACE_ERROR
  return null
}

export function isTravelScrapeMoneyConfirmed(opts: TravelScrapeMoneyConfirm): boolean {
  if (opts.confirmMoney === true) return true
  return Boolean(opts.moneyConfirmedBy && opts.moneyConfirmedBy.trim())
}

function emptyDetails(): TravelScrapeDetailsPlan {
  return {
    will_apply: false,
    action: 'blocked',
    reason: '',
    merge_action: 'none',
    block_id: null,
  }
}

function emptyChecklist(): TravelScrapeChecklistPlan {
  return { will_apply: false, item_keys: [], skipped_keys: [], source_note: '' }
}

function emptyMoney(
  existingEntries: unknown,
  identity?: { money_entry_id?: string | null; city_night_key?: string | null },
): TravelScrapeMoneyPlan {
  const next = normalizeEntries(existingEntries) ?? []
  return {
    will_write: false,
    action: 'none',
    reason: '',
    field_key: null,
    field_label: null,
    amount: null,
    writes_paid: false,
    writes_confirmed: false,
    next_entries: next,
    field_value: entriesSum(next),
    money_entry_id: identity?.money_entry_id ?? null,
    city_night_key: identity?.city_night_key ?? null,
  }
}

function emptyPlan(error: string, extras?: Partial<TravelScrapeApplyPlan>): TravelScrapeApplyPlan {
  return {
    ok: false,
    error,
    schema_version: 'travel-scrape-packet-v1',
    packet: extras?.packet ?? null,
    details: extras?.details ?? emptyDetails(),
    checklist: extras?.checklist ?? emptyChecklist(),
    money: extras?.money ?? emptyMoney(undefined),
    next_travel_blocks: extras?.next_travel_blocks ?? parseTravelBlocks(null),
    writes_cost_fields: false,
  }
}

function fieldDef(fieldKey: string) {
  return DEFINED_RUN_COST_FIELDS.find(def => def.key === fieldKey) ?? null
}

function gstIncluded(packet: TravelScrapePacket): boolean {
  if (packet.money.gst === 'ex') return false
  return true
}

function moneyDescription(packet: TravelScrapePacket): string {
  const ws = packet.worksheet
  if (packet.category === 'hotel') {
    const hotel = worksheetHotelFields(ws)
    const city = hotel.city || readWorksheetString(ws, 'name') || vendorLabel(packet)
    const night = hotel.check_in_date
    return night ? `${city} — ${night}` : city
  }
  if (packet.category === 'flight') {
    const flight = worksheetFlightFields(ws)
    const number = flight.flight_number
    const from = readWorksheetString(ws, 'from')
    const to = readWorksheetString(ws, 'to')
    const airline = readWorksheetString(ws, 'airline')
    if (number && from && to) return `${airline || 'Flight'} ${number} ${from}→${to}`
    if (number) return `${airline || 'Flight'} ${number}`
    return [airline, from, to].filter(Boolean).join(' ') || 'Flight'
  }
  if (packet.category === 'car') {
    return `${readWorksheetString(ws, 'provider') || vendorLabel(packet)} car hire`
  }
  if (packet.category === 'ferry') {
    return `${readWorksheetString(ws, 'operator') || vendorLabel(packet)} ferry`
  }
  if (packet.category === 'uber_transfer') {
    const from = readWorksheetString(ws, 'from')
    const to = readWorksheetString(ws, 'to')
    return from && to ? `Uber ${from}→${to}` : vendorLabel(packet)
  }
  if (packet.category === 'uber_eats') return 'Uber Eats — band meals'
  if (packet.category === 'fuel') return 'Fuel'
  return vendorLabel(packet)
}

function moneyNightDate(packet: TravelScrapePacket): string | null {
  if (packet.money.advancing_line_hint !== 'accom_night') return null
  const date = worksheetHotelFields(packet.worksheet).check_in_date
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null
}

function moneyCity(packet: TravelScrapePacket): string | null {
  if (packet.money.advancing_line_hint !== 'accom_night') return null
  const hotel = worksheetHotelFields(packet.worksheet)
  return hotel.city
    || readWorksheetString(packet.worksheet, 'name')
    || null
}

/** Soft city compare: Thornton≠Maitland still share a night; Port Macquarie ≡ PortMacquarie. */
export function normalizeAccomMoneyCity(value: string | null | undefined): string {
  return String(value ?? '').toLowerCase().replace(/[\s_]+/g, '')
}

/**
 * Stable night identity for the apply response.
 * Prefer hotel confirmation; else `city:night_date` (maitland:2026-09-17).
 */
export function formatTravelScrapeCityNightKey(opts: {
  confirmation?: string | null
  city?: string | null
  night?: string | null
}): string | null {
  const confirmation = String(opts.confirmation ?? '').trim()
  if (confirmation) return confirmation
  const city = normalizeAccomMoneyCity(opts.city)
  const night = String(opts.night ?? '').trim()
  if (city && /^\d{4}-\d{2}-\d{2}$/.test(night)) return `${city}:${night}`
  return null
}

export function formatTravelScrapeApplyMoneyResponse(opts: {
  plan: TravelScrapeMoneyPlan
  moneyFieldId: string | null
}): TravelScrapeApplyMoneyResponse {
  return {
    action: opts.plan.action,
    reason: opts.plan.reason,
    field_key: opts.plan.field_key,
    amount: opts.plan.amount,
    writes_paid: opts.plan.writes_paid,
    field_id: opts.moneyFieldId,
    money_field_id: opts.moneyFieldId,
    money_entry_id: opts.plan.money_entry_id,
    city_night_key: opts.plan.city_night_key,
  }
}

function accomCitiesSoftEqual(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  const a = normalizeAccomMoneyCity(left)
  const b = normalizeAccomMoneyCity(right)
  return Boolean(a && b && a === b)
}

function isMoneyRefund(entry: CostEntry): boolean {
  return entry.receipt_kind === 'refund'
}

/**
 * One Advancing accommodation charge per stay night.
 * Match: confirmation_id → supersedes.prior_conf_id → same night_date
 * (optional soft city pick among same-night leftovers). Refunds are never matched.
 */
export function findAccomNightMoneyEntry(opts: {
  existing: CostEntry[]
  confirmation: string
  priorConfId?: string | null
  night: string | null
  city: string | null
}): CostEntry | null {
  const charges = opts.existing.filter(entry => !isMoneyRefund(entry))

  if (opts.confirmation) {
    const byConf = charges.find(entry => entry.confirmation_id === opts.confirmation)
    if (byConf) return byConf
  }

  const prior = opts.priorConfId?.trim()
  if (prior) {
    const byPrior = charges.find(entry => entry.confirmation_id === prior)
    if (byPrior) return byPrior
  }

  if (!opts.night) return null
  const sameNight = charges.filter(entry => entry.night_date === opts.night)
  if (sameNight.length === 0) return null
  if (opts.city) {
    const byCity = sameNight.find(entry => accomCitiesSoftEqual(entry.city, opts.city))
    if (byCity) return byCity
  }
  return sameNight[0] ?? null
}

/** Upsert key for flights/car/etc. — one charge per confirmation_id on the shared field. */
function findNonAccomMoneyEntry(existing: CostEntry[], confirmation: string): CostEntry | null {
  if (!confirmation) return null
  return existing.find(entry =>
    !isMoneyRefund(entry) && entry.confirmation_id === confirmation,
  ) ?? null
}

function nextMoneyEntries(opts: {
  existing: CostEntry[]
  found: CostEntry | null
  entry: CostEntry
  hint: TravelScrapeLineHint
  night: string | null
}): CostEntry[] {
  // Upsert one night — keep every other entry. Never replace entries[] with [this night].
  const next = opts.found
    ? opts.existing.map(row => row.id === opts.found!.id ? opts.entry : row)
    : [...opts.existing, opts.entry]

  if (opts.hint !== 'accom_night' || !opts.night) return next

  // One charge per night — drop leftover demo + glance duplicates. Keep refunds.
  return next.filter(row =>
    row.id === opts.entry.id
    || isMoneyRefund(row)
    || row.night_date !== opts.night,
  )
}

function moneyNightIdentity(opts: {
  packet: TravelScrapePacket
  existing: CostEntry[]
  written?: CostEntry | null
}): { money_entry_id: string | null; city_night_key: string | null } {
  const confirmation = packetConfirmation(opts.packet)
  const night = moneyNightDate(opts.packet)
  const city = moneyCity(opts.packet)
  const hint = opts.packet.money.advancing_line_hint
  const cityNightKey = hint === 'accom_night'
    ? formatTravelScrapeCityNightKey({ confirmation, city, night })
    : (confirmation || null)

  if (opts.written) {
    return { money_entry_id: opts.written.id, city_night_key: cityNightKey }
  }

  const found = hint === 'accom_night'
    ? findAccomNightMoneyEntry({
      existing: opts.existing,
      confirmation,
      priorConfId: opts.packet.supersedes.prior_conf_id,
      night,
      city,
    })
    : findNonAccomMoneyEntry(opts.existing, confirmation)

  return { money_entry_id: found?.id ?? null, city_night_key: cityNightKey }
}

export function planTravelScrapeMoney(opts: {
  packet: TravelScrapePacket
  existingEntries?: unknown
  confirm: TravelScrapeMoneyConfirm
}): TravelScrapeMoneyPlan {
  const existing = normalizeEntries(opts.existingEntries) ?? []
  const amount = opts.packet.money.amount
  const hint = opts.packet.money.advancing_line_hint
  const fieldKey = LINE_HINT_TO_FIELD_KEY[hint]
  const def = fieldKey ? fieldDef(fieldKey) : null
  const pendingIdentity = moneyNightIdentity({ packet: opts.packet, existing })

  if (opts.packet.money_action === 'none') {
    return {
      ...emptyMoney(existing, pendingIdentity),
      action: 'none',
      reason: 'money_action is none — Advancing amount/PAID left untouched.',
    }
  }

  if (amount == null) {
    return {
      ...emptyMoney(existing, pendingIdentity),
      action: 'skipped',
      reason: 'Packet money.amount is empty — nothing to write on Advancing.',
    }
  }

  if (!fieldKey || !def) {
    return {
      ...emptyMoney(existing, pendingIdentity),
      action: 'skipped',
      amount,
      reason: `advancing_line_hint ${hint} is not mapped to a Run Advancing field (month-one).`,
    }
  }

  const confirmation = packetConfirmation(opts.packet)
  if (hint !== 'accom_night' && !confirmation) {
    return {
      ...emptyMoney(existing, pendingIdentity),
      action: 'skipped',
      field_key: fieldKey,
      field_label: def.label,
      amount,
      reason: TRAVEL_SCRAPE_NON_ACCOM_CONFIRMATION_ERROR,
    }
  }

  if (!isTravelScrapeMoneyConfirmed(opts.confirm)) {
    return {
      will_write: false,
      action: 'confirm_needed',
      reason: 'Money/PAID is never auto. Pass confirm_money=true or money_confirmed_by to write Advancing lines.',
      field_key: fieldKey,
      field_label: def.label,
      amount,
      writes_paid: opts.packet.money.status_if_applied === 'PAID',
      writes_confirmed: opts.packet.money.status_if_applied === 'PAID'
        || opts.packet.money.status_if_applied === 'CONFIRMED',
      next_entries: existing,
      field_value: entriesSum(existing),
      money_entry_id: pendingIdentity.money_entry_id,
      city_night_key: pendingIdentity.city_night_key,
    }
  }

  const writesPaid = opts.packet.money.status_if_applied === 'PAID'
  const writesConfirmed = writesPaid || opts.packet.money.status_if_applied === 'CONFIRMED'
  const night = moneyNightDate(opts.packet)
  const city = moneyCity(opts.packet)
  const sourceNote = formatTravelScrapeSourceNote(opts.packet)
  const confirmedBy = opts.confirm.moneyConfirmedBy?.trim()

  const found = hint === 'accom_night'
    ? findAccomNightMoneyEntry({
      existing,
      confirmation,
      priorConfId: opts.packet.supersedes.prior_conf_id,
      night,
      city,
    })
    : findNonAccomMoneyEntry(existing, confirmation)

  const entry: CostEntry = {
    id: found?.id ?? newEntryId(),
    description: moneyDescription(opts.packet),
    notes: [sourceNote, confirmedBy ? `Confirmed by ${confirmedBy}` : '']
      .filter(Boolean)
      .join(' — '),
    amount,
    gst_included: gstIncluded(opts.packet),
    confirmed: writesConfirmed,
    paid: writesPaid,
    paid_at: writesPaid ? (found?.paid_at ?? new Date().toISOString()) : null,
    night_date: night,
    city,
    vendor: vendorLabel(opts.packet),
    confirmation_id: confirmation || null,
    receipt_kind: 'charge',
  }

  const next = nextMoneyEntries({ existing, found, entry, hint, night })
  const identity = moneyNightIdentity({ packet: opts.packet, existing, written: entry })

  return {
    will_write: true,
    action: 'written',
    reason: confirmedBy
      ? `Gareth-confirm hook set (money_confirmed_by=${confirmedBy}).`
      : 'Gareth-confirm hook set (confirm_money=true).',
    field_key: fieldKey,
    field_label: def.label,
    amount,
    writes_paid: writesPaid,
    writes_confirmed: writesConfirmed,
    next_entries: next,
    field_value: entriesSum(next),
    money_entry_id: identity.money_entry_id,
    city_night_key: identity.city_night_key,
  }
}

function planChecklist(packet: TravelScrapePacket, detailsWillApply: boolean): TravelScrapeChecklistPlan {
  const sourceNote = formatTravelScrapeSourceNote(packet)
  const itemKeys: string[] = []
  const skipped: string[] = []
  for (const raw of packet.checklist.items_to_tick) {
    const key = resolveTravelScrapeChecklistItemKey(raw)
    if (KNOWN_ITEM_KEYS.has(key)) {
      if (!itemKeys.includes(key)) itemKeys.push(key)
    } else {
      skipped.push(raw)
    }
  }
  return {
    will_apply: detailsWillApply && itemKeys.length > 0,
    item_keys: detailsWillApply ? itemKeys : [],
    skipped_keys: skipped,
    source_note: sourceNote,
  }
}

export type TravelScrapeApplyInput = TravelScrapeApplyGate & TravelScrapeMoneyConfirm & {
  packet: unknown
  existingTravelBlocks?: unknown
  existingEntries?: unknown
  profiles?: ProfileDirectoryRow[]
}

export function planTravelScrapeApply(input: TravelScrapeApplyInput): TravelScrapeApplyPlan {
  const parsed = parseTravelScrapePacket(input.packet)
  if (!parsed.ok) return emptyPlan(parsed.error)

  const gate = travelScrapeBlockedReason({
    bookingStatus: input.bookingStatus,
    hasActiveWorkspace: input.hasActiveWorkspace,
    applyEnv: parsed.packet.apply_env,
  })
  if (gate) {
    return emptyPlan(gate, { packet: parsed.packet })
  }

  const existingBlocks = parseTravelBlocks(input.existingTravelBlocks)
  const detailsGate = canApplyTravelDetails({
    packet: parsed.packet,
    targetRunId: input.targetRunId,
  })

  let nextBlocks = existingBlocks
  let mergeAction: TravelScrapeDetailsPlan['merge_action'] = 'none'
  let blockId: string | null = null
  if (detailsGate.apply) {
    const merged = mergeTravelBlocksFromPacket({
      existing: existingBlocks,
      packet: parsed.packet,
      profiles: input.profiles,
    })
    nextBlocks = merged.next
    mergeAction = merged.action
    blockId = merged.block_id
  }

  const details: TravelScrapeDetailsPlan = {
    will_apply: detailsGate.apply,
    action: detailsGate.apply ? 'applied' : (detailsGate.hold ?? 'ask'),
    reason: detailsGate.reason,
    merge_action: mergeAction,
    block_id: blockId,
  }

  const money = planTravelScrapeMoney({
    packet: parsed.packet,
    existingEntries: input.existingEntries,
    confirm: {
      confirmMoney: input.confirmMoney,
      moneyConfirmedBy: input.moneyConfirmedBy,
    },
  })

  return {
    ok: true,
    error: null,
    schema_version: 'travel-scrape-packet-v1',
    packet: parsed.packet,
    details,
    checklist: planChecklist(parsed.packet, details.will_apply),
    money,
    next_travel_blocks: nextBlocks,
    writes_cost_fields: false,
  }
}

export function formatTravelScrapeApplyAuditCopy(opts: {
  actorName: string
  runCode: string
  category: string
  detailsApplied: boolean
  moneyWritten: boolean
}): { fieldName: string; oldValue: string; newValue: string } {
  const actor = opts.actorName.trim() || 'Someone'
  const details = opts.detailsApplied ? 'Worksheet travel card' : 'no Worksheet mutate'
  const money = opts.moneyWritten ? 'Advancing money confirmed' : 'money left pending'
  return {
    fieldName: AUDIT_FIELD_TRAVEL_SCRAPE_APPLY,
    oldValue: 'no travel scrape applied',
    newValue:
      `${actor} applied travel-scrape-packet-v1 (${opts.category}) on ${opts.runCode} `
      + `(${details}; ${money}; checklist source note on the item only). Costing was not written.`,
  }
}

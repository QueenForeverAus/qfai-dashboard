/**
 * Tour Desk v2 Phase 3 — pure Apply receipt extract engine.
 *
 * Per-night accommodation model (locked):
 *   One run-level `accommodation` advancing_cost_fields row (same twin as
 *   Costing copy). Night/city lines are CostEntry rows on that field, keyed
 *   by `night_date` + city — not extra field_key rows, not a rolled run total.
 *   Preserves BOOKED Costing freeze / copy uniqueness
 *   (`advancing_cost_fields_workspace_line_idx` is workspace + show_id + field_key).
 *
 * Writes planned here never include `cost_fields`. Persist must honour that.
 *
 * Hotel booked checklist: one PAID night is an explicit booked fact → tick
 * `hotel_confirmed` via the P2 helper. There is no separate “all names” item.
 */

import { isBookedBookingStatus } from '../booked-cost-freeze.ts'
import {
  entriesSum,
  normalizeEntries,
  type CostEntry,
} from '../cost-fields.ts'
import { formatDateShortAU } from '../dates.ts'
import { addDaysIso, stayNights } from './dates.ts'
import {
  attachNightToShow,
  citiesRelated,
  nightsInItineraryWindow,
  showLabel,
  type ReceiptShowLike,
} from './itinerary.ts'
import {
  isHotelReceiptPacket,
  parseReceiptExtractPacket,
  type HotelReceiptPacket,
  type ReceiptExtractPacket,
} from './packet.ts'
import { appendUniqueNote, formatBookingConfirmSource, formatHotelWorksheetLine } from './source.ts'

export const RECEIPT_APPLY_WRITES_COST_FIELDS = false as const

export const RECEIPT_APPLY_TABLES = [
  'advancing_cost_fields',
  'shows',
  'runs',
  'advancement_items',
  'audit_log',
] as const

export type ReceiptApplyTable = (typeof RECEIPT_APPLY_TABLES)[number]

export const AUDIT_FIELD_RECEIPT_EXTRACT_APPLY = 'Receipt extract apply'

export const RECEIPT_APPLY_PROPOSED_ERROR =
  'Never apply a receipt extract on a proposed-only run. BOOK the run first so Run Advancing exists.'

export const RECEIPT_APPLY_NOT_BOOKED_ERROR =
  'Receipt apply is only available on BOOKED runs with an active Advancing workspace.'

export const RECEIPT_APPLY_NO_WORKSPACE_ERROR =
  'No active Run Advancing workspace. BOOK the run to copy the cost sheet, then apply here.'

export const RECEIPT_APPLY_LOW_CONFIDENCE_ERROR =
  'Low confidence match — will not apply. Hotel nights fall outside this run’s itinerary window (first show minus one day through last show).'

export const RECEIPT_APPLY_KIND_ERROR =
  'This apply path is hotel-only. Flight / car packets are typed stubs — email scrape will wire them later.'

export type ReceiptApplyConfidence = 'high' | 'medium' | 'low'

export type ReceiptNightAction = 'update' | 'create' | 'keep_paid' | 'refund'

export type ReceiptNightPlan = {
  date: string
  city: string
  vendor: string
  amount: number
  action: ReceiptNightAction
  entry_id: string
  attached_show_id: string | null
  attached_show_label: string | null
  source: string
  match_reason: string
}

export type ReceiptWorksheetPatch = {
  show_id: string | null
  hotel_notes: string
  hotels_overview_notes: string
}

export type ReceiptApplyGate = {
  bookingStatus: string | null | undefined
  hasActiveWorkspace: boolean
}

export type ReceiptApplyInput = ReceiptApplyGate & {
  packet: unknown
  existingEntries?: unknown
  shows: ReceiptShowLike[]
  hotelsOverviewNotes?: string | null
}

export type ReceiptApplyPlan = {
  ok: boolean
  error: string | null
  confidence: ReceiptApplyConfidence | null
  packet: ReceiptExtractPacket | null
  nights: ReceiptNightPlan[]
  next_entries: CostEntry[]
  field_value: number
  field_source: string | null
  worksheet: ReceiptWorksheetPatch
  will_tick_hotel_confirmed: boolean
  writes_cost_fields: false
}

function newEntryId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `rcpt-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function assertReceiptApplyTable(table: string): asserts table is ReceiptApplyTable {
  if (table === 'cost_fields') {
    throw new Error('Receipt apply must never write cost_fields')
  }
  if (!(RECEIPT_APPLY_TABLES as readonly string[]).includes(table)) {
    throw new Error(`Receipt apply cannot write table ${table}`)
  }
}

export function receiptApplyBlockedReason(opts: ReceiptApplyGate): string | null {
  const status = String(opts.bookingStatus ?? '').trim().toLowerCase()
  if (status === 'proposed') return RECEIPT_APPLY_PROPOSED_ERROR
  if (!isBookedBookingStatus(opts.bookingStatus)) return RECEIPT_APPLY_NOT_BOOKED_ERROR
  if (!opts.hasActiveWorkspace) return RECEIPT_APPLY_NO_WORKSPACE_ERROR
  return null
}

function emptyPlan(error: string, extras?: Partial<ReceiptApplyPlan>): ReceiptApplyPlan {
  return {
    ok: false,
    error,
    confidence: extras?.confidence ?? null,
    packet: extras?.packet ?? null,
    nights: extras?.nights ?? [],
    next_entries: extras?.next_entries ?? [],
    field_value: extras?.field_value ?? 0,
    field_source: extras?.field_source ?? null,
    worksheet: extras?.worksheet ?? { show_id: null, hotel_notes: '', hotels_overview_notes: '' },
    will_tick_hotel_confirmed: false,
    writes_cost_fields: false,
  }
}

function stayCity(packet: HotelReceiptPacket): string {
  return packet.locality || packet.city || packet.vendor
}

function nightAmount(packet: HotelReceiptPacket, nightCount: number): number {
  if (nightCount <= 1) return packet.total_paid
  return Math.round((packet.total_paid / nightCount) * 100) / 100
}

function isRolledPlaceholder(entries: CostEntry[]): boolean {
  if (entries.length !== 1) return false
  const entry = entries[0]
  if (entry.paid || entry.night_date) return false
  const desc = entry.description.toLowerCase()
  return desc === 'accommodation' || desc === 'estimate' || !/\d{4}-\d{2}-\d{2}|night|pre-show/i.test(entry.description)
}

function findChargeForRefund(entries: CostEntry[], packet: HotelReceiptPacket): CostEntry | null {
  return entries.find(entry =>
    entry.receipt_kind !== 'refund'
    && (
      (entry.confirmation_id && entry.confirmation_id === packet.confirmation_id)
      || (entry.vendor && entry.vendor.toLowerCase() === packet.vendor.toLowerCase() && entry.night_date === packet.check_in)
    ),
  ) ?? null
}

function findExistingNightEntry(
  entries: CostEntry[],
  night: string,
  city: string,
  isPreShowNight: boolean,
): CostEntry | null {
  const byDate = entries.find(e => e.night_date === night && e.receipt_kind !== 'refund')
  if (byDate) return byDate

  const unpaid = entries.filter(e => !e.paid && e.receipt_kind !== 'refund')
  if (isPreShowNight) {
    const pre = unpaid.find(e => /pre-show/i.test(e.description) && (
      !e.city || citiesRelated(e.city, city) || citiesRelated(e.description, city)
    ))
    if (pre) return pre
    const anyPre = unpaid.find(e => /pre-show/i.test(e.description))
    if (anyPre) return anyPre
  }

  const byCity = unpaid.find(e =>
    citiesRelated(e.city, city) || citiesRelated(e.description, city),
  )
  if (byCity) return byCity

  if (isRolledPlaceholder(entries)) return entries[0]
  return null
}

function hotelNightEntry(opts: {
  existing?: CostEntry | null
  night: string
  city: string
  packet: HotelReceiptPacket
  amount: number
  source: string
  receiptKind: 'charge' | 'refund'
}): CostEntry {
  const dateLabel = formatDateShortAU(opts.night)
  const description = opts.receiptKind === 'refund'
    ? `Refund — ${opts.city} — ${dateLabel}`
    : `${opts.city} — ${dateLabel}`
  const guests = opts.packet.guest_names?.length
    ? `Guests: ${opts.packet.guest_names.join(', ')}`
    : ''
  const notes = [opts.source, opts.packet.address, guests, opts.packet.notes]
    .filter(Boolean)
    .join(' — ')
  const id = opts.existing && opts.receiptKind !== 'refund' ? opts.existing.id : newEntryId()
  return {
    id,
    description,
    notes,
    amount: opts.amount,
    gst_included: true,
    confirmed: true,
    paid: opts.packet.paid || opts.receiptKind === 'refund',
    paid_at: opts.packet.paid || opts.receiptKind === 'refund'
      ? (opts.existing?.paid_at ?? new Date().toISOString())
      : null,
    night_date: opts.night,
    city: opts.city,
    vendor: opts.packet.vendor,
    confirmation_id: opts.packet.confirmation_id,
    receipt_kind: opts.receiptKind,
  }
}

function confidenceForHotel(
  inWindow: string[],
  nights: string[],
  city: string,
  shows: ReceiptShowLike[],
): ReceiptApplyConfidence {
  if (nights.length === 0 || inWindow.length === 0) return 'low'
  if (inWindow.length < nights.length) return 'low'
  const cityHit = shows.some(show => citiesRelated(city, show.venue_city))
  return cityHit ? 'high' : 'medium'
}

export function planReceiptApply(input: ReceiptApplyInput): ReceiptApplyPlan {
  const gate = receiptApplyBlockedReason(input)
  if (gate) return emptyPlan(gate)

  const parsed = parseReceiptExtractPacket(input.packet)
  if (!parsed.ok) return emptyPlan(parsed.error)

  if (!isHotelReceiptPacket(parsed.packet)) {
    return emptyPlan(RECEIPT_APPLY_KIND_ERROR, { packet: parsed.packet, confidence: 'low' })
  }

  const packet = parsed.packet
  const city = stayCity(packet)
  const nights = stayNights(packet.check_in, packet.check_out)
  if (nights.length === 0) {
    return emptyPlan('Hotel packet has no stay nights.', { packet, confidence: 'low' })
  }

  const { inWindow } = nightsInItineraryWindow(nights, input.shows)
  const confidence = confidenceForHotel(inWindow, nights, city, input.shows)
  if (confidence === 'low') {
    return emptyPlan(RECEIPT_APPLY_LOW_CONFIDENCE_ERROR, { packet, confidence })
  }

  const existing = normalizeEntries(input.existingEntries) ?? []
  const firstShow = [...input.shows]
    .filter(s => s.show_date)
    .sort((a, b) => String(a.show_date).localeCompare(String(b.show_date)))[0]
  const preShowNightDate = firstShow?.show_date ? addDaysIso(firstShow.show_date, -1) : null

  const chargeKind = packet.charge_kind === 'refund' ? 'refund' : 'charge'
  const perNight = nightAmount(packet, nights.length)
  const source = formatBookingConfirmSource({
    vendor: packet.vendor,
    confirmationId: packet.confirmation_id,
    dateIso: packet.check_in,
  })

  let next = existing.slice()
  const nightPlans: ReceiptNightPlan[] = []
  let attachedShow: ReceiptShowLike | null = null

  if (chargeKind === 'refund') {
    const charge = findChargeForRefund(next, packet)
    const refundEntry = hotelNightEntry({
      night: packet.check_in,
      city,
      packet,
      amount: -Math.abs(packet.total_paid),
      source,
      receiptKind: 'refund',
    })
    next = [...next, refundEntry]
    attachedShow = attachNightToShow(packet.check_in, city, input.shows)
    nightPlans.push({
      date: packet.check_in,
      city,
      vendor: packet.vendor,
      amount: refundEntry.amount,
      action: 'refund',
      entry_id: refundEntry.id,
      attached_show_id: attachedShow?.id ?? null,
      attached_show_label: showLabel(attachedShow),
      source,
      match_reason: charge
        ? `Refund recorded beside existing charge ${charge.confirmation_id ?? charge.id} (charge kept).`
        : 'Refund recorded; original charge not found on this field (charge not invented or erased).',
    })
  } else {
    for (const night of nights) {
      const show = attachNightToShow(night, city, input.shows)
      if (!attachedShow) attachedShow = show
      const isPre = preShowNightDate === night
      const found = findExistingNightEntry(next, night, city, isPre)
      if (found?.paid && found.confirmation_id && found.confirmation_id !== packet.confirmation_id) {
        const created = hotelNightEntry({
          night,
          city,
          packet,
          amount: perNight,
          source,
          receiptKind: 'charge',
        })
        next = [...next, created]
        nightPlans.push({
          date: night,
          city,
          vendor: packet.vendor,
          amount: perNight,
          action: 'create',
          entry_id: created.id,
          attached_show_id: show?.id ?? null,
          attached_show_label: showLabel(show),
          source,
          match_reason: 'Existing PAID night kept; new confirm added as history (not erased).',
        })
        continue
      }
      if (found?.paid) {
        nightPlans.push({
          date: night,
          city,
          vendor: found.vendor ?? packet.vendor,
          amount: found.amount,
          action: 'keep_paid',
          entry_id: found.id,
          attached_show_id: show?.id ?? null,
          attached_show_label: showLabel(show),
          source: found.notes || source,
          match_reason: 'Night already PAID — amount left locked; worksheet still refreshed.',
        })
        continue
      }
      const updated = hotelNightEntry({
        existing: found,
        night,
        city,
        packet,
        amount: perNight,
        source,
        receiptKind: 'charge',
      })
      if (found) {
        next = next.map(entry => entry.id === found.id ? updated : entry)
      } else {
        next = [...next, updated]
      }
      const cityMatch = show ? citiesRelated(city, show.venue_city) : false
      nightPlans.push({
        date: night,
        city,
        vendor: packet.vendor,
        amount: perNight,
        action: found ? 'update' : 'create',
        entry_id: updated.id,
        attached_show_id: show?.id ?? null,
        attached_show_label: showLabel(show),
        source,
        match_reason: cityMatch
          ? `Itinerary window + catchment (${city} ↔ ${show?.venue_city}).`
          : `Itinerary window (city ≠ show city) — attached via night-before / next show, not show-date ∩.`,
      })
    }
  }

  const worksheetLine = formatHotelWorksheetLine({
    vendor: packet.vendor,
    confirmationId: packet.confirmation_id,
    locality: city,
    address: packet.address,
    checkIn: packet.check_in,
    checkOut: packet.check_out,
    amount: packet.total_paid,
    guestNames: packet.guest_names,
    source,
  })
  const showNotes = attachedShow
    ? appendUniqueNote(attachedShow.hotel_notes, worksheetLine)
    : worksheetLine
  const overview = appendUniqueNote(input.hotelsOverviewNotes, worksheetLine)

  const anyPaid = next.some(entry => entry.paid && entry.receipt_kind !== 'refund')
    || nightPlans.some(n => n.action === 'refund')

  return {
    ok: true,
    error: null,
    confidence,
    packet,
    nights: nightPlans,
    next_entries: next,
    field_value: entriesSum(next),
    field_source: source,
    worksheet: {
      show_id: attachedShow?.id ?? null,
      hotel_notes: showNotes,
      hotels_overview_notes: overview,
    },
    will_tick_hotel_confirmed: anyPaid,
    writes_cost_fields: false,
  }
}

export function formatReceiptApplyAuditCopy(opts: {
  actorName: string
  vendor: string
  confirmationId: string
  dateIso: string
  nightCount: number
}): { fieldName: string; oldValue: string; newValue: string } {
  const actor = opts.actorName.trim() || 'Someone'
  const source = formatBookingConfirmSource({
    vendor: opts.vendor,
    confirmationId: opts.confirmationId,
    dateIso: opts.dateIso,
  })
  return {
    fieldName: AUDIT_FIELD_RECEIPT_EXTRACT_APPLY,
    oldValue: 'no receipt extract applied',
    newValue: `${actor} applied ${source} on Run Advancing (${opts.nightCount} night line${opts.nightCount === 1 ? '' : 's'}). Costing was not written.`,
  }
}

export function nswHotelFixturesSmokeFit(shows: ReceiptShowLike[]): {
  matches: boolean
  reason: string
} {
  const window = nightsInItineraryWindow(['2026-09-17', '2026-09-18', '2026-09-19'], shows)
  if (window.inWindow.length < 3) {
    return {
      matches: false,
      reason: `Itinerary window ${window.window.start ?? '—'}–${window.window.end ?? '—'} does not cover 17–19 Sep 2026. Apply the fixtures on a BOOKED NSW run with Newcastle / Tamworth / Port Macquarie those dates, or expect a low-confidence reject (correct on R01).`,
    }
  }
  return {
    matches: true,
    reason: 'Show dates cover the 17–19 Sep 2026 hotel nights. Safe to apply the three fixtures on staging.',
  }
}

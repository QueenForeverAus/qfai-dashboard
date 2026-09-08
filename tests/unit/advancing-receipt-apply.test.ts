import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ADVANCING_WRITES_BACK_TO_COSTING } from '../../lib/run-advancing.ts'
import {
  decidePaidChecklistTicks,
} from '../../lib/advancing-checklist-paid-ticks.ts'
import { normalizeEntries } from '../../lib/cost-fields.ts'
import {
  assertReceiptApplyTable,
  nswHotelFixturesSmokeFit,
  planReceiptApply,
  receiptApplyBlockedReason,
  RECEIPT_APPLY_PROPOSED_ERROR,
  RECEIPT_APPLY_TABLES,
  RECEIPT_APPLY_WRITES_COST_FIELDS,
} from '../../lib/receipts/apply-engine.ts'
import {
  PORT_OCALL_PACKET,
  TAMWORTH_HOTEL_PACKET,
  THORNTON_EXECUTIVE_PACKET,
} from '../../lib/receipts/hotel-fixtures.ts'
import { stayNights } from '../../lib/receipts/dates.ts'
import { citiesRelated, itineraryWindowFromShows } from '../../lib/receipts/itinerary.ts'
import { parseReceiptExtractPacket } from '../../lib/receipts/packet.ts'
import { formatBookingConfirmSource } from '../../lib/receipts/source.ts'

const nswShows = [
  { id: 's-ncl', venue_city: 'Newcastle', venue_name: 'Civic Theatre', show_date: '2026-09-18', show_order: 1, hotel_notes: null },
  { id: 's-tam', venue_city: 'Tamworth', venue_name: 'Capitol', show_date: '2026-09-19', show_order: 2, hotel_notes: null },
  { id: 's-pmq', venue_city: 'Port Macquarie', venue_name: "Glasshouse", show_date: '2026-09-20', show_order: 3, hotel_notes: null },
]

const r01Shows = [
  { id: 's-bh', venue_city: 'Broken Hill', venue_name: 'Entertainment Centre', show_date: '2027-02-11', show_order: 1, hotel_notes: null },
  { id: 's-ren', venue_city: 'Renmark', venue_name: 'Renmark Hotel', show_date: '2027-02-12', show_order: 2, hotel_notes: null },
  { id: 's-adl', venue_city: 'Adelaide', venue_name: 'TBC', show_date: '2027-02-13', show_order: 3, hotel_notes: null },
]

function estimatedNight(id: string, city: string, extra = '') {
  return {
    id,
    description: `${city} — ${extra || 'Night'}`,
    notes: '7 rooms',
    amount: 1400,
    gst_included: true,
    confirmed: false,
    paid: false,
    city,
  }
}

describe('Receipt packet schema', () => {
  it('parses the three hotel fixtures', () => {
    for (const packet of [THORNTON_EXECUTIVE_PACKET, TAMWORTH_HOTEL_PACKET, PORT_OCALL_PACKET]) {
      const parsed = parseReceiptExtractPacket(packet)
      assert.equal(parsed.ok, true)
      if (parsed.ok) assert.equal(parsed.packet.kind, 'hotel')
    }
  })

  it('accepts flight/car stubs but apply rejects them', () => {
    const parsed = parseReceiptExtractPacket({
      version: 1,
      kind: 'flight',
      vendor: 'Qantas',
      confirmation_id: 'QF-1',
      currency: 'AUD',
      total_paid: 400,
      paid: true,
    })
    assert.equal(parsed.ok, true)
    const plan = planReceiptApply({
      bookingStatus: 'confirmed',
      hasActiveWorkspace: true,
      packet: parsed.ok ? parsed.packet : {},
      shows: nswShows,
    })
    assert.equal(plan.ok, false)
    assert.match(plan.error ?? '', /hotel-only/i)
  })
})

describe('Thornton catchment matching', () => {
  it('treats Thornton / Maitland as Newcastle catchment', () => {
    assert.equal(citiesRelated('Thornton', 'Newcastle'), true)
    assert.equal(citiesRelated('Maitland', 'Newcastle'), true)
    assert.equal(citiesRelated('Thornton', 'Tamworth'), false)
  })

  it('attaches the night-before via itinerary window, not show-date ∩ alone', () => {
    const stay = stayNights(THORNTON_EXECUTIVE_PACKET.check_in, THORNTON_EXECUTIVE_PACKET.check_out)
    assert.deepEqual(stay, ['2026-09-17'])
    const showDates = nswShows.map(s => s.show_date)
    const intersection = stay.filter(d => showDates.includes(d))
    assert.deepEqual(intersection, [], 'hard case: stay night is not a show date')

    const window = itineraryWindowFromShows(nswShows)
    assert.equal(window.start, '2026-09-17')
    assert.equal(window.end, '2026-09-20')

    const plan = planReceiptApply({
      bookingStatus: 'confirmed',
      hasActiveWorkspace: true,
      packet: THORNTON_EXECUTIVE_PACKET,
      existingEntries: [estimatedNight('e-pre', 'Newcastle', 'Pre-show night')],
      shows: nswShows,
    })
    assert.equal(plan.ok, true)
    assert.equal(plan.confidence, 'high')
    assert.equal(plan.nights[0]?.date, '2026-09-17')
    assert.equal(plan.nights[0]?.attached_show_id, 's-ncl')
    assert.match(plan.nights[0]?.match_reason ?? '', /catchment|itinerary/i)
    assert.equal(plan.next_entries[0]?.night_date, '2026-09-17')
    assert.equal(plan.next_entries[0]?.id, 'e-pre')
  })
})

describe('Per-night Advancing lines + PAID + source', () => {
  it('creates one accommodation entry per night/city and marks PAID with locked source', () => {
    let entries: unknown[] = [
      estimatedNight('e1', 'Newcastle', 'Pre-show night'),
      estimatedNight('e2', 'Tamworth', 'Night 2'),
      estimatedNight('e3', 'Port Macquarie', 'Night 3'),
    ]
    const packets = [THORNTON_EXECUTIVE_PACKET, TAMWORTH_HOTEL_PACKET, PORT_OCALL_PACKET]
    const expectedSources = [
      formatBookingConfirmSource({ vendor: 'Thornton Executive', confirmationId: 'TE-91718', dateIso: '2026-09-17' }),
      formatBookingConfirmSource({ vendor: 'Tamworth Hotel', confirmationId: 'TH-1819', dateIso: '2026-09-18' }),
      formatBookingConfirmSource({ vendor: "Port O'Call", confirmationId: 'POC-1920', dateIso: '2026-09-19' }),
    ]

    for (const [i, packet] of packets.entries()) {
      const plan = planReceiptApply({
        bookingStatus: 'confirmed',
        hasActiveWorkspace: true,
        packet,
        existingEntries: entries,
        shows: nswShows,
      })
      assert.equal(plan.ok, true, plan.error ?? '')
      assert.equal(plan.writes_cost_fields, false)
      assert.equal(plan.nights.length, 1)
      assert.equal(plan.nights[0]?.action, 'update')
      entries = plan.next_entries
      const paid = entries.filter(e => (e as { paid?: boolean }).paid)
      assert.equal(paid.length, i + 1)
      assert.match(String((paid[i] as { notes?: string }).notes), new RegExp(expectedSources[i]!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
      assert.equal(plan.field_source, expectedSources[i])
    }

    const nights = (entries as Array<{ night_date?: string; city?: string; paid?: boolean; amount?: number }>)
    assert.deepEqual(nights.map(e => e.night_date), ['2026-09-17', '2026-09-18', '2026-09-19'])
    assert.equal(nights.every(e => e.paid), true)
    assert.equal(nights[0]?.amount, 214)
    assert.equal(nights[1]?.amount, 189)
    assert.equal(nights[2]?.amount, 245)
    assert.equal(formatBookingConfirmSource({
      vendor: 'Thornton Executive',
      confirmationId: 'TE-91718',
      dateIso: '2026-09-17',
    }), 'Booking confirm Thornton Executive conf TE-91718 17/09/26')
  })

  it('keeps charge + refund history instead of erasing', () => {
    const charged = planReceiptApply({
      bookingStatus: 'confirmed',
      hasActiveWorkspace: true,
      packet: TAMWORTH_HOTEL_PACKET,
      existingEntries: [],
      shows: nswShows,
    })
    assert.equal(charged.ok, true)
    const refund = planReceiptApply({
      bookingStatus: 'confirmed',
      hasActiveWorkspace: true,
      packet: { ...TAMWORTH_HOTEL_PACKET, charge_kind: 'refund', total_paid: 189 },
      existingEntries: charged.next_entries,
      shows: nswShows,
    })
    assert.equal(refund.ok, true)
    assert.equal(refund.nights[0]?.action, 'refund')
    const kinds = refund.next_entries.map(e => e.receipt_kind)
    assert.ok(kinds.includes('charge'))
    assert.ok(kinds.includes('refund'))
    assert.equal(refund.next_entries.length, 2)
    assert.equal(refund.next_entries.some(e => e.amount === 189 && e.paid), true)
    assert.equal(refund.next_entries.some(e => e.amount === -189), true)
  })
})

describe('Checklist tick + gates + cost_fields isolation', () => {
  it('ticks hotel_confirmed via P2 mapping when any night is PAID (explicit booked fact)', () => {
    const plan = planReceiptApply({
      bookingStatus: 'confirmed',
      hasActiveWorkspace: true,
      packet: THORNTON_EXECUTIVE_PACKET,
      existingEntries: [
        estimatedNight('e1', 'Newcastle', 'Pre-show night'),
        estimatedNight('e2', 'Tamworth', 'Night 2'),
      ],
      shows: nswShows,
    })
    assert.equal(plan.ok, true)
    assert.equal(plan.will_tick_hotel_confirmed, true)
    const ticks = decidePaidChecklistTicks({
      source: 'advancing',
      paidFieldKeys: plan.will_tick_hotel_confirmed ? ['accommodation'] : [],
      items: [
        { id: 'h1', item_key: 'hotel_confirmed', status: 'pending' },
        { id: 'f1', item_key: 'flights_complete', status: 'pending' },
      ],
    })
    assert.deepEqual(ticks.tickIds, ['h1'])
  })

  it('rejects proposed runs and missing workspace', () => {
    assert.equal(receiptApplyBlockedReason({
      bookingStatus: 'proposed',
      hasActiveWorkspace: false,
    }), RECEIPT_APPLY_PROPOSED_ERROR)

    const plan = planReceiptApply({
      bookingStatus: 'proposed',
      hasActiveWorkspace: true,
      packet: THORNTON_EXECUTIVE_PACKET,
      shows: nswShows,
    })
    assert.equal(plan.ok, false)
    assert.match(plan.error ?? '', /proposed/i)

    const noWs = planReceiptApply({
      bookingStatus: 'confirmed',
      hasActiveWorkspace: false,
      packet: THORNTON_EXECUTIVE_PACKET,
      shows: nswShows,
    })
    assert.equal(noWs.ok, false)
    assert.match(noWs.error ?? '', /workspace/i)
  })

  it('rejects R01 / dates outside the itinerary window (no silent apply)', () => {
    const plan = planReceiptApply({
      bookingStatus: 'confirmed',
      hasActiveWorkspace: true,
      packet: THORNTON_EXECUTIVE_PACKET,
      shows: r01Shows,
    })
    assert.equal(plan.ok, false)
    assert.equal(plan.confidence, 'low')
    assert.match(plan.error ?? '', /itinerary window/i)
    assert.equal(nswHotelFixturesSmokeFit(r01Shows).matches, false)
    assert.equal(nswHotelFixturesSmokeFit(nswShows).matches, true)
  })

  it('never writes cost_fields — Advancing twin only', () => {
    assert.equal(RECEIPT_APPLY_WRITES_COST_FIELDS, false)
    assert.equal(ADVANCING_WRITES_BACK_TO_COSTING, false)
    assert.equal((RECEIPT_APPLY_TABLES as readonly string[]).includes('cost_fields'), false)
    assert.ok(RECEIPT_APPLY_TABLES.includes('advancing_cost_fields'))
    assert.throws(() => assertReceiptApplyTable('cost_fields'), /never write cost_fields/)
    const plan = planReceiptApply({
      bookingStatus: 'confirmed',
      hasActiveWorkspace: true,
      packet: PORT_OCALL_PACKET,
      shows: nswShows,
    })
    assert.equal(plan.writes_cost_fields, false)
    const preserved = normalizeEntries(plan.next_entries)
    assert.equal(preserved?.[0]?.night_date, '2026-09-19')
    assert.equal(preserved?.[0]?.confirmation_id, 'POC-1920')
  })
})

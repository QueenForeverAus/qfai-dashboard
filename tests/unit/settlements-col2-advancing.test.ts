import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { CostingSnapshotField } from '../../lib/settlements.ts'
import {
  SETTLEMENTS_COL2_WRITES_COST_FIELDS,
  applySettlementExpectedShows,
  resolveSettlementExpectedLive,
} from '../../lib/settlements-expected.ts'
import {
  COL2_COSTING_FALLBACK_NOTE,
  COL2_HEADER,
  COL2_LIVE_ADVANCING_NOTE,
  buildRunSheet,
  buildShowSheetLines,
  col2SourceNote,
  expectedVenueWaterfall,
  liveCostAmount,
} from '../../lib/settlements-sheet.ts'
import { groupActualsForExpected } from '../../lib/settlements-sheet-match.ts'
import { distributeGateFromSources } from '../../lib/settlements-distribute-gate.ts'
import type { CostEntry } from '../../lib/cost-fields.ts'

const showId = 'show-trecv1'

const pastShow = {
  id: showId,
  venue_name: 'Geelong Performing Arts Centre',
  venue_city: 'Geelong',
  show_date: '2026-07-18',
  show_order: 1,
  capacity: 740,
  capacity_bands: null,
  ticket_price: 80,
  tickets_sold: 400,
  booking_fee_per_payer: null as number | null,
  cc_fee_pct: null as number | null,
}

function row(partial: {
  id: string
  field_key: string
  label: string
  show_id?: string | null
  category?: string
  value?: number
  state?: string
  source?: string
  entries?: unknown[]
  line_items?: unknown[]
}): Record<string, unknown> {
  return {
    run_id: 'run-1',
    show_id: partial.show_id ?? null,
    category: partial.category ?? 'Travel & Accommodation',
    value: partial.value ?? 0,
    state: partial.state ?? 'guess',
    source: partial.source ?? 'Draft',
    entries: partial.entries ?? [],
    line_items: partial.line_items ?? [],
    ...partial,
  }
}

function asField(rec: Record<string, unknown>): CostingSnapshotField {
  return {
    id: String(rec.id),
    run_id: String(rec.run_id),
    show_id: (rec.show_id as string | null) ?? null,
    category: String(rec.category ?? ''),
    field_key: String(rec.field_key),
    label: String(rec.label),
    value: rec.value == null ? null : Number(rec.value),
    state: String(rec.state ?? 'guess'),
    source: (rec.source as string | null) ?? null,
    entries: Array.isArray(rec.entries) ? rec.entries as CostEntry[] : [],
    line_items: Array.isArray(rec.line_items) ? rec.line_items as CostingSnapshotField['line_items'] : [],
  }
}

const costingAccommodation = row({
  id: 'cf-acco',
  field_key: 'accommodation',
  label: 'Accommodation',
  value: 900,
  state: 'guess',
  source: 'GUESS',
  entries: [{ id: 'c-night', description: 'Costing guess night', notes: '', amount: 900, gst_included: true, confirmed: false, paid: false }],
})

const advancingAccommodation = row({
  id: 'af-acco',
  field_key: 'accommodation',
  label: 'Accommodation',
  value: 640,
  state: 'known',
  source: 'Receipt',
  entries: [
    { id: 'n1', description: 'Geelong night 1', notes: '', amount: 320, gst_included: true, confirmed: true, paid: true, night_date: '2026-07-17' },
    { id: 'n2', description: 'Geelong night 2', notes: '', amount: 320, gst_included: true, confirmed: true, paid: true, night_date: '2026-07-18' },
  ],
})

const costingHire = row({
  id: 'cf-hire',
  show_id: showId,
  category: 'Venue Costs',
  field_key: 'venue_hire',
  label: 'Venue Hire',
  value: 1451,
  state: 'guess',
  source: 'GUESS',
  entries: [{ id: 'ch', description: 'Hire', notes: '', amount: 1451, gst_included: true, confirmed: false, paid: false }],
})

const advancingHire = row({
  id: 'af-hire',
  show_id: showId,
  category: 'Venue Costs',
  field_key: 'venue_hire',
  label: 'Venue Hire',
  value: 1600,
  state: 'known',
  source: 'Advancing',
  entries: [{ id: 'ah', description: 'Hire confirmed', notes: '', amount: 1600, gst_included: true, confirmed: true, paid: false }],
})

describe('Settlements Phase 4 — Col2 bind to Run Advancing', () => {
  it('prefers advancing_cost_fields when an active workspace exists', () => {
    const resolved = resolveSettlementExpectedLive({
      advancingWorkspace: { archived_at: null },
      advancingFields: [advancingHire, advancingAccommodation],
      costingFields: [costingHire, costingAccommodation],
    })
    assert.equal(resolved.source, 'advancing')
    assert.equal(resolved.fields.find(f => f.field_key === 'venue_hire')?.value, 1600)
    assert.equal(resolved.fields.find(f => f.field_key === 'accommodation')?.id, 'af-acco')
    assert.equal(resolved.fields.some(f => f.id.startsWith('cf-')), false)
  })

  it('ignores frozen Costing values when Advancing diverges', () => {
    const resolved = resolveSettlementExpectedLive({
      advancingWorkspace: { archived_at: null },
      advancingFields: [advancingHire, advancingAccommodation],
      costingFields: [costingHire, costingAccommodation],
    })
    const { lines, summary } = buildShowSheetLines({
      show: pastShow,
      fields: resolved.fields,
      tickets: 400,
      ticketsSource: 'entered',
      includeRunCosts: true,
    })
    assert.equal(lines.find(l => l.key === 'show:venue_hire')?.expected, 1600)
    assert.notEqual(lines.find(l => l.key === 'show:venue_hire')?.expected, 1451)
    assert.equal(lines.find(l => l.key === 'run:accommodation')?.expected, 640)
    assert.notEqual(lines.find(l => l.key === 'run:accommodation')?.expected, 900)
    assert.ok(summary)
  })

  it('rolls per-night Advancing accommodation entries into Expected totals', () => {
    const field = asField(advancingAccommodation)
    assert.equal(liveCostAmount(field), 640)
    assert.equal(liveCostAmount(asField(costingAccommodation)), 900)

    const model = buildRunSheet({
      shows: [pastShow],
      fields: [asField(advancingHire), field],
      today: '2026-09-08',
    })
    const accom = model.runLines.find(l => l.key === 'run:accommodation')
    assert.equal(accom?.expected, 640)
    assert.ok((model.summary?.totalCosts ?? 0) >= 640)
  })

  it('uses Advancing shows chrome for expected P&L / ticket price / fees', () => {
    const shows = applySettlementExpectedShows({
      shows: [pastShow],
      chrome: [{
        show_id: showId,
        ticket_price: 95,
        capacity: 800,
        capacity_bands: null,
        booking_fee_per_payer: 4,
        cc_fee_pct: 2,
      }],
      source: 'advancing',
    })
    assert.equal(shows[0].ticket_price, 95)
    assert.equal(shows[0].booking_fee_per_payer, 4)
    assert.equal(pastShow.ticket_price, 80)

    const wf = expectedVenueWaterfall({ show: shows[0], tickets: 400 })
    assert.equal(wf.grossTicketSales, 38_000)
    assert.notEqual(wf.grossTicketSales, 32_000)
  })

  it('does not invent Costing figures when an empty Advancing workspace is active', () => {
    const resolved = resolveSettlementExpectedLive({
      advancingWorkspace: { archived_at: null },
      advancingFields: [],
      costingFields: [costingHire, costingAccommodation],
    })
    assert.equal(resolved.source, 'advancing')
    assert.equal(resolved.fields.length, 0)
  })

  it('falls back to cost_fields when no active Advancing workspace exists', () => {
    const none = resolveSettlementExpectedLive({
      advancingWorkspace: null,
      advancingFields: [advancingHire],
      costingFields: [costingHire, costingAccommodation],
    })
    assert.equal(none.source, 'costing_fallback')
    assert.equal(none.fields.find(f => f.field_key === 'venue_hire')?.id, 'cf-hire')
    assert.equal(none.fields.find(f => f.field_key === 'venue_hire')?.value, 1451)

    const archived = resolveSettlementExpectedLive({
      advancingWorkspace: { archived_at: '2026-09-08T00:00:00.000Z' },
      advancingFields: [advancingHire],
      costingFields: [costingHire],
    })
    assert.equal(archived.source, 'costing_fallback')
    assert.equal(archived.fields[0]?.id, 'cf-hire')

    const fallbackShows = applySettlementExpectedShows({
      shows: [pastShow],
      chrome: [{
        show_id: showId,
        ticket_price: 95,
        capacity: 800,
        capacity_bands: null,
        booking_fee_per_payer: 4,
        cc_fee_pct: 2,
      }],
      source: 'costing_fallback',
    })
    assert.equal(fallbackShows[0].ticket_price, 80)
  })

  it('never mutates cost_fields — Col2 is a read of Advancing', () => {
    assert.equal(SETTLEMENTS_COL2_WRITES_COST_FIELDS, false)
    const costingFields = [structuredClone(costingHire), structuredClone(costingAccommodation)]
    const snapshot = structuredClone(costingFields)
    const resolved = resolveSettlementExpectedLive({
      advancingWorkspace: { archived_at: null },
      advancingFields: [advancingHire, advancingAccommodation],
      costingFields,
    })
    assert.deepEqual(costingFields, snapshot)
    assert.equal(resolved.fields.find(f => f.field_key === 'accommodation')?.value, 640)
    assert.equal(costingFields.find(f => f.field_key === 'accommodation')?.value, 900)
  })

  it('keeps tickets-sold / smart match / distribute gate on Advancing-sourced amounts', () => {
    const resolved = resolveSettlementExpectedLive({
      advancingWorkspace: { archived_at: null },
      advancingFields: [advancingHire, advancingAccommodation],
      costingFields: [costingHire, costingAccommodation],
    })
    const { lines } = buildShowSheetLines({
      show: pastShow,
      fields: resolved.fields,
      tickets: 400,
      ticketsSource: 'entered',
      includeRunCosts: true,
    })
    assert.equal(lines.find(l => l.key === 'tickets_sold')?.expected, 400)

    const hireExpected = lines.find(l => l.key === 'show:venue_hire')!.expected!
    const grouped = groupActualsForExpected({
      expected: { key: 'show:venue_hire', label: 'Venue Hire' },
      actuals: [
        { id: 'a1', show_id: showId, line_key: 'show:venue_hire', amount: 900, status: 'confirmed', notes: 'partial' },
        { id: 'a2', show_id: showId, line_key: 'show:venue_hire', amount: 700, status: 'confirmed', notes: 'balance' },
      ],
      showId,
    })
    assert.equal(hireExpected, 1600)
    assert.equal(grouped.actual, 1600)

    const gate = distributeGateFromSources({
      fields: resolved.fields,
      wave1BandCosts: [],
    })
    assert.equal(gate.ready, true)
    assert.ok(gate.total >= 1)

    const costingGate = distributeGateFromSources({
      fields: [asField(costingAccommodation)],
      wave1BandCosts: [],
    })
    assert.equal(costingGate.ready, false)
  })

  it('labels Col2 Expected (Advancing) and drops leftover live Costing wording', () => {
    assert.equal(COL2_HEADER, 'Expected (Advancing)')
    assert.match(COL2_LIVE_ADVANCING_NOTE, /live read of Run Advancing/)
    assert.doesNotMatch(COL2_LIVE_ADVANCING_NOTE, /live Costing|Run Costing/)
    assert.match(COL2_LIVE_ADVANCING_NOTE, /not a sell-through slider/)
    assert.match(COL2_COSTING_FALLBACK_NOTE, /falling back to locked Run Costing/)
    assert.match(COL2_COSTING_FALLBACK_NOTE, /not invented/)
    assert.equal(col2SourceNote('advancing'), COL2_LIVE_ADVANCING_NOTE)
    assert.equal(col2SourceNote('costing_fallback'), COL2_COSTING_FALLBACK_NOTE)
  })
})

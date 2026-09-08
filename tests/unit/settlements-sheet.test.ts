import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  COL3_CELL,
  COL3_PLACEHOLDER_NOTE,
  PRE_SHOW_BLOCK_COPY,
  PRE_SHOW_STAKEHOLDER_NOTE,
  SHEET_FORBIDS_REVENUE_SLIDERS,
  SOCIAL_ADS_PER_TICKET,
  TICKETS_SOLD_LABEL,
  buildRunSheet,
  buildShowSheetLines,
  expectedVenueWaterfall,
  resolveTicketsSold,
  isSettlementsDemoRun,
  remittanceHref,
  settlementSheetHref,
  sheetUsesRevenueSliders,
  showHasOccurred,
  socialAdsForTickets,
  venueStaffExpected,
  wave1SettlementHref,
} from '../../lib/settlements-sheet.ts'
import type { CostingSnapshotField } from '../../lib/settlements.ts'
import { computeHarbourCommission } from '../../lib/pnl-run-costing.ts'

const pastShow = {
  id: 'show-tcomp',
  venue_name: 'Geelong Performing Arts Centre',
  venue_city: 'Geelong',
  show_date: '2026-07-18',
  show_order: 1,
  capacity: 740,
  capacity_bands: null,
  ticket_price: 80,
  tickets_sold: 400,
  booking_fee_per_payer: null,
  cc_fee_pct: null,
}

const futureShow = {
  ...pastShow,
  id: 'show-r12',
  venue_name: 'Goulburn Performing Arts Centre',
  show_date: '2027-05-14',
  tickets_sold: null,
}

function field(partial: Partial<CostingSnapshotField> & Pick<CostingSnapshotField, 'field_key' | 'label'>): CostingSnapshotField {
  return {
    id: partial.id ?? partial.field_key,
    run_id: 'run-1',
    show_id: partial.show_id ?? null,
    category: partial.category ?? 'Venue Costs',
    field_key: partial.field_key,
    label: partial.label,
    value: partial.value ?? 0,
    state: partial.state ?? 'known',
    source: partial.source ?? 'Advancing',
    entries: partial.entries ?? [],
    line_items: partial.line_items ?? [],
  }
}

test('pre-show hard block: undated and same-day stay blocked; past dates are open', () => {
  assert.equal(showHasOccurred(null, '2026-09-07'), false)
  assert.equal(showHasOccurred('', '2026-09-07'), false)
  assert.equal(showHasOccurred('2026-09-07', '2026-09-07'), false)
  assert.equal(showHasOccurred('2026-09-08', '2026-09-07'), false)
  assert.equal(showHasOccurred('2026-09-06', '2026-09-07'), true)
  assert.equal(showHasOccurred('2026-07-18', '2026-09-07'), true)
  assert.match(PRE_SHOW_BLOCK_COPY, /Data not yet available — check back when the show has occurred/)
  assert.match(PRE_SHOW_STAKEHOLDER_NOTE, /Advancing, not Settlements/)
})

test('tickets sold prefers entered actual, then known, never sell-through', () => {
  assert.deepEqual(resolveTicketsSold({ entered: 412, known: 200 }), { tickets: 412, source: 'entered' })
  assert.deepEqual(resolveTicketsSold({ entered: null, known: 200 }), { tickets: 200, source: 'known' })
  assert.deepEqual(resolveTicketsSold({}), { tickets: null, source: 'missing' })
  assert.deepEqual(resolveTicketsSold({ entered: -1, known: 10 }), { tickets: 10, source: 'known' })
  assert.equal(TICKETS_SOLD_LABEL.includes('actual'), true)
})

test('Col2 reruns Harbour 10% and inside on actual ticket count, not capacity × sell-through', () => {
  const wf = expectedVenueWaterfall({ show: pastShow, tickets: 400 })
  assert.equal(wf.grossTicketSales, 32_000)
  // Silent default: $5 bundled / payer when no CC split history
  assert.equal(wf.inside.total, 2_000)
  assert.equal(wf.commissionable, 30_000)
  assert.equal(wf.harbourCommission, computeHarbourCommission(30_000))
  assert.equal(wf.harbourCommission, 3_000)
  assert.equal(wf.netRevenue, 27_000)
  // 75% of 740 cap × $80 would be a different modelled gross — must not be used
  const modelled = Math.round(740 * 0.75) * 80
  assert.notEqual(wf.grossTicketSales, modelled)
})

test('social ads auto-calc is tickets × $1.10 (same as Run Costing live)', () => {
  assert.equal(SOCIAL_ADS_PER_TICKET, 1.10)
  assert.equal(socialAdsForTickets(400), 440)
  assert.equal(socialAdsForTickets(null), 0)
})

test('venue staff uses live advancing amount when there are no bands', () => {
  const staff = field({
    field_key: 'venue_staff',
    label: 'Venue Staff / On-costs',
    show_id: pastShow.id,
    value: 1200,
    entries: [{ id: 'e1', description: 'Staff', notes: '', amount: 1200, gst_included: true, confirmed: true, paid: true }],
    line_items: [],
  })
  assert.equal(venueStaffExpected({ field: staff, show: pastShow, tickets: 400 }), 1200)
})

test('sheet lines include Col1 labels, Col2 expected, and no slider keys', () => {
  const hire = field({
    field_key: 'venue_hire',
    label: 'Venue Hire',
    show_id: pastShow.id,
    value: 1451,
    entries: [{ id: 'e1', description: 'Hire', notes: '', amount: 1451, gst_included: true, confirmed: true, paid: false }],
  })
  const { lines, summary } = buildShowSheetLines({
    show: pastShow,
    fields: [hire],
    tickets: 400,
    ticketsSource: 'entered',
    includeRunCosts: true,
  })
  const keys = lines.map(l => l.key)
  assert.ok(keys.includes('tickets_sold'))
  assert.ok(keys.includes('harbour_commission'))
  assert.ok(keys.includes('show:venue_hire'))
  assert.ok(keys.includes('pre_dist_margin'))
  assert.equal(lines.find(l => l.key === 'show:venue_hire')?.expected, 1451)
  assert.ok(summary)
  assert.equal(sheetUsesRevenueSliders(), false)
  assert.equal(SHEET_FORBIDS_REVENUE_SLIDERS, true)
  assert.ok(!keys.some(k => /slider|sell.through|sell_through/i.test(k)))
})

test('run sheet blocks when every show is still upcoming', () => {
  const model = buildRunSheet({
    shows: [futureShow],
    fields: [],
    today: '2026-09-07',
  })
  assert.equal(model.blocked, true)
  assert.equal(model.occurred.length, 0)
  assert.equal(model.upcoming.length, 1)
})

test('run sheet opens occurred shows and keeps upcoming out of Col2', () => {
  const model = buildRunSheet({
    shows: [pastShow, futureShow],
    fields: [],
    today: '2026-09-07',
  })
  assert.equal(model.blocked, false)
  assert.equal(model.occurred.map(s => s.id).join(','), 'show-tcomp')
  assert.equal(model.upcoming.map(s => s.id).join(','), 'show-r12')
  assert.equal(model.sections[0]?.tickets, 400)
})

test('sheet is the canonical Settlements front door; Wave-1 and remittance are secondary', () => {
  assert.equal(settlementSheetHref('TCOMP1'), '/settlements/tcomp1')
  assert.equal(settlementSheetHref('TCOMP1', 'show-1'), '/settlements/tcomp1/show-1')
  assert.equal(wave1SettlementHref('TCOMP1'), '/settlements/tcomp1/agent')
  assert.equal(wave1SettlementHref('TCOMP1', 'show-1'), '/settlements/tcomp1/show-1/agent')
  assert.equal(remittanceHref('TCOMP1'), '/settlements/tcomp1/remittance')
  assert.equal(remittanceHref('TCOMP1', 'show-1'), '/settlements/tcomp1/show-1/remittance')
})

test('TCOMP1 and DEMO/SAMPLE notes mark the staging glance run; R12 does not', () => {
  assert.equal(isSettlementsDemoRun({ code: 'TCOMP1', name: 'Geelong' }), true)
  assert.equal(isSettlementsDemoRun({ code: 'R12', name: 'R12 Melbourne' }), false)
  assert.equal(isSettlementsDemoRun({ code: 'X1', name: 'DEMO completed show' }), true)
  assert.equal(isSettlementsDemoRun({ code: 'X2', name: 'Night two', notes: 'SAMPLE for staging' }), true)
})

test('Col3 copy is Phase 4 actuals, not a placeholder-only note', () => {
  assert.match(COL3_PLACEHOLDER_NOTE, /confirmed/)
  assert.match(COL3_PLACEHOLDER_NOTE, /Challenge/)
  assert.match(COL3_PLACEHOLDER_NOTE, /PAID/)
  assert.match(COL3_PLACEHOLDER_NOTE, /roll up/)
  assert.equal(COL3_CELL, '—')
})

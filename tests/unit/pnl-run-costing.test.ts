import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  HARBOUR_COMMISSION_RATE,
  SILENT_BOOKING_FEE_PER_PAYER,
  SILENT_BUNDLED_PER_PAYER,
  canSeeOwnerPnl,
  classifyInsidePlacement,
  computeHarbourCommission,
  computePnlSummary,
  computeVenueWaterfall,
  insideFactorsFromRows,
  knownInsideForShow,
  pnlSlidersUnlocked,
  remittanceHasCcSplit,
  resolveInsideCosts,
} from '../../lib/pnl-run-costing.ts'

test('Harbour commission is exactly 10% of commissionable, never of gross', () => {
  assert.equal(HARBOUR_COMMISSION_RATE, 0.10)
  assert.equal(computeHarbourCommission(1000), 100)
  assert.equal(computeHarbourCommission(0), 0)
  const wf = computeVenueWaterfall({ grossTicketSales: 10_000, insideTotal: 2000 })
  assert.equal(wf.commissionable, 8000)
  assert.equal(wf.harbourCommission, 800)
  assert.equal(wf.netRevenue, 7200)
  // 10% of gross would be 1000 — must not be used
  assert.notEqual(wf.harbourCommission, 1000)
})

test('net_revenue = commissionable − harbour; harbour is not editable input', () => {
  const wf = computeVenueWaterfall({ grossTicketSales: 5500, insideTotal: 500 })
  assert.equal(wf.commissionable, 5000)
  assert.equal(wf.harbourCommission, 500)
  assert.equal(wf.netRevenue, 4500)
})

test('P&L summary: 20% reserve of positive net only', () => {
  const win = computePnlSummary({ netRevenue: 10_000, totalCosts: 4000 })
  assert.equal(win.netProfit, 6000)
  assert.equal(win.reserve, 1200)
  assert.equal(win.preDistMargin, 4800)

  const loss = computePnlSummary({ netRevenue: 1000, totalCosts: 4000 })
  assert.equal(loss.netProfit, -3000)
  assert.equal(loss.reserve, 0)
  assert.equal(loss.preDistMargin, -3000)
})

test('unlock gate: FIGURES NEEDED on cost lines blocks sliders', () => {
  const blocked = pnlSlidersUnlocked([
    { fieldKey: 'venue_hire', state: 'pending' },
    { fieldKey: 'flights', state: 'estimated' },
  ])
  assert.equal(blocked.unlocked, false)
  assert.equal(blocked.blocking.length, 1)
  assert.equal(blocked.blocking[0]!.fieldKey, 'venue_hire')

  const figuresNeeded = pnlSlidersUnlocked([
    { fieldKey: 'production_costs', state: 'figures_needed' },
  ])
  assert.equal(figuresNeeded.unlocked, false)
})

test('unlock gate: ESTIMATE / GUESS / CONFIRMED / PAID / AUTO CALC OK', () => {
  const ok = pnlSlidersUnlocked([
    { fieldKey: 'venue_hire', state: 'estimated' },
    { fieldKey: 'venue_staff', state: 'guess' },
    { fieldKey: 'flights', state: 'known' },
    { fieldKey: 'food_basics', state: 'pending', allPaid: true },
    { fieldKey: 'social_ads_var', state: 'auto_calc' },
  ])
  assert.equal(ok.unlocked, true)
  assert.equal(ok.blocking.length, 0)
})

test('unlock gate: ignore FIGURES NEEDED on Gross Box Office / revenue', () => {
  const ignored = pnlSlidersUnlocked([
    { fieldKey: 'gross_box_office', state: 'pending' },
    { fieldKey: 'harbour_commission', category: 'Revenue', state: 'figures_needed' },
    { fieldKey: 'venue_hire', state: 'estimated' },
  ])
  assert.equal(ignored.unlocked, true)
})

test('role gate: owner/admin see top+bottom; production/crew/external do not', () => {
  assert.equal(canSeeOwnerPnl('owner'), true)
  assert.equal(canSeeOwnerPnl('admin'), true)
  assert.equal(canSeeOwnerPnl('production'), false)
  assert.equal(canSeeOwnerPnl('crew'), false)
  assert.equal(canSeeOwnerPnl('external'), false)
  assert.equal(canSeeOwnerPnl(null), false)
  assert.equal(canSeeOwnerPnl(undefined), false)
})

test('inside vs outside placement: booking/CC/ticketing YES; hire/APRA/BO setup NO', () => {
  assert.equal(classifyInsidePlacement('Booking fee'), 'inside')
  assert.equal(classifyInsidePlacement('Credit card / merchant fee'), 'inside')
  assert.equal(classifyInsidePlacement('Box office ticketing fee'), 'inside')
  assert.equal(classifyInsidePlacement('Comp ticketing fees'), 'inside')
  assert.equal(classifyInsidePlacement('Inside ticketing fee'), 'inside')

  assert.equal(classifyInsidePlacement('Venue hire'), 'outside')
  assert.equal(classifyInsidePlacement('Venue staff / ushers'), 'outside')
  assert.equal(classifyInsidePlacement('Production / AV'), 'outside')
  assert.equal(classifyInsidePlacement('Venue Production/AV'), 'outside')
  assert.equal(classifyInsidePlacement('Marketing levy'), 'outside')
  assert.equal(classifyInsidePlacement('APRA / OneMusic'), 'outside')
  assert.equal(classifyInsidePlacement('LPA / EIS'), 'outside')
  assert.equal(classifyInsidePlacement('BO setup / ticketing build'), 'outside')
  assert.equal(classifyInsidePlacement('Printing / admin'), 'outside')
})

test('silent default: $4.50/payer + 1.6% CC when CC split history exists', () => {
  const inside = resolveInsideCosts({
    grossTicketSales: 10_000,
    payerCount: 100,
    hasCcSplitHistory: true,
  })
  assert.equal(inside.source, 'estimated')
  assert.match(inside.sourceLabel, /^estimated/i)
  assert.equal(inside.bookingFee, 100 * SILENT_BOOKING_FEE_PER_PAYER)
  assert.equal(inside.ccFee, 160) // 1.6% of 10000
  assert.equal(inside.total, 450 + 160)
})

test('silent default: $5.00/payer alone when no CC split history', () => {
  const inside = resolveInsideCosts({
    grossTicketSales: 10_000,
    payerCount: 100,
    hasCcSplitHistory: false,
  })
  assert.equal(inside.source, 'estimated')
  assert.match(inside.sourceLabel, /^estimated/i)
  assert.equal(inside.bookingFee, 100 * SILENT_BUNDLED_PER_PAYER)
  assert.equal(inside.ccFee, 0)
  assert.equal(inside.total, 500)
})

test('Factors override silent defaults and stay estimated, never known', () => {
  const inside = resolveInsideCosts({
    grossTicketSales: 10_000,
    payerCount: 100,
    factors: { bookingFeePerPayer: 3, ccFeePct: 2 },
    hasCcSplitHistory: false, // CC factor itself is the split
  })
  assert.equal(inside.source, 'estimated')
  assert.match(inside.sourceLabel, /Factors/i)
  assert.equal(inside.bookingFee, 300)
  assert.equal(inside.ccFee, 200)
  assert.equal(inside.total, 500)
})

test('venue override wins over Factors and stays estimated', () => {
  const inside = resolveInsideCosts({
    grossTicketSales: 10_000,
    payerCount: 100,
    factors: { bookingFeePerPayer: 4.5, ccFeePct: 1.6 },
    venueOverride: { bookingFeePerPayer: 2, ccFeePct: 1 },
  })
  assert.equal(inside.source, 'estimated')
  assert.equal(inside.bookingFee, 200)
  assert.equal(inside.ccFee, 100)
})

test('remittance/contract known insides win and are labelled known', () => {
  const inside = resolveInsideCosts({
    grossTicketSales: 10_000,
    payerCount: 100,
    factors: { bookingFeePerPayer: 4.5, ccFeePct: 1.6 },
    remittanceKnownLines: [
      { showId: 's1', description: 'Booking fee', amount: 320 },
      { showId: 's1', description: 'Merchant / CC fee', amount: 110 },
      { showId: 's1', description: 'Venue hire', amount: 2000 },
    ],
  })
  assert.equal(inside.source, 'known')
  assert.match(inside.sourceLabel, /known/i)
  assert.equal(inside.total, 430)
})

test('NEVER invent known insides from silent or hist 7.3%', () => {
  const silent = resolveInsideCosts({
    grossTicketSales: 10_000,
    payerCount: 100,
  })
  assert.equal(silent.source, 'estimated')
  assert.notEqual(silent.total, round73(10_000))
  assert.notEqual(silent.ccFee, 730)
})

test('ticketing_inside_pct stub adds estimated % of gross when seeded', () => {
  const inside = resolveInsideCosts({
    grossTicketSales: 10_000,
    payerCount: 0,
    factors: { ticketingInsidePct: 2 },
    hasCcSplitHistory: true,
  })
  assert.equal(inside.ticketingInside, 200)
  assert.equal(inside.source, 'estimated')
})

test('insideFactorsFromRows prefers Ticketing/Inside Costs CC over Revenue cc_fee_pct', () => {
  const factors = insideFactorsFromRows([
    { key: 'cc_fee_pct', value: 1, category: 'Revenue' },
    { key: 'inside_cc_fee_pct', value: 1.6, category: 'Ticketing / Inside Costs' },
    { key: 'booking_fee_per_payer', value: 4.5, category: 'Ticketing / Inside Costs' },
    { key: 'ticketing_inside_pct', value: null, category: 'Ticketing / Inside Costs' },
  ])
  assert.equal(factors.bookingFeePerPayer, 4.5)
  assert.equal(factors.ccFeePct, 1.6)
  assert.equal(factors.ticketingInsidePct, null)
})

test('knownInsideForShow only sums inside lines for that show', () => {
  const lines = [
    { showId: 'a', description: 'Booking fee', amount: 40 },
    { showId: 'b', description: 'Booking fee', amount: 99 },
    { showId: 'a', description: 'APRA', amount: 50 },
  ]
  assert.equal(knownInsideForShow(lines, 'a'), 40)
  assert.equal(knownInsideForShow(lines, 'c'), null)
})

test('remittanceHasCcSplit detects CC/merchant lines', () => {
  assert.equal(remittanceHasCcSplit([{ showId: 'a', description: 'Merchant fee', amount: 12 }], 'a'), true)
  assert.equal(remittanceHasCcSplit([{ showId: 'a', description: 'Booking fee', amount: 12 }], 'a'), false)
})

function round73(gross: number): number {
  return Math.round(gross * 0.073 * 100) / 100
}

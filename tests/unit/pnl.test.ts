import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  DEFAULT_BOOKING_FEE_PER_PAYER,
  DEFAULT_INSIDE_CC_FEE_PCT,
  HARBOUR_COMMISSION_RATE,
  INSIDE_FACTOR_KEYS,
  REVENUE_CC_FEE_PCT_KEY,
  canSeeOwnerPnlSheet,
  classifyInsidePlacement,
  knownInsideFromRemittance,
  parseInsideFactors,
  pnlSummary,
  remittanceLineCountsAsKnownInside,
  resolveInside,
  revenueWaterfall,
  silentInsideDefault,
  sliderUnlock,
  sumKnownInside,
} from '../../lib/pnl.ts'

test('HARD math: commissionable = gross − inside; harbour = 10% of commissionable', () => {
  const wf = revenueWaterfall(10_000, 1_000)
  assert.equal(wf.gross, 10_000)
  assert.equal(wf.inside, 1_000)
  assert.equal(wf.commissionable, 9_000)
  assert.equal(wf.harbour, 900)
  assert.equal(wf.netRevenue, 8_100)
  assert.equal(HARBOUR_COMMISSION_RATE, 0.1)
})

test('Harbour is never 10% of gross when insides exist', () => {
  const wf = revenueWaterfall(10_000, 1_600)
  assert.equal(wf.harbour, 840)
  assert.notEqual(wf.harbour, 1_000)
  assert.equal(wf.netRevenue, 7_560)
})

test('Harbour stays 10% of commissionable even if inside is zero', () => {
  const wf = revenueWaterfall(5_000, 0)
  assert.equal(wf.harbour, 500)
  assert.equal(wf.netRevenue, 4_500)
})

test('silent inside default is $4.50/payer + 1.6% of gross', () => {
  const inside = silentInsideDefault({ gross: 10_000, payers: 200 })
  assert.equal(DEFAULT_BOOKING_FEE_PER_PAYER, 4.5)
  assert.equal(DEFAULT_INSIDE_CC_FEE_PCT, 1.6)
  assert.equal(inside, 200 * 4.5 + 0.016 * 10_000)
  assert.equal(inside, 1_060)
})

test('silent inside uses Factors overrides, never Revenue cc_fee_pct', () => {
  const rows = [
    { key: REVENUE_CC_FEE_PCT_KEY, value: 1.0 },
    { key: INSIDE_FACTOR_KEYS.bookingFeePerPayer, value: 4.5 },
    { key: INSIDE_FACTOR_KEYS.insideCcFeePct, value: 1.6 },
  ]
  const factors = parseInsideFactors(rows)
  assert.equal(factors.inside_cc_fee_pct, 1.6)
  assert.equal(factors.booking_fee_per_payer, 4.5)
  const inside = silentInsideDefault({ gross: 1_000, payers: 10, factors })
  assert.equal(inside, 45 + 16)
  assert.notEqual(inside, 45 + 10) // would be 1.0% Revenue cc
})

test('parseInsideFactors ignores missing keys and uses Gareth standing defaults', () => {
  const factors = parseInsideFactors([{ key: REVENUE_CC_FEE_PCT_KEY, value: 7.3 }])
  assert.equal(factors.booking_fee_per_payer, 4.5)
  assert.equal(factors.inside_cc_fee_pct, 1.6)
  assert.equal(factors.ticketing_inside_pct, null)
})

test('never treat historic 7.3% as known insides', () => {
  const factors = parseInsideFactors([{ key: REVENUE_CC_FEE_PCT_KEY, value: 7.3 }])
  const { inside, source } = resolveInside({
    gross: 10_000,
    payers: 0,
    factors,
    knownInside: null,
  })
  assert.equal(source, 'factors')
  assert.equal(inside, 160)
  assert.notEqual(inside, 730)
})

test('remittance / contract known wins over Factors', () => {
  const { inside, source } = resolveInside({
    gross: 10_000,
    payers: 200,
    factors: { booking_fee_per_payer: 4.5, inside_cc_fee_pct: 1.6, ticketing_inside_pct: null },
    knownInside: 250,
  })
  assert.equal(source, 'known')
  assert.equal(inside, 250)
  assert.notEqual(inside, silentInsideDefault({ gross: 10_000, payers: 200 }))
})

test('P&L summary: reserve is 20% of positive net only', () => {
  const win = pnlSummary(8_100, 5_000)
  assert.equal(win.netPl, 3_100)
  assert.equal(win.reserve, 620)
  assert.equal(win.preDistMargin, 2_480)

  const loss = pnlSummary(1_000, 2_000)
  assert.equal(loss.netPl, -1_000)
  assert.equal(loss.reserve, 0)
  assert.equal(loss.preDistMargin, -1_000)
})

test('slider unlock ignores FIGURES NEEDED on Gross Box Office / revenue', () => {
  const result = sliderUnlock([
    { field_key: 'gross_box_office', category: 'Revenue', state: 'pending', label: 'Gross Box Office' },
    { field_key: 'venue_hire', category: 'Venue Costs', state: 'estimated', label: 'Venue Hire' },
  ])
  assert.equal(result.unlocked, true)
  assert.deepEqual(result.blocking, [])
})

test('slider unlock blocks FIGURES NEEDED cost lines', () => {
  const result = sliderUnlock([
    { field_key: 'venue_hire', state: 'pending', label: 'Venue Hire', showLabel: 'Hobart' },
    { field_key: 'flights', state: 'figures_needed', label: 'Flights' },
    { field_key: 'food_basics', state: 'guess', label: 'Food & Basics' },
  ])
  assert.equal(result.unlocked, false)
  assert.deepEqual(result.blocking, ['Hobart – Venue Hire', 'Flights'])
})

test('slider unlock allows ESTIMATE / GUESS / CONFIRMED / PAID', () => {
  const result = sliderUnlock([
    { field_key: 'venue_hire', state: 'estimated', label: 'Venue Hire' },
    { field_key: 'venue_staff', state: 'guess', label: 'Venue Staff' },
    { field_key: 'flights', state: 'known', label: 'Flights' },
    { field_key: 'fb_ads', state: 'pending', label: 'Facebook / Social Ads', paidAll: true },
    { field_key: 'social_ads_var', state: 'auto_calc', label: 'Social ads' },
  ])
  assert.equal(result.unlocked, true)
})

test('role gate: owners/admins see top+bottom; production/crew/external do not', () => {
  assert.equal(canSeeOwnerPnlSheet('owner'), true)
  assert.equal(canSeeOwnerPnlSheet('admin'), true)
  assert.equal(canSeeOwnerPnlSheet('production'), false)
  assert.equal(canSeeOwnerPnlSheet('crew'), false)
  assert.equal(canSeeOwnerPnlSheet('external'), false)
  assert.equal(canSeeOwnerPnlSheet(undefined), false)
})

test('inside vs outside placement LOCKED', () => {
  assert.equal(classifyInsidePlacement('Booking fee'), 'inside')
  assert.equal(classifyInsidePlacement('CC fee / merchant processing'), 'inside')
  assert.equal(classifyInsidePlacement('Box office ticketing fee'), 'inside')
  assert.equal(classifyInsidePlacement('Comp ticketing fees'), 'inside')
  assert.equal(classifyInsidePlacement('Inside ticketing'), 'inside')

  assert.equal(classifyInsidePlacement('Venue hire'), 'outside')
  assert.equal(classifyInsidePlacement('FOH staff'), 'outside')
  assert.equal(classifyInsidePlacement('Production / AV'), 'outside')
  assert.equal(classifyInsidePlacement('Venue marketing levy'), 'outside')
  assert.equal(classifyInsidePlacement('Catering rider'), 'outside')
  assert.equal(classifyInsidePlacement('Merch split'), 'outside')
  assert.equal(classifyInsidePlacement('LPA / EIS'), 'outside')
  assert.equal(classifyInsidePlacement('APRA / OneMusic'), 'outside')
  assert.equal(classifyInsidePlacement('BO setup'), 'outside')
  assert.equal(classifyInsidePlacement('Ticketing build'), 'outside')
  assert.equal(classifyInsidePlacement('Ticketing admin'), 'outside')
  assert.equal(classifyInsidePlacement('Poster printing'), 'outside')
})

test('sumKnownInside does not invent; remittance payments are ignored', () => {
  assert.equal(sumKnownInside([]), null)
  assert.equal(sumKnownInside([{ description: 'Venue hire', amount: 900 }]), null)
  assert.equal(
    sumKnownInside([
      { description: 'Booking fee', amount: 120 },
      { description: 'CC merchant', amount: 40 },
    ]),
    160,
  )
  assert.equal(
    remittanceLineCountsAsKnownInside({ line_type: 'payment', description: 'Booking fee' }),
    false,
  )
  assert.equal(
    remittanceLineCountsAsKnownInside({ line_type: 'deduction', description: 'Booking fee' }),
    true,
  )
  assert.equal(
    knownInsideFromRemittance(
      [
        { show_id: 'a', line_type: 'deduction', description: 'Ticketing fee', amount: 80 },
        { show_id: 'b', line_type: 'deduction', description: 'Ticketing fee', amount: 99 },
      ],
      'a',
    ),
    80,
  )
})

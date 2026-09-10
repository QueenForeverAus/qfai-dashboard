import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  ACTUAL_PNL_LABEL,
  EXPECTED_PNL_LABEL,
  childLineKey,
  groupActualsForExpected,
  parentLineKey,
  pnlFromSheetSides,
  rollupVarianceFlags,
  sheetMatchToComparisonRow,
} from '../../lib/settlements-sheet-match.ts'
import { applyCol3Actuals } from '../../lib/settlements-sheet-actuals.ts'
import { buildShowSheetLines } from '../../lib/settlements-sheet.ts'
import { buildChallengeDraft } from '../../lib/remittance.ts'
import type { CostingSnapshotField } from '../../lib/settlements.ts'
import type { SettlementActualLine } from '../../lib/settlements-sheet-actuals.ts'

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

function field(partial: Partial<CostingSnapshotField> & Pick<CostingSnapshotField, 'field_key' | 'label'>): CostingSnapshotField {
  return {
    id: partial.id ?? partial.field_key,
    run_id: 'run-1',
    show_id: partial.show_id ?? pastShow.id,
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

function actual(partial: Partial<SettlementActualLine> & Pick<SettlementActualLine, 'line_key' | 'amount'>): SettlementActualLine {
  return {
    id: partial.id ?? partial.line_key,
    run_id: 'run-1',
    show_id: partial.show_id ?? pastShow.id,
    line_key: partial.line_key,
    line_kind: partial.line_kind ?? 'venue_settlement',
    amount: partial.amount,
    status: partial.status ?? 'confirmed',
    source: partial.source ?? 'harbour_fixture',
    notes: partial.notes ?? null,
    challenge_id: partial.challenge_id ?? null,
    paid: partial.paid ?? false,
    paid_at: partial.paid_at ?? null,
    quote_note: partial.quote_note ?? null,
    attachment_path: null,
    attachment_filename: null,
    attachment_mime: null,
  }
}

test('child keys encode parent::detail for one Col2 → many Col3', () => {
  assert.equal(parentLineKey('show:venue_marketing::edm'), 'show:venue_marketing')
  assert.equal(childLineKey('show:venue_marketing', 'FB ads'), 'show:venue_marketing::fb_ads')
})

test('Venue Marketing Col2 rolls up EDM + banner + FB Col3', () => {
  const grouped = groupActualsForExpected({
    expected: { key: 'show:venue_marketing', label: 'Venue Marketing' },
    showId: pastShow.id,
    actuals: [
      actual({ id: 'a1', line_key: 'show:venue_marketing::edm', amount: 80, notes: 'EDM' }),
      actual({ id: 'a2', line_key: 'show:venue_marketing::banner', amount: 100, notes: 'Banner' }),
      actual({ id: 'a3', line_key: 'show:venue_marketing::fb', amount: 70, notes: 'FB' }),
    ],
  })
  assert.equal(grouped.match, 'rollup')
  assert.equal(grouped.actual, 250)
  assert.equal(grouped.children.length, 3)
  assert.deepEqual(grouped.children.map(c => c.label).sort(), ['Banner', 'EDM', 'FB'])
})

test('heuristic labels EDM campaign / foyer banner / FB ads attach to Venue Marketing', () => {
  const grouped = groupActualsForExpected({
    expected: { key: 'show:venue_marketing', label: 'Venue Marketing' },
    showId: pastShow.id,
    actuals: [
      actual({ id: 'h1', line_key: 'free:edm', amount: 80, notes: 'EDM campaign' }),
      actual({ id: 'h2', line_key: 'free:banner', amount: 90, notes: 'Foyer banner' }),
      actual({ id: 'h3', line_key: 'free:fb', amount: 80, notes: 'FB ads' }),
    ],
  })
  assert.equal(grouped.match, 'rollup')
  assert.equal(grouped.actual, 250)
  assert.ok(grouped.confidence >= 0.7)
})

test('rollup variance uses remittance exact-$ rule; challenge row is rollup + fedBy', () => {
  const flags = rollupVarianceFlags({
    expected: 250,
    actual: 270,
    label: 'Venue Marketing',
    fieldKey: 'venue_marketing',
  })
  assert.ok(flags.some(f => f.code === 'exact-dollar' && f.severity === 'hard'))

  const row = sheetMatchToComparisonRow({
    key: 'show:venue_marketing',
    label: 'Venue Marketing',
    expected: 250,
    actual: 270,
    variance: 20,
    match: 'rollup',
    matchChildren: [
      { id: '1', lineKey: 'show:venue_marketing::edm', label: 'EDM', amount: 90, status: 'confirmed', paid: false, challengeId: null },
      { id: '2', lineKey: 'show:venue_marketing::banner', label: 'Banner', amount: 100, status: 'confirmed', paid: false, challengeId: null },
      { id: '3', lineKey: 'show:venue_marketing::fb', label: 'FB', amount: 80, status: 'confirmed', paid: false, challengeId: null },
    ],
    showId: pastShow.id,
  })
  assert.equal(row.match, 'rollup')
  assert.equal(row.fedBy.length, 3)
  const draft = buildChallengeDraft({
    runCode: 'TCOMP1',
    reason: 'Marketing roll-up is $20 over',
    rows: [row],
    actorName: 'Gareth',
    evidence: { 'Harbour settlement': true },
  })
  assert.match(draft.subject, /draft \(not sent\)/)
  assert.match(draft.body, /never auto-sends/)
})

test('applyCol3Actuals puts the marketing roll-up on the Col2 Venue Marketing row', () => {
  const marketing = field({
    field_key: 'venue_marketing',
    label: 'Venue Marketing',
    value: 250,
    entries: [{ id: 'e1', description: 'Venue Marketing', notes: '', amount: 250, gst_included: true, confirmed: true, paid: false }],
  })
  const { lines } = buildShowSheetLines({
    show: pastShow,
    fields: [marketing],
    tickets: 400,
    ticketsSource: 'entered',
    includeRunCosts: false,
  })
  const decorated = applyCol3Actuals({
    lines,
    showId: pastShow.id,
    actuals: [
      actual({ line_key: 'show:venue_marketing::edm', amount: 80, notes: 'EDM' }),
      actual({ line_key: 'show:venue_marketing::banner', amount: 100, notes: 'Banner' }),
      actual({ line_key: 'show:venue_marketing::fb', amount: 70, notes: 'FB' }),
    ],
  })
  const row = decorated.find(l => l.key === 'show:venue_marketing')
  assert.ok(row)
  assert.equal(row.expected, 250)
  assert.equal(row.actual, 250)
  assert.equal(row.match, 'rollup')
  assert.equal(row.matchChildren?.length, 3)
  assert.equal(row.variance, 0)
})

test('dual P&L footers use computePnlSummary on Col2 expected vs Col3 actual', () => {
  const footer = pnlFromSheetSides({
    netRevenueExpected: 27_000,
    netRevenueActual: 26_800,
    totalCostsExpected: 10_000,
    totalCostsActual: 10_250,
  })
  assert.equal(footer.expectedLabel, EXPECTED_PNL_LABEL)
  assert.equal(footer.actualLabel, ACTUAL_PNL_LABEL)
  assert.equal(footer.expected?.netProfit, 17_000)
  assert.equal(footer.expected?.reserve, 3_400)
  assert.equal(footer.expected?.preDistMargin, 13_600)
  assert.equal(footer.actual?.netProfit, 16_550)
  assert.equal(footer.actual?.reserve, 3_310)
  assert.equal(footer.actual?.preDistMargin, 13_240)
  assert.equal(footer.expected?.gstKnown, false)
  assert.equal(footer.expected?.gstQuarantine, 0)
})

test('dual P&L applies known GST before reserve on both sides', () => {
  const footer = pnlFromSheetSides({
    netRevenueExpected: 27_000,
    netRevenueActual: 26_800,
    totalCostsExpected: 10_000,
    totalCostsActual: 10_250,
    knownGstExpected: 800,
    knownGstActual: 750,
  })
  assert.equal(footer.expected?.netProfit, 17_000)
  assert.equal(footer.expected?.gstQuarantine, 800)
  assert.equal(footer.expected?.exGstProfit, 16_200)
  assert.equal(footer.expected?.reserve, 3_240)
  assert.equal(footer.expected?.preDistMargin, 12_960)
  assert.equal(footer.actual?.gstQuarantine, 750)
  assert.equal(footer.actual?.exGstProfit, 15_800)
  assert.equal(footer.actual?.reserve, 3_160)
  assert.equal(footer.actual?.preDistMargin, 12_640)
})

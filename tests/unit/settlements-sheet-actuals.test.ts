import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  COL3_PLACEHOLDER_NOTE,
  PRE_SHOW_BLOCK_COPY,
  buildShowSheetLines,
  showHasOccurred,
} from '../../lib/settlements-sheet.ts'
import {
  COL3_ACTUALS_NOTE,
  HARBOUR_FIXTURE_BY_VENUE,
  SHEET_BAND_PAID_LOCK,
  SHEET_CHALLENGE_NEVER_SEND_NOTE,
  applyCol3Actuals,
  canEditSheetBandActual,
  harbourFixtureLinesForVenue,
  sheetBandPaidLockViolation,
  sheetLineToComparisonRow,
  sheetVarianceFlag,
  type SettlementActualLine,
} from '../../lib/settlements-sheet-actuals.ts'
import { buildChallengeDraft } from '../../lib/remittance.ts'
import type { CostingSnapshotField } from '../../lib/settlements.ts'

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

function actual(partial: Partial<SettlementActualLine> & Pick<SettlementActualLine, 'line_key' | 'line_kind' | 'amount'>): SettlementActualLine {
  return {
    id: partial.id ?? partial.line_key,
    run_id: 'run-1',
    show_id: partial.show_id ?? 'show-tcomp',
    line_key: partial.line_key,
    line_kind: partial.line_kind,
    amount: partial.amount,
    status: partial.status ?? 'confirmed',
    source: partial.source ?? 'manual',
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

function builtLines() {
  const hire = field({
    field_key: 'venue_hire',
    label: 'Venue Hire',
    show_id: pastShow.id,
    value: 3200,
    entries: [{ id: 'e1', description: 'Hire', notes: '', amount: 3200, gst_included: true, confirmed: true, paid: false }],
  })
  const flights = field({
    field_key: 'flights',
    label: 'Flights',
    category: 'Travel & Accommodation',
    show_id: null,
    value: 1800,
    entries: [{ id: 'e2', description: 'Flights', notes: '', amount: 1800, gst_included: true, confirmed: true, paid: false }],
  })
  return buildShowSheetLines({
    show: pastShow,
    fields: [hire, flights],
    tickets: 400,
    ticketsSource: 'entered',
    includeRunCosts: true,
  }).lines
}

test('pre-show hard block is unchanged in Phase 4', () => {
  assert.equal(showHasOccurred('2026-09-07', '2026-09-07'), false)
  assert.equal(showHasOccurred('2026-09-06', '2026-09-07'), true)
  assert.match(PRE_SHOW_BLOCK_COPY, /Data not yet available — check back when the show has occurred/)
})

test('venue settlement actuals enter as confirmed and flag variance vs Col2', () => {
  const lines = applyCol3Actuals({
    lines: builtLines(),
    actuals: [actual({ line_key: 'show:venue_hire', line_kind: 'venue_settlement', amount: 3100, source: 'harbour_fixture' })],
    showId: pastShow.id,
  })
  const hire = lines.find(l => l.key === 'show:venue_hire')
  assert.ok(hire)
  assert.equal(hire.expected, 3200)
  assert.equal(hire.actual, 3100)
  assert.equal(hire.actualStatus, 'confirmed')
  assert.equal(hire.actualKind, 'venue_settlement')
  assert.equal(hire.variance, -100)
  assert.equal(hire.varianceSeverity, 'hard')
})

test('band costs copy from Advancing and stay editable until PAID', () => {
  const open = applyCol3Actuals({
    lines: builtLines(),
    actuals: [],
    showId: pastShow.id,
  })
  const flights = open.find(l => l.key === 'run:flights')
  assert.ok(flights)
  assert.equal(flights.actual, 1800)
  assert.equal(flights.actualSource, 'advancing_copy')
  assert.equal(flights.actualPaid, false)
  assert.equal(canEditSheetBandActual(flights.actualPaid), true)

  const paid = applyCol3Actuals({
    lines: builtLines(),
    actuals: [actual({
      line_key: 'run:flights',
      line_kind: 'band_cost',
      amount: 1700,
      show_id: pastShow.id,
      paid: true,
      source: 'manual',
    })],
    showId: pastShow.id,
  })
  const locked = paid.find(l => l.key === 'run:flights')
  assert.ok(locked)
  assert.equal(locked.actual, 1700)
  assert.equal(locked.actualPaid, true)
  assert.equal(canEditSheetBandActual(locked.actualPaid), false)
  assert.equal(sheetBandPaidLockViolation({
    existingPaid: true,
    nextPaid: true,
    amountChanged: true,
  }), SHEET_BAND_PAID_LOCK)
  assert.equal(sheetBandPaidLockViolation({
    existingPaid: true,
    nextPaid: false,
    amountChanged: true,
  }), null)
})

test('Col3 P&L is a real sum of actuals', () => {
  const lines = applyCol3Actuals({
    lines: builtLines(),
    actuals: [actual({ line_key: 'show:venue_hire', line_kind: 'venue_settlement', amount: 3100 })],
    showId: pastShow.id,
  })
  const net = lines.find(l => l.key === 'net_revenue')
  const total = lines.find(l => l.key === 'total_costs')
  const profit = lines.find(l => l.key === 'net_profit')
  assert.ok(net?.actual != null && total?.actual != null && profit?.actual != null)
  assert.equal(profit.actual, net.actual - total.actual)
  assert.ok((total.actual ?? 0) >= 3100)
})

test('Challenge draft reuses Wave 1 path and never auto-sends', () => {
  const lines = applyCol3Actuals({
    lines: builtLines(),
    actuals: [actual({ line_key: 'show:venue_hire', line_kind: 'venue_settlement', amount: 3100 })],
    showId: pastShow.id,
  })
  const hire = lines.find(l => l.key === 'show:venue_hire')!
  const row = sheetLineToComparisonRow({ line: hire, showId: pastShow.id })
  assert.ok(row.flags.length > 0)
  assert.equal(row.proposed, 3200)
  assert.equal(row.paid, 3100)
  const draft = buildChallengeDraft({
    runCode: 'TCOMP1',
    reason: 'Hire overstated vs Harbour statement',
    rows: [row],
    actorName: 'Gareth',
    evidence: { 'Harbour settlement': true },
  })
  assert.match(draft.subject, /draft \(not sent\)/)
  assert.match(draft.body, /never auto-sends/)
  assert.match(SHEET_CHALLENGE_NEVER_SEND_NOTE, /never auto-sends/)
  assert.match(COL3_ACTUALS_NOTE, /never auto-sent/)
  assert.match(COL3_PLACEHOLDER_NOTE, /confirmed/)
})

test('Harbour fixture is venue-keyed manual ingest, not OCR', () => {
  const geelong = harbourFixtureLinesForVenue('Geelong Performing Arts Centre')
  assert.ok(geelong.some(l => l.line_key === 'show:venue_hire' && l.amount === 3100))
  assert.equal(HARBOUR_FIXTURE_BY_VENUE['Missing Venue'], undefined)
  assert.equal(harbourFixtureLinesForVenue('R12 future').length, 0)
})

test('count mismatch is a soft variance; exact $1+ is hard', () => {
  const count = sheetVarianceFlag({ expected: 400, actual: 398, kind: 'count' })
  assert.equal(count?.severity, 'soft')
  const money = sheetVarianceFlag({ expected: 3200, actual: 3100, kind: 'money' })
  assert.equal(money?.severity, 'hard')
  assert.equal(sheetVarianceFlag({ expected: 3200, actual: 3200.4, kind: 'money' }), null)
})

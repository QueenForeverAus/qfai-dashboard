import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { computeHarbourCommission, computeOwnerSplits, roundMoney } from '../../lib/pnl-run-costing.ts'
import {
  classifySettlementLine,
  classifySettlementLines,
  pdfInsideKnown,
  pdfTicketBlockPresent,
  resolveDepositNetting,
  resolveStatementInside,
  sumBuckets,
} from '../../lib/settlements-v3-buckets.ts'
import {
  ADVANCING_COSTS_LABEL,
  V3_NO_HARBOUR_IN_S1,
  V3_SECTION1_TITLE,
  buildV3ShowModel,
  computeDueToHirer,
  computeDueToQf,
  computeV3Margin,
  v3HarbourLivesInSection1,
} from '../../lib/settlements-v3.ts'
import { buildShowSheetLines } from '../../lib/settlements-sheet.ts'
import { applyCol3Actuals } from '../../lib/settlements-sheet-actuals.ts'
import { buildV3RedFlags, formatV3NigelAssessment } from '../../lib/settlements-v3-flags.ts'
import { buildAssessmentEmailDraft, defaultDraftKindFromFlags } from '../../lib/settlements-v3-assessment.ts'
import {
  BNZ_HIRE_NET_OF_DEPOSIT_LINES,
  BNZ_INSIDES_OMITTED_LINES,
  BNZ_NETTED_DEPOSIT_LINES,
} from '../../lib/settlements-v3-bnz.ts'

test('LOCKED design doc is in-repo and names the four sections + Finance GREEN', () => {
  const doc = readFileSync(new URL('../../docs/settlements-due-to-hirer-v3.md', import.meta.url), 'utf8')
  assert.match(doc, /Status: LOCKED 2026-09-10/)
  assert.match(doc, /§1 Settlement \(Due to Hirer\)/)
  assert.match(doc, /§2 Remittance \(Due to QF\)/)
  assert.match(doc, /§3 Pre-Distribution Margin/)
  assert.match(doc, /§4 Owner Distribution/)
  assert.match(doc, /NO Harbour 10%/)
  assert.match(doc, /never auto-send/)
  assert.match(doc, /Expected \| Actual \| Δ/)
  assert.match(doc, /not Lead/)
})

test('§1 Due to Hirer has no Harbour 10% and follows +tickets − insides − venue buckets + deposit', () => {
  assert.equal(V3_NO_HARBOUR_IN_S1, true)
  assert.equal(v3HarbourLivesInSection1(), false)
  assert.match(V3_SECTION1_TITLE, /Due to Hirer/)
  const due = computeDueToHirer({
    tickets: 32_000,
    insides: 2_312,
    hire: 3_100,
    staff: 4_150,
    marketing: 250,
    production: 0,
    other: 200,
    appliedDeposit: 930,
  })
  assert.equal(due, 22_918)
  const withHarbour = roundMoney((due ?? 0) - computeHarbourCommission(32_000 - 2_312))
  assert.notEqual(due, withHarbour)
})

test('§2 Harbour 10% is on sales − classic insides, not LPA/EIS/APRA', () => {
  const { harbourCommission, dueToQf } = computeDueToQf({
    dueToHirer: 22_918,
    ticketSales: 32_000,
    classicInsides: 2_312,
    deductibles: 0,
  })
  assert.equal(harbourCommission, computeHarbourCommission(29_688))
  assert.equal(harbourCommission, 2_968.8)
  assert.equal(dueToQf, roundMoney(22_918 - 2_968.8))
  const wronglyOnGross = computeHarbourCommission(32_000)
  assert.notEqual(harbourCommission, wronglyOnGross)
  const lpaAsInside = computeDueToQf({
    dueToHirer: 22_918,
    ticketSales: 32_000,
    classicInsides: 2_312 + 80,
    deductibles: 0,
  })
  assert.notEqual(lpaAsInside.harbourCommission, harbourCommission)
})

test('§3 margin order is remittance − band − GST − 20% ex-GST reserve', () => {
  const margin = computeV3Margin({
    remittance: 20_000,
    bandCosts: 5_000,
    gstQuarantine: 550,
    gstKnown: true,
  })
  assert.equal(margin.gstQuarantine, 550)
  assert.equal(margin.gstKnown, true)
  const afterBand = 15_000
  const afterGst = 14_450
  assert.equal(margin.reserve, roundMoney(afterGst * 0.2))
  assert.equal(margin.preDistMargin, roundMoney(afterGst - (margin.reserve ?? 0)))
  assert.notEqual(margin.reserve, roundMoney(afterBand * 0.2))
  assert.notEqual(margin.gstQuarantine, roundMoney(15_000 / 11))
  assert.deepEqual(margin.ownerSplits, computeOwnerSplits(margin.preDistMargin ?? 0))
  assert.equal(margin.ownerSplits?.gareth, roundMoney((margin.preDistMargin ?? 0) * 0.4))
})

test('classifier buckets Hire / Staff / Marketing / Venue Production/AV / other; LPA is other not inside', () => {
  const lines = classifySettlementLines(BNZ_NETTED_DEPOSIT_LINES)
  const kinds = Object.fromEntries(lines.map(l => [l.description, l.kind]))
  assert.equal(kinds['Gross Ticket Sales'], 'tickets')
  assert.equal(kinds['Booking Fees'], 'inside')
  assert.equal(kinds['Credit Card Fees'], 'inside')
  assert.equal(kinds['Venue Hire'], 'hire')
  assert.equal(kinds['Hire Deposit (credit — already paid)'], 'deposit')
  assert.equal(kinds['Ushers'], 'staff')
  assert.equal(kinds['Security'], 'staff')
  assert.equal(kinds['FOH Manager'], 'staff')
  assert.equal(kinds['Solo EDM'], 'marketing')
  assert.equal(kinds['Banner'], 'marketing')
  assert.equal(kinds['FB campaign'], 'marketing')
  assert.equal(kinds['Sound & Lighting package'], 'production')
  assert.equal(kinds['LPA Fee'], 'other')
  assert.equal(kinds['Electricity'], 'other')
  assert.equal(kinds['Due to Hirer'], 'due_to_hirer')
  assert.equal(classifySettlementLine({ description: 'APRA / OneMusic' }).kind, 'other')
  assert.equal(classifySettlementLine({ description: 'APRA withheld', lineType: 'deduction' }, 'remittance').kind, 'deductible')
})

test('BNZ ticket block makes insides known; omitted insides stay estimated', () => {
  const known = classifySettlementLines(BNZ_NETTED_DEPOSIT_LINES)
  assert.equal(pdfTicketBlockPresent(known), true)
  assert.equal(pdfInsideKnown(known), true)
  const resolved = resolveStatementInside({ lines: known, estimatedInside: 2_000 })
  assert.equal(resolved.source, 'known')
  assert.equal(resolved.amount, 2_312)
  assert.match(resolved.sourceLabel, /known/)

  const omitted = classifySettlementLines(BNZ_INSIDES_OMITTED_LINES)
  assert.equal(pdfTicketBlockPresent(omitted), true)
  assert.equal(pdfInsideKnown(omitted), false)
  const estimated = resolveStatementInside({ lines: omitted, estimatedInside: 900 })
  assert.equal(estimated.source, 'estimated')
  assert.equal(estimated.amount, 900)
  assert.match(estimated.sourceLabel, /estimated/)
  assert.doesNotMatch(estimated.sourceLabel, /^known/)
})

test('Finance GREEN: printed Due to Hirer that already nets deposit is not added twice', () => {
  const lines = classifySettlementLines(BNZ_NETTED_DEPOSIT_LINES)
  const b = sumBuckets(lines)
  assert.equal(b.tickets, 32_000)
  assert.equal(b.inside, 2_312)
  assert.equal(b.hire, 3_100)
  assert.equal(b.staff, 4_150)
  assert.equal(b.marketing, 250)
  assert.equal(b.production, 0)
  assert.equal(b.other, 200)
  assert.equal(b.deposit, 930)
  const netting = resolveDepositNetting({
    tickets: b.tickets,
    insides: b.inside,
    hire: b.hire,
    staff: b.staff,
    marketing: b.marketing,
    production: b.production,
    other: b.other,
    deposit: b.deposit,
    printedDueToHirer: 22_918,
    depositLooksLikeCredit: true,
  })
  assert.equal(netting.alreadyNetted, true)
  assert.equal(netting.appliedDeposit, 930)
  const due = computeDueToHirer({
    tickets: b.tickets,
    insides: b.inside,
    hire: b.hire,
    staff: b.staff,
    marketing: b.marketing,
    production: b.production,
    other: b.other,
    appliedDeposit: netting.appliedDeposit,
  })
  assert.equal(due, 22_918)
  assert.notEqual(roundMoney((due ?? 0) + 930), 22_918)
})

test('Finance GREEN: hire already net of deposit does not also + deposit', () => {
  const lines = classifySettlementLines(BNZ_HIRE_NET_OF_DEPOSIT_LINES)
  const b = sumBuckets(lines)
  const netting = resolveDepositNetting({
    tickets: b.tickets,
    insides: b.inside,
    hire: b.hire,
    staff: b.staff,
    marketing: b.marketing,
    production: b.production,
    other: b.other,
    deposit: b.deposit,
    printedDueToHirer: 12_530,
    depositLooksLikeCredit: true,
  })
  assert.equal(netting.alreadyNetted, true)
  assert.equal(netting.appliedDeposit, 0)
  const due = computeDueToHirer({
    tickets: b.tickets,
    insides: b.inside,
    hire: b.hire,
    staff: b.staff,
    marketing: b.marketing,
    production: b.production,
    other: b.other,
    appliedDeposit: netting.appliedDeposit,
  })
  assert.equal(due, 12_530)
  assert.notEqual(computeDueToHirer({
    tickets: b.tickets,
    insides: b.inside,
    hire: b.hire,
    staff: b.staff,
    marketing: b.marketing,
    production: b.production,
    other: b.other,
    appliedDeposit: 930,
  }), 12_530)
})

test('assessment draft never auto-sends and prefers challenge when flags are hard/soft', () => {
  const model = {
    dueToHirerExpected: 20_000,
    dueToHirerActual: 18_000,
    dueToQfExpected: 18_000,
    dueToQfActual: 16_200,
    preDistExpected: 8_000,
    preDistActual: 6_400,
    ownerSplitsExpected: computeOwnerSplits(8_000),
    ownerSplitsActual: computeOwnerSplits(6_400),
    expected: { harbourCommission: 2_000, gstKnown: false, gstSourceLabel: 'missing' },
    actual: { harbourCommission: 2_000, gstKnown: false, gstSourceLabel: 'missing', depositNetted: false, deposit: 0 },
    depositNetting: null,
    statementLines: [],
    section1: [{
      key: 'hire',
      section: 1 as const,
      label: '− Venue Hire',
      sign: '−' as const,
      expected: 3_000,
      actual: 4_200,
      delta: 1_200,
      kind: 'money' as const,
      children: [],
    }],
    section2: [],
    section3: [],
    section4: [],
  }
  const flags = buildV3RedFlags(model as never)
  assert.ok(flags.some(f => f.code === 'hire-variance' || f.code === 'wild-variance'))
  assert.equal(defaultDraftKindFromFlags(flags), 'harbour_challenge')
  const draft = buildAssessmentEmailDraft({
    kind: 'harbour_challenge',
    runCode: 'SAMP08',
    venueName: 'Harborlight Room',
    actorName: 'Gareth',
    model: model as never,
    flags,
    messages: [{ author_name: 'Gareth', body: 'Hire looks like hotel nights.', created_at: '2026-09-10' }],
  })
  assert.match(draft.body, /never auto-sends/)
  assert.match(draft.body, /Hire looks like hotel nights/)
  assert.match(draft.subject, /not sent/)
  assert.equal(draft.to_label, 'Harbour (agent)')
  const nigel = formatV3NigelAssessment({
    runCode: 'SAMP08',
    venueName: 'Harborlight Room',
    model: model as never,
    flags,
  })
  assert.match(nigel, /Nigel assessment/)
  assert.match(nigel, /challenge/)
})

test('Michael fact-check draft is Nigel→Michael, scoped, preview-only', () => {
  const emptyModel = {
    dueToHirerExpected: 10_000,
    dueToHirerActual: 10_000,
    dueToQfExpected: 9_000,
    dueToQfActual: 9_000,
    preDistExpected: 4_000,
    preDistActual: 4_000,
    ownerSplitsExpected: computeOwnerSplits(4_000),
    ownerSplitsActual: computeOwnerSplits(4_000),
    expected: { harbourCommission: 1_000, gstKnown: true, gstSourceLabel: 'known' },
    actual: { harbourCommission: 1_000, gstKnown: true, gstSourceLabel: 'known', depositNetted: false, deposit: 0 },
    depositNetting: null,
    statementLines: [],
    section1: [
      { key: 'staff', label: '− Venue Staff', expected: 3600, actual: 4150, children: [{ key: 'ushers', label: 'Ushers', expected: 2000, actual: 2200 }] },
      { key: 'production', label: '− Venue Production/AV', expected: 800, actual: 750, children: [{ key: 'av', label: 'Sound & Lighting package', expected: 800, actual: 750 }] },
      { key: 'other', label: '− Other venue charges', expected: 0, actual: 200, children: [
        { key: 'lpa', label: 'LPA Fee', expected: null, actual: 80 },
        { key: 'backline-other', label: 'Extra backline risers', expected: null, actual: 120 },
      ] },
    ],
    section2: [{ key: 'harbour_commission', label: 'Harbour 10%', expected: 1000, actual: 1000, children: [] }],
    section3: [{
      key: 'band_costs',
      label: '− Advancing Costs',
      expected: 5000,
      actual: 5000,
      children: [
        { key: 'run:flights', label: 'Flights', expected: 1840, actual: 1840, note: 'PAID' },
        { key: 'run:backline_hire', label: 'Backline Hire (local)', expected: 330, actual: 330 },
      ],
    }],
    section4: [{ key: 'owner_gareth', label: 'Gareth 40%', expected: 1600, actual: 1600, children: [] }],
  }
  const draft = buildAssessmentEmailDraft({
    kind: 'michael_factcheck',
    runCode: 'SAMP04',
    venueName: 'Northwharf Studio Theatre',
    actorName: 'Gareth',
    model: emptyModel as never,
    flags: [],
    messages: [{ author_name: 'Gareth', body: 'Harbour hire looks high.', created_at: '2026-09-10' }],
  })
  assert.equal(draft.to_label, 'Michael')
  assert.equal(draft.from_label, 'Nigel (tours@)')
  assert.match(draft.body, /From: Nigel \(tours@\)/)
  assert.match(draft.body, /To: Michael/)
  assert.match(draft.body, /Ushers/)
  assert.match(draft.body, /Sound & Lighting package/)
  assert.match(draft.body, /Extra backline risers/)
  assert.match(draft.body, /Backline Hire/)
  assert.match(draft.body, /never auto-sends/)
  assert.match(draft.body, /Not sent/)
  assert.doesNotMatch(draft.body, /Flights/)
  assert.doesNotMatch(draft.body, /Harbour 10%/)
  assert.doesNotMatch(draft.body, /Gareth 40/)
  assert.doesNotMatch(draft.body, /Due to Hirer/)
  assert.doesNotMatch(draft.body, /Pre-Distribution/)
  assert.doesNotMatch(draft.body, /Harbour hire looks high/)
  assert.doesNotMatch(draft.body, /LPA Fee/)
})

test('buildV3ShowModel wires §1–§4 from Advancing expected + classified actuals', () => {
  const show = {
    id: 'show-1',
    venue_name: 'The Marble Room',
    venue_city: 'Port Rowan',
    show_date: '2026-07-18',
    show_order: 1,
    capacity: 420,
    capacity_bands: null,
    ticket_price: 80,
    tickets_sold: 400,
    booking_fee_per_payer: null,
    cc_fee_pct: null,
  }
  const fields = [{
    id: 'f-hire',
    run_id: 'run-1',
    show_id: 'show-1',
    category: 'Venue Costs',
    field_key: 'venue_hire',
    label: 'Venue Hire',
    value: 3100,
    state: 'known',
    source: '$3,100 hire ($930 deposit + $2,170 settlement)',
    entries: [],
    line_items: [],
  }]
  const { lines } = buildShowSheetLines({
    show,
    fields,
    tickets: 400,
    ticketsSource: 'entered',
    includeRunCosts: true,
  })
  assert.ok(lines.some(l => l.key === 'harbour_commission'))
  const decorated = applyCol3Actuals({
    lines,
    actuals: [
      { id: 'a1', run_id: 'r', show_id: 'show-1', line_key: 'show:venue_hire', line_kind: 'venue_settlement', amount: 3100, status: 'confirmed', source: 'harbour_fixture', notes: 'Venue Hire', challenge_id: null, paid: false, paid_at: null, quote_note: null, attachment_path: null, attachment_filename: null, attachment_mime: null },
    ],
    showId: 'show-1',
  })
  const model = buildV3ShowModel({
    showId: 'show-1',
    lines: decorated,
    fields,
    actuals: [],
    statementLines: BNZ_NETTED_DEPOSIT_LINES,
    gstLines: [{ showId: 'show-1', description: 'GST collected', amount: 550 }],
  })
  assert.equal(model.section1.some(r => /Harbour/i.test(r.label)), false)
  assert.ok(model.section2.some(r => r.key === 'harbour_commission'))
  assert.equal(model.dueToHirerActual, 22_918)
  assert.equal(model.actual.insideSource, 'known')
  assert.equal(model.actual.gstKnown, true)
  assert.equal(model.actual.gstQuarantine, 550)
  assert.ok(model.section4.some(r => r.key === 'owner_gareth'))
  assert.equal(model.ownerSplitsActual?.gareth, computeOwnerSplits(model.preDistActual ?? 0).gareth)
  const advancing = model.section3.find(r => r.key === 'band_costs')
  assert.ok(advancing)
  assert.match(advancing.label, new RegExp(ADVANCING_COSTS_LABEL))
})

import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  REMITTANCE_VARIANCE_THRESHOLDS as T,
  apraDoubleUpFlag,
  classifyProposedKind,
  compareRemittance,
  labourHardDollarFloor,
  labourSoftDollarFloor,
  looksLikeApra,
  moneyAbs,
  type PaidLine,
  type ProposedLine,
} from '../../lib/remittance-variance.ts'
import {
  CHALLENGE_NEVER_SEND_NOTE,
  buildChallengeDraft,
  formatChallengeDraftAuditCopy,
  formatRemittanceAcceptedAuditCopy,
  formatRemittanceAddedAuditCopy,
  paidFromRemittance,
  proposedFromSnapshot,
} from '../../lib/remittance.ts'

function proposed(partial: Partial<ProposedLine> & Pick<ProposedLine, 'id' | 'label' | 'amount'>): ProposedLine {
  return {
    show_id: 'show-1',
    source: 'snapshot',
    field_key: null,
    hours: null,
    rate: null,
    headcount: null,
    kind: classifyProposedKind({ label: partial.label, hours: partial.hours, fieldKey: partial.field_key }),
    ...partial,
  }
}

function paid(partial: Partial<PaidLine> & Pick<PaidLine, 'id' | 'description' | 'amount'>): PaidLine {
  return {
    show_id: 'show-1',
    line_type: 'payment',
    hours: null,
    rate: null,
    headcount: null,
    ...partial,
  }
}

test('thresholds module exposes retunable finance defaults', () => {
  assert.equal(T.exactAbsDollars, 1)
  assert.equal(T.labourSoftAbsDollars, 25)
  assert.equal(T.labourSoftPctOfOurs, 0.02)
  assert.equal(T.labourSoftHours, 0.5)
  assert.equal(T.labourHardAbsDollars, 100)
  assert.equal(T.labourHardPctOfOurs, 0.05)
  assert.equal(T.labourHardHours, 2)
  assert.equal(T.rateFloatAbsDollars, 0.01)
})

test('exact hire flags |Δ| ≥ $1 and ignores 0', () => {
  const ok = compareRemittance({
    proposed: [proposed({ id: 'h', label: 'Venue Hire', amount: 1650, field_key: 'venue_hire', kind: 'exact' })],
    paid: [paid({ id: 'p', description: 'Venue Hire', amount: 1650 })],
  })
  assert.equal(ok[0].flags.length, 0)

  const off = compareRemittance({
    proposed: [proposed({ id: 'h', label: 'Venue Hire', amount: 1650, field_key: 'venue_hire', kind: 'exact' })],
    paid: [paid({ id: 'p', description: 'Venue Hire', amount: 1649 })],
  })
  assert.ok(off[0].flags.some(f => f.code === 'exact-dollar' && f.severity === 'hard'))
  assert.equal(moneyAbs(1650, 1649), 1)
})

test('labour soft vs hard dollar floors', () => {
  assert.equal(labourSoftDollarFloor(1000), 25)
  assert.equal(labourSoftDollarFloor(2000), 40)
  assert.equal(labourHardDollarFloor(1000), 100)
  assert.equal(labourHardDollarFloor(3000), 150)

  const soft = compareRemittance({
    proposed: [proposed({ id: 'u', label: 'FOH Staff / Ushers', amount: 1000, hours: 8, kind: 'labour' })],
    paid: [paid({ id: 'p', description: 'Ushers', amount: 1025, hours: 8 })],
  })
  assert.ok(soft[0].flags.some(f => f.code === 'labour-dollar-soft' && f.severity === 'soft'))

  const hard = compareRemittance({
    proposed: [proposed({ id: 'u', label: 'FOH Staff / Ushers', amount: 1000, hours: 8, kind: 'labour' })],
    paid: [paid({ id: 'p', description: 'Ushers', amount: 1100, hours: 8 })],
  })
  assert.ok(hard[0].flags.some(f => f.code === 'labour-dollar-hard' && f.severity === 'hard'))

  const under = compareRemittance({
    proposed: [proposed({ id: 'u', label: 'FOH Staff / Ushers', amount: 1000, hours: 8, kind: 'labour' })],
    paid: [paid({ id: 'p', description: 'Ushers', amount: 1024, hours: 8 })],
  })
  assert.equal(under[0].flags.filter(f => f.kind === 'labour').length, 0)
})

test('labour hours soft 0.5h and hard 2h', () => {
  const soft = compareRemittance({
    proposed: [proposed({ id: 'u', label: 'Ushers', amount: 1000, hours: 8, kind: 'labour' })],
    paid: [paid({ id: 'p', description: 'Ushers', amount: 1000, hours: 8.5 })],
  })
  assert.ok(soft[0].flags.some(f => f.code === 'labour-hours-soft'))

  const hard = compareRemittance({
    proposed: [proposed({ id: 'u', label: 'Ushers', amount: 1000, hours: 8, kind: 'labour' })],
    paid: [paid({ id: 'p', description: 'Ushers', amount: 1000, hours: 10 })],
  })
  assert.ok(hard[0].flags.some(f => f.code === 'labour-hours-hard'))
})

test('rates flag any mismatch above 1¢ float', () => {
  const ok = compareRemittance({
    proposed: [proposed({ id: 'u', label: 'Ushers', amount: 456, hours: 8, rate: 57, kind: 'labour' })],
    paid: [paid({ id: 'p', description: 'Ushers', amount: 456, hours: 8, rate: 57.01 })],
  })
  assert.equal(ok[0].flags.filter(f => f.code === 'rate-mismatch').length, 0)

  const bad = compareRemittance({
    proposed: [proposed({ id: 'u', label: 'Ushers', amount: 456, hours: 8, rate: 57, kind: 'labour' })],
    paid: [paid({ id: 'p', description: 'Ushers', amount: 456, hours: 8, rate: 57.02 })],
  })
  assert.ok(bad[0].flags.some(f => f.code === 'rate-mismatch' && f.severity === 'hard'))
})

test('many↔one usher roll-up compares the summed bucket and lists fed-by lines', () => {
  const rows = compareRemittance({
    proposed: [
      proposed({ id: 'u1', label: 'FOH Staff / Ushers', amount: 1824, hours: 8, kind: 'labour' }),
      proposed({ id: 'u2', label: 'Ushers overtime', amount: 200, hours: 2, kind: 'labour' }),
    ],
    paid: [paid({ id: 'p', description: 'Ushers', amount: 2024 })],
  })
  assert.equal(rows[0].match, 'rollup')
  assert.equal(rows[0].proposed, 2024)
  assert.equal(rows[0].fedBy.length, 2)
  assert.ok(rows[0].confidence >= 0.7)
  assert.equal(rows[0].flags.length, 0)
})

test('APRA deduction + Payer=QF is a HARD double-up; Venue is not', () => {
  assert.equal(looksLikeApra('OneMusic performing rights'), true)
  const qf = apraDoubleUpFlag({
    paidLooksLikeApra: true,
    lineType: 'deduction',
    rightsPayer: 'qf',
    showHasQfRightsCost: false,
  })
  assert.equal(qf?.severity, 'hard')
  assert.equal(qf?.code, 'apra-double-up')

  const venue = apraDoubleUpFlag({
    paidLooksLikeApra: true,
    lineType: 'deduction',
    rightsPayer: 'venue',
    showHasQfRightsCost: true,
  })
  assert.equal(venue, null)

  const rows = compareRemittance({
    proposed: [proposed({ id: 'h', label: 'Venue Hire', amount: 1650, field_key: 'venue_hire' })],
    paid: [paid({ id: 'p', description: 'APRA / OneMusic', amount: 220, line_type: 'deduction' })],
    rightsPayerByShow: { 'show-1': 'qf' },
  })
  assert.ok(rows.some(r => r.flags.some(f => f.code === 'apra-double-up')))
})

test('challenge draft copy is never-send and requires reason at builder level', () => {
  const draft = buildChallengeDraft({
    runCode: 'R12',
    reason: 'Hire is $1 short',
    actorName: 'Test Admin',
    evidence: { 'Locked Run Costing snapshot': true },
    rows: compareRemittance({
      proposed: [proposed({ id: 'h', label: 'Venue Hire', amount: 1650, field_key: 'venue_hire' })],
      paid: [paid({ id: 'p', description: 'Venue Hire', amount: 1649 })],
    }),
  })
  assert.match(draft.subject, /draft \(not sent\)/)
  assert.match(draft.body, /Hire is \$1 short/)
  assert.match(draft.body, /not sent/i)
  assert.match(draft.to_label, /Harbour/)
  assert.equal(draft.body.includes(CHALLENGE_NEVER_SEND_NOTE), true)
})

test('remittance audit sentences are plain language', () => {
  const added = formatRemittanceAddedAuditCopy({
    actorName: 'Test Admin',
    runCode: 'R12',
    description: 'Venue Hire',
    amount: 1649,
    lineType: 'payment',
    showLabel: 'Goulburn',
  })
  assert.match(added.newValue, /entered remittance line Venue Hire/)
  assert.match(added.newValue, /Goulburn/)

  const accepted = formatRemittanceAcceptedAuditCopy({ actorName: 'Test Admin', runCode: 'R12' })
  assert.match(accepted.newValue, /accepted remittance as-is/)
  assert.match(accepted.newValue, /not overwritten/)

  const challenge = formatChallengeDraftAuditCopy({
    actorName: 'Test Admin',
    runCode: 'R12',
    lineCount: 1,
    reason: 'Hire short',
  })
  assert.match(challenge.newValue, /challenge draft/)
  assert.match(challenge.newValue, /not sent/)
})

test('proposedFromSnapshot expands venue_staff roles and hire fields', () => {
  const lines = proposedFromSnapshot([
    {
      id: 'cf-hire',
      run_id: 'r',
      show_id: 's1',
      category: 'Venue Costs',
      field_key: 'venue_hire',
      label: 'Venue Hire',
      value: 1650,
      state: 'estimated',
      source: null,
      entries: [],
      line_items: [],
    },
    {
      id: 'cf-staff',
      run_id: 'r',
      show_id: 's1',
      category: 'Venue Costs',
      field_key: 'venue_staff',
      label: 'Venue Staff',
      value: 2000,
      state: 'estimated',
      source: null,
      entries: [],
      line_items: [
        { id: 'u1', role: 'FOH Staff / Ushers', rate: 57, hours: 8, headcount: 4, confirmed: false },
        { id: 'u2', role: 'Duty Manager', rate: 68, hours: 8, headcount: 1, confirmed: false },
      ],
    },
  ])
  assert.ok(lines.some(l => l.label === 'Venue Hire' && l.amount === 1650 && l.kind === 'exact'))
  const ushers = lines.find(l => l.label.includes('Ushers'))
  assert.ok(ushers)
  assert.equal(ushers!.amount, 57 * 8 * 4)
  assert.equal(ushers!.kind, 'labour')
  assert.equal(paidFromRemittance([]).length, 0)
})

import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  addHoursIso,
  bandCostCloseGate,
  buildCostingSnapshot,
  canAccessSettlements,
  fieldsForShow,
  formatBandCostAddedAuditCopy,
  formatFinaliseAuditCopy,
  formatSettlementsMoney,
  isCostingFinalised,
  nudgeDueFromFinalise,
  nudgeDueFromLastShow,
  parseCostingSnapshot,
  SETTLEMENT_PROPOSED_NOTE,
  shouldShowAgentSettlementEmptyCopy,
} from '../../lib/settlements.ts'

test('admin and owner can access Settlements; production cannot in v1', () => {
  assert.equal(canAccessSettlements('admin'), true)
  assert.equal(canAccessSettlements('owner'), true)
  assert.equal(canAccessSettlements('production'), false)
  assert.equal(canAccessSettlements('crew'), false)
  assert.equal(canAccessSettlements('external'), false)
})

test('Settlement copy says proposed, not cash', () => {
  assert.match(SETTLEMENT_PROPOSED_NOTE, /proposed/i)
  assert.match(SETTLEMENT_PROPOSED_NOTE, /not cash/i)
  assert.doesNotMatch(SETTLEMENT_PROPOSED_NOTE, /remittance received/i)
})

test('Agent Settlement empty copy hides once statement lines exist', () => {
  assert.equal(shouldShowAgentSettlementEmptyCopy([]), true)
  assert.equal(shouldShowAgentSettlementEmptyCopy(null), true)
  assert.equal(shouldShowAgentSettlementEmptyCopy(undefined), true)
  assert.equal(shouldShowAgentSettlementEmptyCopy([{ id: 'line-1' }]), false)
  assert.equal(shouldShowAgentSettlementEmptyCopy([{ id: 'a' }, { id: 'b' }]), false)
})

test('buildCostingSnapshot freezes fields and parse round-trips', () => {
  const capturedAt = '2026-09-07T06:00:00.000Z'
  const snap = buildCostingSnapshot({
    runId: 'run-r12',
    runCode: 'R12',
    capturedAt,
    fields: [{
      id: 'cf-1',
      run_id: 'run-r12',
      show_id: 'show-1',
      category: 'Venue Costs',
      field_key: 'venue_hire',
      label: 'Venue Hire',
      value: 1451,
      state: 'guess',
      source: 'Draft 22',
      entries: [{ id: 'e1', description: 'Hire', notes: '', amount: 1451, gst_included: true, confirmed: true, paid: true }],
      line_items: [],
    }],
  })
  assert.equal(snap.version, 1)
  assert.equal(snap.field_count, 1)
  assert.equal(snap.fields[0].value, 1451)
  const parsed = parseCostingSnapshot(snap)
  assert.ok(parsed)
  assert.equal(parsed!.run_code, 'R12')
  assert.equal(parseCostingSnapshot({ version: 2, fields: [] }), null)
})

test('early Finalise still produces a lockable snapshot', () => {
  const snap = buildCostingSnapshot({
    runId: 'run-r12',
    runCode: 'R12',
    capturedAt: '2026-09-07T06:00:00.000Z',
    fields: [],
  })
  const copy = formatFinaliseAuditCopy({
    actorName: 'Gareth',
    runCode: 'R12',
    fieldCount: snap.field_count,
    early: true,
  })
  assert.equal(copy.fieldName, 'Finalise Costing')
  assert.match(copy.newValue, /finalised Run Costing for R12/)
  assert.match(copy.newValue, /snapshot locked/)
  assert.match(copy.newValue, /Early Finalise/)
  assert.equal(isCostingFinalised({ costing_finalised_at: snap.captured_at }), true)
  assert.equal(isCostingFinalised({ costing_finalised_at: null }), false)
})

test('fieldsForShow keeps run-level lines plus the focused show', () => {
  const fields = [
    { id: '1', run_id: 'r', show_id: 'a', category: 'x', field_key: 'venue_hire', label: 'Hire A', value: 1, state: 'guess', source: null, entries: [], line_items: [] },
    { id: '2', run_id: 'r', show_id: 'b', category: 'x', field_key: 'venue_hire', label: 'Hire B', value: 2, state: 'guess', source: null, entries: [], line_items: [] },
    { id: '3', run_id: 'r', show_id: null, category: 'x', field_key: 'flights', label: 'Flights', value: 3, state: 'guess', source: null, entries: [], line_items: [] },
  ]
  const focused = fieldsForShow(fields, 'a')
  assert.deepEqual(focused.map(f => f.id), ['1', '3'])
})

test('close-gate is display-only: all lines PAID or waived', () => {
  assert.equal(bandCostCloseGate([]).ready, true)
  assert.match(bandCostCloseGate([]).summary, /No band-cost lines/)
  const open = bandCostCloseGate([
    { paid: true, waived: false },
    { paid: false, waived: false },
  ])
  assert.equal(open.ready, false)
  assert.equal(open.open, 1)
  const closed = bandCostCloseGate([
    { paid: true, waived: false },
    { paid: false, waived: true },
  ])
  assert.equal(closed.ready, true)
  assert.equal(closed.waived, 1)
  assert.equal(closed.paid, 1)
  assert.equal(
    bandCostCloseGate([{ paid: true, waived: false }]).ready,
    true,
    'missing attachment must not block close-gate',
  )
})

test('nudge stub is Finalise + 24h', () => {
  const due = nudgeDueFromFinalise('2026-09-07T06:00:00.000Z')
  assert.equal(due, addHoursIso('2026-09-07T06:00:00.000Z', 24))
  const fromShow = nudgeDueFromLastShow('2026-09-07')
  assert.ok(fromShow)
  assert.equal(new Date(fromShow!).getTime() - Date.UTC(2026, 8, 7, 12), 24 * 60 * 60 * 1000)
})

test('band cost add audit names the line and amount', () => {
  const copy = formatBandCostAddedAuditCopy({
    actorName: 'Test Admin',
    runCode: 'R12',
    description: 'Uber',
    amount: 45,
    showLabel: 'Concourse',
  })
  assert.equal(copy.fieldName, 'Band Cost added')
  assert.match(copy.newValue, /Test Admin added band cost Uber/)
  assert.match(copy.newValue, /\$45/)
  assert.match(copy.newValue, /Concourse/)
  assert.equal(formatSettlementsMoney(45), '$45.00')
})

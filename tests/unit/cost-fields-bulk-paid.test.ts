import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  applyBulkMarkAllPaid,
  AUDIT_FIELD_BULK_PAID,
  AUDIT_FIELD_PAID_RESTORE,
  formatBulkPaidAuditCopy,
  formatPaidRestoreAuditCopy,
  formatSectionConfirmedAuditCopy,
  AUDIT_FIELD_SECTION_CONFIRMED,
  hasBulkPaidSnapshot,
  normalizeEntries,
  preservePaidSnapshots,
  restorePaidSnapshot,
  untickedIdsFromPaidSnapshots,
  rolledUpCostFieldState,
  sectionEditSelectValue,
  SECTION_BULK_PAID_VALUE,
  shouldSkipConfirmRollup,
  type CostEntry,
} from '../../lib/cost-fields.ts'

function entry(opts: Partial<CostEntry> & { id: string }): CostEntry {
  return {
    description: 'Line',
    notes: '',
    amount: 10,
    gst_included: true,
    confirmed: false,
    paid: false,
    paid_at: null,
    paid_snapshot: null,
    ...opts,
  }
}

test('applyBulkMarkAllPaid confirms and pays every line, including unticked ones', () => {
  const rows = [
    entry({ id: 'a', description: 'Hotel', confirmed: true, paid: true, paid_at: '2026-01-01T00:00:00.000Z' }),
    entry({ id: 'b', description: 'Rider', confirmed: false, paid: false }),
  ]
  const next = applyBulkMarkAllPaid(rows, '2026-09-07T00:00:00.000Z')
  assert.equal(next[0].paid, true)
  assert.equal(next[0].confirmed, true)
  assert.equal(next[0].paid_at, '2026-01-01T00:00:00.000Z')
  assert.deepEqual(next[0].paid_snapshot, { paid: true, paid_at: '2026-01-01T00:00:00.000Z', confirmed: true })
  assert.equal(next[1].paid, true)
  assert.equal(next[1].confirmed, true)
  assert.equal(next[1].paid_at, '2026-09-07T00:00:00.000Z')
  assert.deepEqual(next[1].paid_snapshot, { paid: false, paid_at: null, confirmed: false })
  assert.deepEqual(untickedIdsFromPaidSnapshots(next), ['b'])
})

test('second bulk keeps the original paid snapshot', () => {
  const first = applyBulkMarkAllPaid(
    [entry({ id: 'a', confirmed: false, paid: false })],
    '2026-09-07T00:00:00.000Z',
  )
  const second = applyBulkMarkAllPaid(first, '2026-09-08T00:00:00.000Z')
  assert.deepEqual(second[0].paid_snapshot, { paid: false, paid_at: null, confirmed: false })
})

test('restorePaidSnapshot restores paid flags only and clears snapshot', () => {
  const afterBulk = applyBulkMarkAllPaid([
    entry({ id: 'a', description: 'Hotel', confirmed: true, paid: true, paid_at: '2026-01-01T00:00:00.000Z' }),
    entry({ id: 'b', description: 'Rider', confirmed: false, paid: false }),
  ], '2026-09-07T00:00:00.000Z')
  const restored = restorePaidSnapshot(afterBulk)
  assert.equal(restored[0].paid, true)
  assert.equal(restored[0].paid_at, '2026-01-01T00:00:00.000Z')
  assert.equal(restored[1].paid, false)
  assert.equal(restored[1].paid_at, null)
  // Attestation implied by bulk is not undone — paid-status only
  assert.equal(restored[1].confirmed, true)
  assert.equal(restored[0].paid_snapshot, null)
  assert.equal(restored[1].paid_snapshot, null)
  assert.equal(hasBulkPaidSnapshot(restored), false)
})

test('sectionEditSelectValue shows MARK ALL AS PAID while snapshot is outstanding', () => {
  const unpaid = [entry({ id: 'a', confirmed: true })]
  assert.equal(sectionEditSelectValue(unpaid, 'known'), 'known')
  const after = applyBulkMarkAllPaid(unpaid)
  assert.equal(sectionEditSelectValue(after, 'guess'), SECTION_BULK_PAID_VALUE)
})

test('preservePaidSnapshots keeps undo map across per-line Pay payloads', () => {
  const afterBulk = applyBulkMarkAllPaid([
    entry({ id: 'a', confirmed: true }),
    entry({ id: 'b', confirmed: false }),
  ])
  const clientOmitted = afterBulk.map(row => ({ ...row, paid_snapshot: null }))
  const kept = preservePaidSnapshots(clientOmitted, afterBulk)
  assert.equal(hasBulkPaidSnapshot(kept), true)
  assert.deepEqual(kept[1].paid_snapshot, afterBulk[1].paid_snapshot)
})

test('normalizeEntries preserves paid_snapshot', () => {
  const rows = normalizeEntries([
    {
      id: 'a',
      description: 'Hotel',
      notes: '',
      amount: 1,
      gst_included: true,
      confirmed: true,
      paid: true,
      paid_at: '2026-09-01T12:00:00.000Z',
      paid_snapshot: { paid: false, paid_at: null, confirmed: false },
    },
  ])
  assert.deepEqual(rows?.[0].paid_snapshot, { paid: false, paid_at: null, confirmed: false })
})

test('bulk pay / restore skip confirm rollup so figure-source state is not clobbered', () => {
  assert.equal(shouldSkipConfirmRollup({ bulkPaidApplied: true }), true)
  assert.equal(shouldSkipConfirmRollup({ snapshotRestored: true }), true)
  assert.equal(shouldSkipConfirmRollup({}), false)
  const allConfirmedAfterBulk = [
    entry({ id: 'a', confirmed: true, paid: true }),
    entry({ id: 'b', confirmed: true, paid: true }),
  ]
  assert.equal(
    rolledUpCostFieldState({ entries: allConfirmedAfterBulk, currentState: 'estimated' }),
    'known',
  )
})

test('MARK ALL AS PAID audit copy is plain language and calls out unticked lines', () => {
  const copy = formatBulkPaidAuditCopy({
    actorName: 'Gareth',
    sectionLabel: 'Venue Staff / On-costs',
    showLabel: 'Broken Hill Civic',
    runCode: 'G2 R01',
    entries: [
      entry({ id: 'aaaaaaaa-1111', description: 'Ushers', confirmed: true, paid: true }),
      entry({ id: 'bbbbbbbb-2222', description: 'Rider', confirmed: false }),
      entry({ id: 'cccccccc-3333', description: 'Extra usher', confirmed: false }),
    ],
  })
  assert.equal(copy.fieldName, AUDIT_FIELD_BULK_PAID)
  assert.match(copy.oldValue, /1 of 3 lines already paid/)
  assert.match(copy.newValue, /Gareth marked all lines in Venue Staff \/ On-costs \(Broken Hill Civic, run G2 R01\) as PAID/)
  assert.match(copy.newValue, /3 lines/)
  assert.match(copy.newValue, /2 were not confirm-ticked/)
  assert.match(copy.newValue, /Rider/)
  assert.match(copy.newValue, /Extra usher/)
  assert.match(copy.newValue, /bbbbbbbb/)
  assert.match(copy.newValue, /ids: bbbbbbbb-2222, cccccccc-3333/)
})

test('restore audit copy lists lines that became unpaid again', () => {
  const before = applyBulkMarkAllPaid([
    entry({ id: 'aaaaaaaa-1111', description: 'Ushers', confirmed: true, paid: true, paid_at: '2026-01-01T00:00:00.000Z' }),
    entry({ id: 'bbbbbbbb-2222', description: 'Rider', confirmed: false }),
  ])
  const after = restorePaidSnapshot(before)
  const copy = formatPaidRestoreAuditCopy({
    actorName: 'Gareth',
    sectionLabel: 'Venue Staff',
    runCode: 'TEST01',
    before,
    after,
  })
  assert.equal(copy.fieldName, AUDIT_FIELD_PAID_RESTORE)
  assert.match(copy.newValue, /Gareth restored prior PAID snapshot for Venue Staff \(run TEST01\)/)
  assert.match(copy.newValue, /1 line unpaid again/)
  assert.match(copy.newValue, /Rider/)
  assert.doesNotMatch(copy.newValue, /known|estimated|guess|figures/i)
})

test('section confirm roll-up audit copy is distinct from PAID and KNOWN', () => {
  const copy = formatSectionConfirmedAuditCopy({
    actorName: 'Gareth',
    sectionLabel: 'Venue Staff',
    lineCount: 8,
  })
  assert.equal(copy.fieldName, AUDIT_FIELD_SECTION_CONFIRMED)
  assert.equal(copy.newValue, 'Gareth confirmed the Venue Staff section (all 8 lines ticked).')
  assert.doesNotMatch(copy.newValue, /PAID|KNOWN|ESTIMATE/)
})

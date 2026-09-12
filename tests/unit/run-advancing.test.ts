import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isRunCostSheetFrozen, isFrozenCostLineMutation } from '../../lib/booked-cost-freeze.ts'
import {
  ADVANCING_CHECKLIST_TAB_LABEL,
  ADVANCING_WRITES_BACK_TO_COSTING,
  applyAdvancingChromePatch,
  advancingWriteBackBlocked,
  ADVANCING_NULL_SHOW_SENTINEL,
  advancingCopyLineKey,
  buildAdvancingFieldCopies,
  buildAdvancingShowsChrome,
  dedupeCostFieldsForAdvancingCopy,
  formatRunAdvancingArchiveAuditCopy,
  formatRunAdvancingCopyAuditCopy,
  isAdvancingWorkspaceActive,
  isPnlChromeShowField,
  mergeShowsWithAdvancingChrome,
  pnlChromeMutationBlockedReason,
  PNL_CHROME_LOCKED_ERROR,
  RUN_ADVANCING_TAB,
  RUN_ADVANCING_TAB_LABEL,
  shouldArchiveAdvancingWorkspace,
  shouldCopyRunIntoAdvancing,
  shouldEnsureAdvancingWorkspaceForBookedRun,
  TOUR_DESK_V2_SETTINGS_LOCK_ON,
  WORKSHEET_TAB_LABEL,
} from '../../lib/run-advancing.ts'

const venueHire = {
  id: 'cf-hire',
  run_id: 'run-r12',
  show_id: 'show-1',
  category: 'Venue Costs',
  field_key: 'venue_hire',
  label: 'Venue Hire',
  value: 1451,
  state: 'guess',
  source: 'Draft',
  entries: [{ id: 'e1', description: 'Hire', notes: '', amount: 1451, gst_included: true, confirmed: true, paid: false }],
  line_items: [],
}

describe('Tour Desk v2 Phase 1 — Run Advancing', () => {
  it('hardcodes Settings lock ON and never writes Advancing back to Costing', () => {
    assert.equal(TOUR_DESK_V2_SETTINGS_LOCK_ON, true)
    assert.equal(ADVANCING_WRITES_BACK_TO_COSTING, false)
    assert.equal(advancingWriteBackBlocked(), true)
  })

  it('names Advancing tabs Run Advancing / Advancing Checklist / Worksheet', () => {
    assert.equal(RUN_ADVANCING_TAB, 'run_advancing')
    assert.equal(RUN_ADVANCING_TAB_LABEL, 'Run Advancing')
    assert.equal(ADVANCING_CHECKLIST_TAB_LABEL, 'Advancing Checklist')
    assert.equal(WORKSHEET_TAB_LABEL, 'Worksheet')
  })

  it('copies the whole run into Advancing on BOOKED and is idempotent while still BOOKED', () => {
    assert.equal(shouldCopyRunIntoAdvancing({
      nextStatus: 'confirmed',
      prevStatus: 'proposed',
      hasActiveWorkspace: false,
    }), true)
    assert.equal(shouldCopyRunIntoAdvancing({
      nextStatus: 'confirmed',
      prevStatus: 'confirmed',
      hasActiveWorkspace: true,
    }), false)
    assert.equal(shouldCopyRunIntoAdvancing({
      nextStatus: 'confirmed',
      prevStatus: 'confirmed',
      hasActiveWorkspace: false,
    }), true)
    assert.equal(shouldCopyRunIntoAdvancing({
      nextStatus: 'proposed',
      prevStatus: 'confirmed',
      hasActiveWorkspace: true,
    }), false)
  })

  it('recopies after UNBOOKED then BOOKED again', () => {
    assert.equal(shouldCopyRunIntoAdvancing({
      nextStatus: 'confirmed',
      prevStatus: 'proposed',
      hasActiveWorkspace: false,
    }), true)
  })

  it('catch-up copies a BOOKED run with no active workspace and is otherwise a no-op', () => {
    assert.equal(shouldEnsureAdvancingWorkspaceForBookedRun({
      status: 'confirmed',
      hasActiveWorkspace: false,
    }), true)
    assert.equal(shouldEnsureAdvancingWorkspaceForBookedRun({
      status: 'confirmed',
      hasActiveWorkspace: true,
    }), false)
    assert.equal(shouldEnsureAdvancingWorkspaceForBookedRun({
      status: 'proposed',
      hasActiveWorkspace: false,
    }), false)
    assert.equal(shouldEnsureAdvancingWorkspaceForBookedRun({
      status: 'proposed',
      hasActiveWorkspace: true,
    }), false)
    // Archived workspace is not active — create a new active row, do not revive/wipe the archive.
    assert.equal(shouldEnsureAdvancingWorkspaceForBookedRun({
      status: 'confirmed',
      hasActiveWorkspace: false,
    }), true)
  })

  it('soft-archives Advancing on UNBOOKED and unlocks Costing', () => {
    assert.equal(shouldArchiveAdvancingWorkspace({
      nextStatus: 'proposed',
      prevStatus: 'confirmed',
      hasActiveWorkspace: true,
    }), true)
    assert.equal(shouldArchiveAdvancingWorkspace({
      nextStatus: 'confirmed',
      prevStatus: 'confirmed',
      hasActiveWorkspace: true,
    }), false)
    assert.equal(shouldArchiveAdvancingWorkspace({
      nextStatus: 'proposed',
      prevStatus: 'proposed',
      hasActiveWorkspace: false,
    }), false)
    assert.equal(isRunCostSheetFrozen({ status: 'proposed' }), false)
    assert.equal(isRunCostSheetFrozen({ status: 'confirmed' }), true)
  })

  it('treats archived_at as a soft-archive, not a delete', () => {
    assert.equal(isAdvancingWorkspaceActive({ archived_at: null }), true)
    assert.equal(isAdvancingWorkspaceActive({ archived_at: '2026-09-08T00:00:00.000Z' }), false)
    assert.equal(isAdvancingWorkspaceActive(null), false)
  })

  it('copies cost lines and P&L chrome without sharing live Costing rows', () => {
    const copies = buildAdvancingFieldCopies('ws-1', 'run-r12', [venueHire])
    assert.equal(copies.length, 1)
    assert.equal(copies[0].workspace_id, 'ws-1')
    assert.equal(copies[0].source_cost_field_id, 'cf-hire')
    assert.equal(copies[0].field_key, 'venue_hire')
    assert.equal(copies[0].value, 1451)
    assert.notEqual(copies[0].source_cost_field_id, copies[0].workspace_id)

    const chrome = buildAdvancingShowsChrome([{
      id: 'show-1',
      ticket_price: 89,
      capacity: 400,
      capacity_bands: [{ seats: 400, label: 'Full' }],
      booking_fee_per_payer: 4.5,
      cc_fee_pct: 1.5,
    }])
    assert.equal(chrome[0].show_id, 'show-1')
    assert.equal(chrome[0].ticket_price, 89)
    assert.equal(chrome[0].booking_fee_per_payer, 4.5)
  })

  it('dedupes source cost_fields by show_id+field_key so Advancing copy still succeeds', () => {
    const stale = {
      ...venueHire,
      id: 'cf-hire-stale',
      value: 1400,
      updated_at: '2026-08-01T00:00:00.000Z',
    }
    const latest = {
      ...venueHire,
      id: 'cf-hire-latest',
      value: 1600,
      updated_at: '2026-09-08T10:00:00.000Z',
    }
    const copies = buildAdvancingFieldCopies('ws-1', 'run-r12', [stale, latest, venueHire])
    assert.equal(copies.length, 1)
    assert.equal(copies[0].source_cost_field_id, 'cf-hire-latest')
    assert.equal(copies[0].value, 1600)
    assert.equal(copies[0].field_key, 'venue_hire')
    assert.equal(copies[0].show_id, 'show-1')

    const keys = copies.map(row => advancingCopyLineKey(row))
    assert.equal(new Set(keys).size, keys.length)
  })

  it('dedupes null show_id duplicates the way R01 crew_travel_day collides on the unique index', () => {
    const older = {
      id: 'cf-travel-older',
      run_id: 'run-r01',
      show_id: null,
      category: 'Crew',
      field_key: 'crew_travel_day',
      label: 'Travel Day',
      value: 200,
      state: 'guess',
      source: 'Draft',
      entries: [],
      line_items: [],
      updated_at: '2026-07-01T00:00:00.000Z',
    }
    const newer = {
      ...older,
      id: 'cf-travel-newer',
      value: 350,
      updated_at: '2026-09-08T09:00:00.000Z',
    }
    const other = {
      ...older,
      id: 'cf-per-diem',
      field_key: 'crew_per_diem',
      label: 'Per Diem',
      value: 80,
    }

    const winners = dedupeCostFieldsForAdvancingCopy([older, newer, other])
    assert.equal(winners.length, 2)
    const travel = winners.find(row => row.field_key === 'crew_travel_day')
    assert.equal(travel?.id, 'cf-travel-newer')
    assert.equal(travel?.value, 350)
    assert.equal(advancingCopyLineKey(older), `${ADVANCING_NULL_SHOW_SENTINEL}:crew_travel_day`)
    assert.equal(advancingCopyLineKey(newer), advancingCopyLineKey(older))

    const copies = buildAdvancingFieldCopies('ws-r01', 'run-r01', [older, newer, other])
    assert.equal(copies.length, 2)
    const keys = copies.map(row => advancingCopyLineKey(row))
    assert.equal(new Set(keys).size, keys.length)
    assert.equal(copies.filter(row => row.field_key === 'crew_travel_day').length, 1)
    assert.equal(
      copies.find(row => row.field_key === 'crew_travel_day')?.source_cost_field_id,
      'cf-travel-newer',
    )
  })

  it('breaks equal updated_at ties with the highest source id', () => {
    const a = {
      ...venueHire,
      id: 'cf-aaa',
      value: 1,
      updated_at: '2026-09-08T00:00:00.000Z',
    }
    const b = {
      ...venueHire,
      id: 'cf-zzz',
      value: 2,
      updated_at: '2026-09-08T00:00:00.000Z',
    }
    const copies = buildAdvancingFieldCopies('ws-1', 'run-r12', [a, b])
    assert.equal(copies.length, 1)
    assert.equal(copies[0].source_cost_field_id, 'cf-zzz')
    assert.equal(copies[0].value, 2)
  })

  it('merges Advancing chrome onto shows without mutating the source array', () => {
    const shows = [{
      id: 'show-1',
      ticket_price: 89,
      capacity: 400,
      booking_fee_per_payer: null as number | null,
      cc_fee_pct: null as number | null,
    }]
    const merged = mergeShowsWithAdvancingChrome(shows, [{
      show_id: 'show-1',
      ticket_price: 95,
      capacity: 420,
      capacity_bands: null,
      booking_fee_per_payer: 5,
      cc_fee_pct: 2,
    }])
    assert.equal(merged[0].ticket_price, 95)
    assert.equal(shows[0].ticket_price, 89)
    const patched = applyAdvancingChromePatch([], 'show-1', { ticket_price: 99 })
    assert.equal(patched[0].ticket_price, 99)
  })

  it('locks Costing cost-line mutations and P&L chrome when BOOKED; sliders stay unfrozen', () => {
    assert.equal(isFrozenCostLineMutation('entries'), true)
    assert.equal(isFrozenCostLineMutation('sell_through_pct'), false)
    assert.equal(isPnlChromeShowField('ticket_price'), true)
    assert.equal(isPnlChromeShowField('capacity'), true)
    assert.equal(isPnlChromeShowField('booking_fee_per_payer'), true)
    assert.equal(isPnlChromeShowField('sell_through_pct'), false)
    assert.equal(pnlChromeMutationBlockedReason(true), PNL_CHROME_LOCKED_ERROR)
    assert.equal(pnlChromeMutationBlockedReason(false), null)
  })

  it('writes copy / archive audit sentences that do not mention Settlements Finalise or write-back', () => {
    const copy = formatRunAdvancingCopyAuditCopy({
      actorName: 'Gareth',
      runCode: 'R12',
      fieldCount: 12,
    })
    assert.equal(copy.fieldName, 'Run Advancing copy')
    assert.match(copy.newValue, /copied the R12 cost sheet into Run Advancing/)
    assert.doesNotMatch(copy.newValue, /Finalise/i)
    assert.doesNotMatch(copy.newValue, /write back/i)

    const archive = formatRunAdvancingArchiveAuditCopy({
      actorName: 'Gareth',
      runCode: 'R12',
    })
    assert.match(archive.newValue, /soft-archived the R12 Run Advancing workspace on UNBOOKED/)
    assert.match(archive.newValue, /editable again/)
  })
})

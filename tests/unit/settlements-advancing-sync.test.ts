import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  SETTLEMENTS_COL2_WRITES_COST_FIELDS,
  resolveSettlementExpectedLive,
} from '../../lib/settlements-expected.ts'
import {
  NO_ADVANCING_FIELD_NOTE,
  NO_WORKSPACE_WRITEBACK_NOTE,
  SETTLEMENTS_SYNC_OVERWRITES_ACTUAL,
  SETTLEMENTS_SYNC_WRITES_COST_FIELDS,
  SOURCE_NOTE_REQUIRED,
  TICKETS_LOCKED_NOTE,
  actualWinsActual,
  advancingTicketsLocked,
  findAdvancingFieldForSheetKey,
  planActualWriteBack,
  sharedCostLineFromSheetKey,
  sourceNoteRequiredError,
  ticketLockFromActuals,
} from '../../lib/settlements-advancing-sync.ts'

const hireField = {
  id: 'af-hire',
  field_key: 'venue_hire',
  show_id: 'show-1',
  label: 'Venue Hire',
  value: 1451,
  state: 'guess',
  source: 'GUESS',
  entries: [{
    id: 'e1',
    description: 'Hire estimate',
    notes: '',
    amount: 1451,
    gst_included: true,
    confirmed: false,
    paid: false,
  }],
  line_items: [],
}

const paidHire = {
  ...hireField,
  state: 'known',
  source: 'Receipt',
  entries: [{
    ...hireField.entries[0]!,
    amount: 1600,
    confirmed: true,
    paid: true,
    paid_at: '2026-09-01T00:00:00.000Z',
    notes: 'from Advancing',
  }],
}

describe('live Expected bind (Col2)', () => {
  it('binds Expected to advancing_cost_fields when a workspace is active', () => {
    const resolved = resolveSettlementExpectedLive({
      advancingWorkspace: { archived_at: null },
      advancingFields: [hireField],
      costingFields: [{ ...hireField, id: 'cf-hire', value: 900 }],
    })
    assert.equal(resolved.source, 'advancing')
    assert.equal(resolved.fields[0]?.id, 'af-hire')
    assert.equal(resolved.fields[0]?.value, 1451)
    assert.equal(SETTLEMENTS_COL2_WRITES_COST_FIELDS, false)
    assert.equal(SETTLEMENTS_SYNC_WRITES_COST_FIELDS, false)
  })

  it('falls back to cost_fields when no active workspace exists', () => {
    const resolved = resolveSettlementExpectedLive({
      advancingWorkspace: null,
      advancingFields: [hireField],
      costingFields: [{ ...hireField, id: 'cf-hire', value: 900 }],
    })
    assert.equal(resolved.source, 'costing_fallback')
    assert.equal(resolved.fields[0]?.id, 'cf-hire')
    assert.equal(resolved.fields[0]?.value, 900)
  })
})

describe('Actual PAID → Advancing write-back', () => {
  it('writes Actual known to Advancing as known (not PAID)', () => {
    const plan = planActualWriteBack({
      lineKey: 'show:venue_hire',
      showId: 'show-1',
      actualAmount: 3100,
      markPaid: false,
      sourceNote: 'from Harbour settlement 10/04/26',
      advancingWorkspaceActive: true,
      advancingField: hireField,
      now: '2026-09-12T00:00:00.000Z',
    })
    assert.equal(plan.ok, true)
    assert.equal(plan.action, 'mark_known')
    assert.equal(plan.next_state, 'known')
    assert.equal(plan.next_value, 3100)
    assert.equal(plan.next_entries?.[0]?.paid, false)
    assert.equal(plan.next_entries?.[0]?.confirmed, true)
    assert.equal(plan.next_entries?.[0]?.amount, 3100)
    assert.equal(plan.next_source, 'from Harbour settlement 10/04/26')
    assert.equal(plan.overwrites_actual, false)
    assert.equal(plan.writes_cost_fields, false)
  })

  it('writes Actual PAID to Advancing as known + PAID flags', () => {
    const plan = planActualWriteBack({
      lineKey: 'run:flights',
      showId: null,
      actualAmount: 420,
      markPaid: true,
      sourceNote: 'Scott — Qantas receipt 12/09/26',
      advancingWorkspaceActive: true,
      advancingField: {
        id: 'af-flights',
        field_key: 'flights',
        show_id: null,
        label: 'Flights',
        value: 380,
        state: 'estimated',
        entries: [{
          id: 'f1',
          description: 'Flights',
          notes: '',
          amount: 380,
          gst_included: true,
          confirmed: false,
          paid: false,
        }],
      },
      now: '2026-09-12T00:00:00.000Z',
    })
    assert.equal(plan.action, 'mark_paid')
    assert.equal(plan.next_state, 'known')
    assert.equal(plan.next_entries?.[0]?.paid, true)
    assert.equal(plan.next_entries?.[0]?.confirmed, true)
    assert.equal(plan.next_entries?.[0]?.paid_at, '2026-09-12T00:00:00.000Z')
    assert.equal(plan.next_value, 420)
  })

  it('does not double-PAID — syncs Actual amount onto already-PAID Advancing', () => {
    const plan = planActualWriteBack({
      lineKey: 'show:venue_hire',
      showId: 'show-1',
      actualAmount: 3100,
      markPaid: true,
      sourceNote: 'from settlement sheet — Scott',
      advancingWorkspaceActive: true,
      advancingField: paidHire,
      now: '2026-09-12T00:00:00.000Z',
    })
    assert.equal(plan.action, 'sync_amount')
    assert.equal(plan.already_paid_on_advancing, true)
    assert.equal(plan.next_entries?.[0]?.id, 'e1')
    assert.equal(plan.next_entries?.[0]?.paid, true)
    assert.equal(plan.next_entries?.[0]?.paid_at, '2026-09-01T00:00:00.000Z')
    assert.equal(plan.next_value, 3100)
    assert.match(plan.reason, /one PAID truth/)
  })

  it('never overwrites Settlements Actual with an Advancing estimate', () => {
    assert.equal(SETTLEMENTS_SYNC_OVERWRITES_ACTUAL, false)
    const kept = actualWinsActual({ actualAmount: 3100, advancingEstimate: 1451 })
    assert.equal(kept.actual, 3100)
    assert.equal(kept.copied_from_advancing, false)
    const empty = actualWinsActual({ actualAmount: null, advancingEstimate: 1451 })
    assert.equal(empty.actual, null)
    assert.equal(empty.copied_from_advancing, false)
  })

  it('skips write-back without a workspace or matching field', () => {
    const noWs = planActualWriteBack({
      lineKey: 'show:venue_hire',
      showId: 'show-1',
      actualAmount: 3100,
      markPaid: true,
      sourceNote: 'from sheet',
      advancingWorkspaceActive: false,
      advancingField: hireField,
    })
    assert.equal(noWs.action, 'none')
    assert.equal(noWs.reason, NO_WORKSPACE_WRITEBACK_NOTE)

    const noField = planActualWriteBack({
      lineKey: 'show:venue_hire',
      showId: 'show-1',
      actualAmount: 3100,
      markPaid: true,
      sourceNote: 'from sheet',
      advancingWorkspaceActive: true,
      advancingField: null,
    })
    assert.equal(noField.reason, NO_ADVANCING_FIELD_NOTE)

    const child = planActualWriteBack({
      lineKey: 'show:venue_marketing::edm',
      showId: 'show-1',
      actualAmount: 80,
      markPaid: true,
      sourceNote: 'from sheet',
      advancingWorkspaceActive: true,
      advancingField: hireField,
    })
    assert.equal(child.action, 'none')
  })

  it('maps parent sheet keys onto advancing_cost_fields only', () => {
    assert.deepEqual(sharedCostLineFromSheetKey('show:venue_hire'), { fieldKey: 'venue_hire', scope: 'show' })
    assert.deepEqual(sharedCostLineFromSheetKey('run:flights'), { fieldKey: 'flights', scope: 'run' })
    assert.equal(sharedCostLineFromSheetKey('show:due_to_hirer'), null)
    assert.equal(sharedCostLineFromSheetKey('run:social_ads_var'), null)
    assert.equal(sharedCostLineFromSheetKey('tickets_sold'), null)
    const found = findAdvancingFieldForSheetKey([hireField], 'show:venue_hire', 'show-1')
    assert.equal(found?.id, 'af-hire')
    assert.equal(findAdvancingFieldForSheetKey([hireField], 'show:venue_hire', 'other'), undefined)
  })
})

describe('ticket lock when Actual tickets known', () => {
  it('locks Advancing tickets after the show when sheet/scrape actuals exist', () => {
    assert.equal(advancingTicketsLocked({
      showDate: '2026-07-18',
      actualTickets: 318,
      source: 'email_scrape',
      today: '2026-09-12',
    }), true)
    assert.equal(advancingTicketsLocked({
      showDate: '2026-07-18',
      actualTickets: 400,
      source: 'manual',
      today: '2026-09-12',
    }), true)
    const fromSheet = ticketLockFromActuals({
      showId: 'show-1',
      showDate: '2026-07-18',
      actuals: [{
        show_id: 'show-1',
        line_key: 'tickets_sold',
        amount: 318,
        source: 'email_scrape',
        notes: 'from Laycock settlement 10/04/26 · tickets.csv',
      }],
      today: '2026-09-12',
    })
    assert.equal(fromSheet.locked, true)
    assert.equal(fromSheet.tickets, 318)
    assert.equal(fromSheet.sourceNote, 'from Laycock settlement 10/04/26 · tickets.csv')
    assert.match(TICKETS_LOCKED_NOTE, /settlement sheet \/ email scrape/)
  })

  it('does not lock before the show, without tickets, or without a sheet/scrape source', () => {
    assert.equal(advancingTicketsLocked({
      showDate: '2026-12-01',
      actualTickets: 400,
      source: 'email_scrape',
      today: '2026-09-12',
    }), false)
    assert.equal(advancingTicketsLocked({
      showDate: '2026-07-18',
      actualTickets: null,
      source: 'email_scrape',
      today: '2026-09-12',
    }), false)
    assert.equal(advancingTicketsLocked({
      showDate: '2026-07-18',
      actualTickets: 400,
      source: 'advancing_copy',
      today: '2026-09-12',
    }), false)
    const showsOnly = ticketLockFromActuals({
      showId: 'show-1',
      showDate: '2026-07-18',
      ticketsSold: 400,
      actuals: [],
      today: '2026-09-12',
    })
    assert.equal(showsOnly.locked, false)
  })
})

describe('source required on write paths', () => {
  it('rejects blank source notes on write-back and ticket lock writes', () => {
    assert.equal(sourceNoteRequiredError(''), SOURCE_NOTE_REQUIRED)
    assert.equal(sourceNoteRequiredError('   '), SOURCE_NOTE_REQUIRED)
    assert.equal(sourceNoteRequiredError('from Harbour settlement'), null)
    const plan = planActualWriteBack({
      lineKey: 'show:venue_hire',
      showId: 'show-1',
      actualAmount: 3100,
      markPaid: true,
      sourceNote: '',
      advancingWorkspaceActive: true,
      advancingField: hireField,
    })
    assert.equal(plan.ok, false)
    assert.equal(plan.error, SOURCE_NOTE_REQUIRED)
  })
})

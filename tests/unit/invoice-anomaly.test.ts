import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  ANOMALY_NOTE_REQUIRED_FALLBACK,
  INVOICED_FIELD_STATE,
  normalizeEntries,
  normalizeLineItems,
  type CostEntry,
} from '../../lib/cost-fields.ts'
import {
  ANOMALY_ABS_THRESHOLD_AUD,
  ANOMALY_REL_THRESHOLD,
  NEW_INVOICE_LINE_NOTE,
  applyInvoiceToEntries,
  decideInvoiceAnomaly,
  isSignificantInvoiceDelta,
} from '../../lib/invoice-anomaly.ts'
import {
  mergeCostingCopiesPreservingAdvancing,
  preservePaidEntries,
  shouldPreserveAdvancingEntry,
} from '../../lib/advancing-preserve.ts'
import { buildShowSheetLines } from '../../lib/settlements-sheet.ts'
import type { CostingSnapshotField } from '../../lib/settlements.ts'

function line(partial: Partial<CostEntry> & { id: string }): CostEntry {
  return {
    description: 'Lighting hire',
    notes: '',
    amount: 330,
    gst_included: true,
    confirmed: true,
    paid: false,
    paid_at: null,
    anomaly: false,
    anomaly_note: null,
    ...partial,
  }
}

describe('invoice anomaly thresholds', () => {
  it('ordinary match under A$100 and 20% is not significant', () => {
    assert.equal(isSignificantInvoiceDelta(1000, 1050), false)
    assert.equal(isSignificantInvoiceDelta(330, 360), false)
    assert.equal(decideInvoiceAnomaly({
      createdNew: false,
      expected: 550,
      invoiced: 550,
    }).anomaly, false)
  })

  it('flags absolute Δ ≥ A$100 even when relative is under 20%', () => {
    assert.equal(ANOMALY_ABS_THRESHOLD_AUD, 100)
    assert.equal(isSignificantInvoiceDelta(2000, 2110), true)
    const decision = decideInvoiceAnomaly({
      createdNew: false,
      expected: 330,
      invoiced: 1100,
    })
    assert.equal(decision.anomaly, true)
    assert.equal(decision.kind, 'delta')
  })

  it('flags relative Δ ≥ ~20% even when absolute is under A$100', () => {
    assert.equal(ANOMALY_REL_THRESHOLD, 0.20)
    assert.equal(isSignificantInvoiceDelta(200, 250), true)
    const decision = decideInvoiceAnomaly({
      createdNew: false,
      expected: 80,
      invoiced: 99,
    })
    assert.equal(decision.anomaly, true)
    assert.equal(decision.kind, 'delta')
  })

  it('new / unknown and qualitative always flag with a note', () => {
    const unknown = decideInvoiceAnomaly({
      createdNew: true,
      expected: 1400,
      invoiced: 1400,
    })
    assert.equal(unknown.anomaly, true)
    assert.equal(unknown.kind, 'new')
    assert.equal(unknown.note, NEW_INVOICE_LINE_NOTE)

    const qualitative = decideInvoiceAnomaly({
      createdNew: false,
      expected: 550,
      invoiced: 550,
      qualitative: true,
      qualitativeNote: 'GST surprise',
    })
    assert.equal(qualitative.anomaly, true)
    assert.equal(qualitative.kind, 'qualitative')
    assert.equal(qualitative.note, 'GST surprise')
  })
})

describe('applyInvoiceToEntries product rules', () => {
  it('ordinary match flips INVOICED, updates invoice_amount, never PAID, no ⚠', () => {
    const existing = [line({ id: 'light', amount: 550, description: 'Michael lighting' })]
    const next = applyInvoiceToEntries({
      existing,
      invoice: { invoice_number: 'INV-570', amount: 550, description: 'Michael lighting' },
    })
    assert.equal(next.sectionState, INVOICED_FIELD_STATE)
    assert.equal(next.paidWritten, false)
    assert.equal(next.createdNew, false)
    assert.equal(next.matchedExisting, true)
    assert.equal(next.entries[0].invoice_amount, 550)
    assert.equal(next.entries[0].invoice_number, 'INV-570')
    assert.equal(next.entries[0].paid, false)
    assert.equal(next.entries[0].anomaly, false)
    assert.equal(next.entries[0].amount, 550)
  })

  it('unknown invoice creates a new INVOICED line with required ⚠ + note', () => {
    const next = applyInvoiceToEntries({
      existing: [line({ id: 'known', description: 'Venue hire', amount: 2000 })],
      invoice: { invoice_number: 'IJS-9286', amount: 1914, description: 'Backline + lighting' },
    })
    assert.equal(next.createdNew, true)
    assert.equal(next.entries.length, 2)
    const added = next.entries.find(e => e.id === next.targetId)
    assert.ok(added)
    assert.equal(added?.invoice_amount, 1914)
    assert.equal(added?.anomaly, true)
    assert.equal(added?.anomaly_note, NEW_INVOICE_LINE_NOTE)
    assert.equal(added?.paid, false)
    assert.equal(next.sectionState, INVOICED_FIELD_STATE)
  })

  it('matched significant Δ flags only that entry; distinct invoice # stays separate', () => {
    const existing = [
      line({ id: 'light', description: 'Lighting', amount: 330 }),
      line({ id: 'other', description: 'Freight', amount: 100, invoice_number: 'INV-570', invoice_amount: 550 }),
    ]
    const next = applyInvoiceToEntries({
      existing,
      invoice: { invoice_number: 'INV-571', amount: 1100, description: 'Lighting' },
    })
    assert.equal(next.createdNew, false)
    const lighting = next.entries.find(e => e.id === 'light')
    const freight = next.entries.find(e => e.id === 'other')
    assert.equal(lighting?.invoice_amount, 1100)
    assert.equal(lighting?.invoice_number, 'INV-571')
    assert.equal(lighting?.anomaly, true)
    assert.equal(lighting?.amount, 330)
    assert.equal(lighting?.paid, false)
    assert.equal(freight?.anomaly, false)
    assert.equal(freight?.invoice_number, 'INV-570')

    const second = applyInvoiceToEntries({
      existing: next.entries,
      invoice: { invoice_number: 'INV-999', amount: 440, description: 'Lighting' },
    })
    assert.equal(second.createdNew, true)
    assert.equal(second.entries.filter(e => e.description === 'Lighting').length, 2)
  })

  it('never writes PAID from invoice apply', () => {
    const paid = line({ id: 'p', description: 'Crew', amount: 400, paid: true, paid_at: '2026-09-01T00:00:00.000Z' })
    const next = applyInvoiceToEntries({
      existing: [paid],
      invoice: { invoice_number: 'X-1', amount: 400, description: 'Crew' },
    })
    assert.equal(next.paidWritten, false)
    assert.equal(next.entries[0].paid, true)
    const fresh = applyInvoiceToEntries({
      existing: [line({ id: 'u', description: 'Crew', amount: 400 })],
      invoice: { invoice_number: 'X-2', amount: 400, description: 'Crew' },
    })
    assert.equal(fresh.entries[0].paid, false)
  })
})

describe('anomaly fields survive normalize + Unconfirm / Re-BOOK preserve', () => {
  it('normalizeEntries / line_items keep anomaly + note; require note when flagged', () => {
    const rows = normalizeEntries([{
      id: 'a',
      description: 'Cautech',
      notes: '',
      amount: 1400,
      invoice_amount: 1400,
      invoice_number: '1448',
      anomaly: true,
      gst_included: true,
      confirmed: true,
    }])
    assert.equal(rows?.[0].anomaly, true)
    assert.equal(rows?.[0].anomaly_note, ANOMALY_NOTE_REQUIRED_FALLBACK)
    assert.equal(rows?.[0].invoice_number, '1448')

    const roles = normalizeLineItems([{
      id: 'r',
      role: 'FOH',
      rate: 50,
      hours: 4,
      headcount: 1,
      confirmed: true,
      anomaly: true,
      anomaly_note: 'soft crew overlap',
    }])
    assert.equal(roles?.[0].anomaly, true)
    assert.equal(roles?.[0].anomaly_note, 'soft crew overlap')
  })

  it('preserves leftover INVOICED + anomaly money_entry through Costings recopy', () => {
    const advancingUnknown = line({
      id: 'adv-new',
      description: 'Cautech #1448',
      amount: 1400,
      invoice_amount: 1400,
      invoice_number: '1448',
      anomaly: true,
      anomaly_note: NEW_INVOICE_LINE_NOTE,
    })
    assert.equal(shouldPreserveAdvancingEntry(advancingUnknown), true)

    const merged = preservePaidEntries(
      [line({ id: 'c-hire', description: 'Venue hire', amount: 2000 })],
      [advancingUnknown],
    )
    assert.equal(merged.length, 2)
    const kept = merged.find(e => e.id === 'adv-new')
    assert.equal(kept?.anomaly, true)
    assert.equal(kept?.invoice_number, '1448')

    const field = mergeCostingCopiesPreservingAdvancing(
      [{
        show_id: 'show-1',
        field_key: 'production_costs',
        state: 'estimated',
        value: 330,
        entries: [line({ id: 'c-light', description: 'Lighting', amount: 330 })],
      }],
      [{
        show_id: 'show-1',
        field_key: 'production_costs',
        state: INVOICED_FIELD_STATE,
        value: 330,
        entries: [line({
          id: 'c-light',
          description: 'Lighting',
          amount: 330,
          invoice_amount: 1100,
          invoice_number: 'INV-571',
          anomaly: true,
          anomaly_note: 'lighting $330→$1,100',
        })],
      }],
    )
    assert.equal(field[0]?.state, INVOICED_FIELD_STATE)
    assert.equal(field[0]?.entries?.[0].anomaly, true)
    assert.equal(field[0]?.entries?.[0].invoice_amount, 1100)
    assert.equal(field[0]?.entries?.[0].anomaly_note, 'lighting $330→$1,100')
  })
})

describe('Settlements twin chrome from Advancing lines', () => {
  it('sheet lines carry INVOICED + anomaly when the backing field has flagged entries', () => {
    const field: CostingSnapshotField = {
      id: 'f1',
      run_id: 'run-1',
      show_id: 'show-1',
      category: 'Venue Costs',
      field_key: 'production_costs',
      label: 'Venue Production / AV',
      value: 330,
      state: INVOICED_FIELD_STATE,
      source: 'Invoice INV-571',
      entries: [line({
        id: 'e1',
        description: 'Lighting',
        amount: 330,
        invoice_amount: 1100,
        anomaly: true,
        anomaly_note: 'lighting $330→$1,100',
      })],
      line_items: [],
    }
    const { lines } = buildShowSheetLines({
      show: {
        id: 'show-1',
        venue_name: 'Test Hall',
        venue_city: 'Melbourne',
        show_date: '2026-09-21',
        show_order: 1,
        capacity: 400,
        ticket_price: 80,
        tickets_sold: 200,
      },
      fields: [field],
      tickets: 200,
      ticketsSource: 'known',
    })
    const prod = lines.find(l => l.key === 'show:production_costs')
    assert.equal(prod?.expectedInvoiced, true)
    assert.equal(prod?.anomaly, true)
    assert.equal(prod?.anomalyNote, 'lighting $330→$1,100')
  })
})

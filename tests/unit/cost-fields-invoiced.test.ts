import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  applyInvoiceAmountsIfMissing,
  CONFIRMED_FIELD_STATE,
  COST_FIELD_EDIT_OPTIONS,
  COST_FIELD_STATES,
  costFieldEditDropdownValues,
  displayCostFieldChipLabel,
  displayCostFieldChromeState,
  entryInvoiceVariance,
  INVOICED_FIELD_STATE,
  invoiceVariance,
  isCostFieldState,
  isNonConfirmedFieldState,
  normalizeEntries,
  rolledUpCostFieldState,
  SECTION_BULK_PAID_VALUE,
  sectionInvoiceVariance,
  showSectionPaidBadge,
  type CostEntry,
} from '../../lib/cost-fields.ts'

const EXPECTED = 10
const INVOICE_MATCH = 10
const INVOICE_MISMATCH = 12

function entry(opts: Partial<CostEntry> & { id: string }): CostEntry {
  return {
    description: 'Line',
    notes: '',
    amount: EXPECTED,
    gst_included: true,
    confirmed: true,
    paid: false,
    paid_at: null,
    ...opts,
  }
}

test('isCostFieldState accepts invoiced and rejects paid', () => {
  assert.equal(isCostFieldState(INVOICED_FIELD_STATE), true)
  assert.ok((COST_FIELD_STATES as readonly string[]).includes('invoiced'))
  assert.equal(isCostFieldState('paid'), false)
  assert.equal(isCostFieldState('bulk_paid'), false)
  assert.equal(isCostFieldState('known'), true)
})

test('invoiced is not a non-confirmed fallback; paid is not a field state', () => {
  assert.equal(isNonConfirmedFieldState(INVOICED_FIELD_STATE), false)
  assert.equal(isNonConfirmedFieldState(CONFIRMED_FIELD_STATE), false)
  assert.equal(isNonConfirmedFieldState('estimated'), true)
  assert.equal(isNonConfirmedFieldState('paid'), false)
})

test('Edit dropdown places Invoiced between Confirmed and PAID', () => {
  const invoiced = COST_FIELD_EDIT_OPTIONS.find(o => o.value === INVOICED_FIELD_STATE)
  assert.equal(invoiced?.label, 'Invoiced')
  const values = costFieldEditDropdownValues()
  const confirmedAt = values.indexOf(CONFIRMED_FIELD_STATE)
  const invoicedAt = values.indexOf(INVOICED_FIELD_STATE)
  const paidAt = values.indexOf(SECTION_BULK_PAID_VALUE)
  assert.ok(confirmedAt >= 0)
  assert.ok(invoicedAt > confirmedAt)
  assert.equal(invoicedAt + 1, paidAt)
  assert.equal(values.includes('paid'), false)
})

test('invoiceVariance shows both figures when Expected ≠ Invoice and still allows invoiced', () => {
  assert.equal(invoiceVariance(EXPECTED, null), null)
  const match = invoiceVariance(EXPECTED, INVOICE_MATCH)
  assert.deepEqual(match, { expected: EXPECTED, invoiced: INVOICE_MATCH, hasVariance: false })
  const mismatch = invoiceVariance(EXPECTED, INVOICE_MISMATCH)
  assert.deepEqual(mismatch, { expected: EXPECTED, invoiced: INVOICE_MISMATCH, hasVariance: true })
  assert.equal(isCostFieldState(INVOICED_FIELD_STATE), true)
})

test('entry and section variance helpers use invoice_amount without touching Expected', () => {
  const matchRow = entry({ id: 'a', amount: EXPECTED, invoice_amount: INVOICE_MATCH })
  const missRow = entry({ id: 'b', amount: EXPECTED, invoice_amount: INVOICE_MISMATCH })
  assert.equal(entryInvoiceVariance(matchRow)?.hasVariance, false)
  assert.equal(entryInvoiceVariance(missRow)?.hasVariance, true)
  assert.equal(entryInvoiceVariance(missRow)?.expected, EXPECTED)
  assert.equal(entryInvoiceVariance(missRow)?.invoiced, INVOICE_MISMATCH)
  assert.equal(entryInvoiceVariance(entry({ id: 'c', amount: EXPECTED }))?.hasVariance ?? false, false)

  const section = sectionInvoiceVariance(EXPECTED + EXPECTED, [matchRow, missRow])
  assert.equal(section?.expected, EXPECTED + EXPECTED)
  assert.equal(section?.invoiced, INVOICE_MATCH + INVOICE_MISMATCH)
  assert.equal(section?.hasVariance, true)
})

test('applyInvoiceAmountsIfMissing stamps Expected onto invoice_amount without overwriting', () => {
  const rows = [
    entry({ id: 'a', amount: EXPECTED }),
    entry({ id: 'b', amount: EXPECTED, invoice_amount: INVOICE_MISMATCH }),
  ]
  const next = applyInvoiceAmountsIfMissing(rows, e => e.amount)
  assert.equal(next[0].amount, EXPECTED)
  assert.equal(next[0].invoice_amount, EXPECTED)
  assert.equal(next[1].amount, EXPECTED)
  assert.equal(next[1].invoice_amount, INVOICE_MISMATCH)
})

test('normalizeEntries keeps invoice_amount separate from amount', () => {
  const rows = normalizeEntries([
    { id: 'a', description: 'X', notes: '', amount: EXPECTED, invoice_amount: INVOICE_MISMATCH, gst_included: true, confirmed: true },
  ])
  assert.equal(rows?.[0].amount, EXPECTED)
  assert.equal(rows?.[0].invoice_amount, INVOICE_MISMATCH)
})

test('confirm rollup does not downgrade invoiced to known', () => {
  const confirmed = [entry({ id: 'a', confirmed: true }), entry({ id: 'b', confirmed: true })]
  assert.equal(
    rolledUpCostFieldState({ entries: confirmed, currentState: INVOICED_FIELD_STATE }),
    INVOICED_FIELD_STATE,
  )
  assert.equal(
    rolledUpCostFieldState({ entries: confirmed, currentState: 'guess' }),
    CONFIRMED_FIELD_STATE,
  )
})

test('all-PAID overlay does not hide invoiced; dual badge when some lines paid', () => {
  const allPaid = [
    entry({ id: 'a', confirmed: true, paid: true }),
    entry({ id: 'b', confirmed: true, paid: true }),
  ]
  const somePaid = [
    entry({ id: 'a', confirmed: true, paid: true }),
    entry({ id: 'b', confirmed: true, paid: false }),
  ]
  assert.equal(displayCostFieldChromeState(INVOICED_FIELD_STATE, allPaid), INVOICED_FIELD_STATE)
  assert.equal(displayCostFieldChipLabel(INVOICED_FIELD_STATE, allPaid, 'INVOICED'), 'INVOICED')
  assert.equal(showSectionPaidBadge(INVOICED_FIELD_STATE, allPaid), true)
  assert.equal(showSectionPaidBadge(INVOICED_FIELD_STATE, somePaid), true)
  assert.equal(showSectionPaidBadge('guess', somePaid), false)
  assert.equal(showSectionPaidBadge('guess', allPaid), true)
})

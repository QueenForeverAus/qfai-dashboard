import assert from 'node:assert/strict'
import { test } from 'node:test'
import { bandCostCloseGate } from '../../lib/settlements.ts'
import { normalizeEntries, paidLockViolation } from '../../lib/cost-fields.ts'
import {
  formatQuoteAttachmentAuditCopy,
  formatQuoteNoteAuditCopy,
  QUOTE_INVOICE_NOTE_LABEL,
  stubHasAttachment,
  validateQuoteInvoiceFile,
} from '../../lib/quote-invoice-stub.ts'

test('quote/invoice note copy is the Wave 2 stub label', () => {
  assert.equal(QUOTE_INVOICE_NOTE_LABEL, 'Link quote/invoice later')
})

test('validateQuoteInvoiceFile accepts PDF and images and rejects other types', () => {
  assert.equal(validateQuoteInvoiceFile({ filename: 'uber.pdf', mime: 'application/pdf', byteSize: 120 }).ok, true)
  assert.equal(validateQuoteInvoiceFile({ filename: 'receipt.PNG', byteSize: 80 }).ok, true)
  assert.equal(validateQuoteInvoiceFile({ filename: 'notes.txt', mime: 'text/plain', byteSize: 20 }).ok, false)
  assert.equal(validateQuoteInvoiceFile({ filename: 'empty.pdf', mime: 'application/pdf', byteSize: 0 }).ok, false)
})

test('close-gate ignores missing attachment', () => {
  const paidNoFile = bandCostCloseGate([
    { paid: true, waived: false },
    { paid: false, waived: true },
  ])
  assert.equal(paidNoFile.ready, true)
  assert.equal(stubHasAttachment({ attachment_filename: null, attachment_path: null }), false)
})

test('paid lock does not block quote/invoice stub edits', () => {
  const existing = normalizeEntries([
    { id: 'e1', description: 'Uber', notes: '', amount: 45, gst_included: true, confirmed: true, paid: true, paid_at: '2026-09-07T00:00:00.000Z' },
  ])!
  const next = existing.map(row => ({
    ...row,
    quote_note: 'Link after Harbour send the invoice',
    attachment_filename: 'uber.pdf',
    attachment_path: 'stub-1',
    attachment_mime: 'application/pdf',
  }))
  assert.equal(paidLockViolation(existing, next), null)
})

test('normalizeEntries keeps quote/invoice stub fields', () => {
  const rows = normalizeEntries([
    {
      id: 'e1',
      description: 'Hire',
      notes: '',
      amount: 10,
      gst_included: true,
      confirmed: false,
      quote_note: 'Link quote/invoice later',
      attachment_filename: 'quote.pdf',
      attachment_path: 'abc',
      attachment_mime: 'application/pdf',
      payables_document_id: null,
    },
  ])
  assert.equal(rows?.[0].quote_note, 'Link quote/invoice later')
  assert.equal(rows?.[0].attachment_filename, 'quote.pdf')
  assert.equal(rows?.[0].attachment_path, 'abc')
  assert.equal(rows?.[0].payables_document_id, null)
})

test('quote/invoice audit sentences are plain language', () => {
  const added = formatQuoteAttachmentAuditCopy({
    actorName: 'Test Admin',
    runCode: 'R12',
    lineLabel: 'Uber',
    newFilename: 'uber.pdf',
  })
  assert.equal(added.fieldName, 'Quote/invoice attachment')
  assert.match(added.newValue, /Test Admin added a quote\/invoice file uber\.pdf on band cost Uber/)
  assert.match(added.newValue, /R12/)

  const removed = formatQuoteAttachmentAuditCopy({
    actorName: 'Test Admin',
    runCode: 'R12',
    lineLabel: 'Uber',
    oldFilename: 'uber.pdf',
    newFilename: null,
  })
  assert.match(removed.newValue, /removed the quote\/invoice file uber\.pdf from band cost Uber/)

  const note = formatQuoteNoteAuditCopy({
    actorName: 'Test Admin',
    runCode: 'R12',
    lineLabel: 'Hire',
    oldNote: '',
    newNote: 'Waiting on Harbour',
    scope: 'cost-entry',
  })
  assert.match(note.newValue, /updated the quote\/invoice note on costing line Hire/)
})

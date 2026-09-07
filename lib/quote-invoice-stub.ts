/**
 * W1.5 quote/invoice stub — attachment + note on Band Costs and Run Costing lines.
 * No Payables desk, statuses, due dates, or Scott queues.
 */

export const QUOTE_INVOICE_NOTE_LABEL = 'Link quote/invoice later'
export const QUOTE_INVOICE_NOTE_PLACEHOLDER = 'Link quote/invoice later'
export const QUOTE_INVOICE_STUB_HELP =
  'Optional. Wave 2 will link this to a Payables quote or invoice. Missing a file does not block close.'

export const AUDIT_FIELD_QUOTE_NOTE = 'Quote/invoice note'
export const AUDIT_FIELD_QUOTE_ATTACHMENT = 'Quote/invoice attachment'

export const QUOTE_INVOICE_MAX_BYTES = 6 * 1024 * 1024
export const QUOTE_INVOICE_ALLOWED_MIME = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const

const MIME_BY_EXT: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
}

export type QuoteInvoiceStubFields = {
  attachment_path: string | null
  attachment_filename: string | null
  attachment_mime: string | null
  quote_note: string | null
  payables_document_id: string | null
}

export function emptyQuoteInvoiceStub(): QuoteInvoiceStubFields {
  return {
    attachment_path: null,
    attachment_filename: null,
    attachment_mime: null,
    quote_note: null,
    payables_document_id: null,
  }
}

export function sanitizeStubFilename(name: string | null | undefined): string {
  const raw = (name ?? '').split(/[/\\]/).pop()?.trim() || 'attachment'
  const cleaned = raw.replace(/[^\w.\- ()[\]]+/g, '_').replace(/^\.+/, '')
  const clipped = cleaned.slice(0, 180)
  return clipped || 'attachment'
}

export function inferStubMime(filename: string, declared?: string | null): string | null {
  const declaredOk = declared && QUOTE_INVOICE_ALLOWED_MIME.includes(declared as typeof QUOTE_INVOICE_ALLOWED_MIME[number])
    ? declared
    : null
  if (declaredOk) return declaredOk
  const lower = filename.toLowerCase()
  const ext = Object.keys(MIME_BY_EXT).find(key => lower.endsWith(key))
  return ext ? MIME_BY_EXT[ext] : null
}

export function validateQuoteInvoiceFile(opts: {
  filename: string
  mime?: string | null
  byteSize: number
}): { ok: true; filename: string; mime: string } | { ok: false; error: string } {
  const filename = sanitizeStubFilename(opts.filename)
  if (!opts.byteSize || opts.byteSize < 1) {
    return { ok: false, error: 'File is empty' }
  }
  if (opts.byteSize > QUOTE_INVOICE_MAX_BYTES) {
    return { ok: false, error: 'File is too large (max 6 MB)' }
  }
  const mime = inferStubMime(filename, opts.mime)
  if (!mime) {
    return { ok: false, error: 'Attach a PDF or image (JPG, PNG, WebP, GIF)' }
  }
  return { ok: true, filename, mime }
}

export function formatQuoteNoteAuditCopy(opts: {
  actorName: string
  runCode: string
  lineLabel: string
  oldNote?: string | null
  newNote?: string | null
  scope?: 'band-cost' | 'cost-entry'
}): { fieldName: string; oldValue: string | null; newValue: string } {
  const actor = opts.actorName.trim() || 'Someone'
  const line = (opts.lineLabel || 'a line').trim()
  const where = opts.scope === 'cost-entry' ? 'costing line' : 'band cost'
  const next = (opts.newNote ?? '').trim()
  const verb = next ? 'updated the quote/invoice note' : 'cleared the quote/invoice note'
  return {
    fieldName: AUDIT_FIELD_QUOTE_NOTE,
    oldValue: (opts.oldNote ?? '').trim() || null,
    newValue: `${actor} ${verb} on ${where} ${line} (run ${opts.runCode}).`,
  }
}

export function formatQuoteAttachmentAuditCopy(opts: {
  actorName: string
  runCode: string
  lineLabel: string
  oldFilename?: string | null
  newFilename?: string | null
  scope?: 'band-cost' | 'cost-entry'
}): { fieldName: string; oldValue: string | null; newValue: string } {
  const actor = opts.actorName.trim() || 'Someone'
  const line = (opts.lineLabel || 'a line').trim()
  const where = opts.scope === 'cost-entry' ? 'costing line' : 'band cost'
  const next = (opts.newFilename ?? '').trim()
  const prev = (opts.oldFilename ?? '').trim()
  const sentence = next
    ? `${actor} added a quote/invoice file ${next} on ${where} ${line} (run ${opts.runCode}).`
    : `${actor} removed the quote/invoice file ${prev || 'attachment'} from ${where} ${line} (run ${opts.runCode}).`
  return {
    fieldName: AUDIT_FIELD_QUOTE_ATTACHMENT,
    oldValue: prev || null,
    newValue: sentence,
  }
}

export function stubHasAttachment(row: Pick<QuoteInvoiceStubFields, 'attachment_filename' | 'attachment_path'> | null | undefined): boolean {
  return Boolean((row?.attachment_filename ?? '').trim() || (row?.attachment_path ?? '').trim())
}

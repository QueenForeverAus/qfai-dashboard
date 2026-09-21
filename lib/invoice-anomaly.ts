/**
 * Invoice → INVOICED + per-line anomaly ⚠ (canon 2026-09-21).
 *
 * HARD:
 *   Match existing line → INVOICED; set invoice_amount if different;
 *     distinct money_entries per invoice #.
 *   Unknown → new line at INVOICED.
 *   Never PAID from invoice alone.
 *   New/unknown → ⚠ required + note.
 *   Significant Δ (A$100 or ~20% or qualitative) → ⚠ on that entry.
 *   Ordinary match → INVOICED only, no ⚠.
 */

import {
  INVOICED_FIELD_STATE,
  parseInvoiceAmount,
  parseInvoiceNumber,
  type CostEntry,
} from './cost-fields.ts'

function newEntryId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `e-inv-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export const ANOMALY_ABS_THRESHOLD_AUD = 100
export const ANOMALY_REL_THRESHOLD = 0.20

export const NEW_INVOICE_LINE_NOTE = 'new invoice line — not in Advancing'
export const SIGNIFICANT_DELTA_NOTE = 'invoice amount significantly different from expected'

export type InvoiceAnomalyKind = 'none' | 'new' | 'delta' | 'qualitative'

export type InvoiceAnomalyDecision = {
  anomaly: boolean
  kind: InvoiceAnomalyKind
  note: string | null
  absDelta: number
  relDelta: number | null
}

export type InvoiceApplyItem = {
  invoice_number: string
  amount: number
  description?: string | null
  qualitative?: boolean
  qualitative_note?: string | null
}

export type ApplyInvoiceToEntriesResult = {
  entries: CostEntry[]
  sectionState: typeof INVOICED_FIELD_STATE
  paidWritten: false
  createdNew: boolean
  matchedExisting: boolean
  flaggedIds: string[]
  targetId: string
}

function norm(s: string | null | undefined): string {
  return String(s ?? '').trim().toLowerCase()
}

export function invoiceAbsDelta(
  expected: number | null | undefined,
  invoiced: number | null | undefined,
): number {
  const exp = Number(expected) || 0
  const inv = parseInvoiceAmount(invoiced)
  if (inv == null) return 0
  return Math.abs(inv - exp)
}

export function invoiceRelDelta(
  expected: number | null | undefined,
  invoiced: number | null | undefined,
): number | null {
  const exp = Number(expected) || 0
  const inv = parseInvoiceAmount(invoiced)
  if (inv == null) return null
  if (exp === 0) return inv === 0 ? 0 : 1
  return Math.abs(inv - exp) / Math.abs(exp)
}

/** Ops default until Factors threshold exists: |Δ| ≥ A$100 or ~20% of expected. */
export function isSignificantInvoiceDelta(
  expected: number | null | undefined,
  invoiced: number | null | undefined,
): boolean {
  const inv = parseInvoiceAmount(invoiced)
  if (inv == null) return false
  if (invoiceAbsDelta(expected, inv) >= ANOMALY_ABS_THRESHOLD_AUD) return true
  const rel = invoiceRelDelta(expected, inv)
  return rel != null && rel >= ANOMALY_REL_THRESHOLD
}

export function requiredAnomalyNote(kind: Exclude<InvoiceAnomalyKind, 'none'>, existing?: string | null): string {
  const prior = String(existing ?? '').trim()
  if (prior) return prior
  if (kind === 'new') return NEW_INVOICE_LINE_NOTE
  if (kind === 'qualitative') return 'invoice qualitative oddity — review'
  return SIGNIFICANT_DELTA_NOTE
}

/**
 * Decide whether this money_entry gets ⚠.
 * New/unknown and qualitative always flag. Matched ordinary ≈ expected does not.
 */
export function decideInvoiceAnomaly(opts: {
  createdNew: boolean
  expected: number | null | undefined
  invoiced: number | null | undefined
  qualitative?: boolean
  qualitativeNote?: string | null
  existingNote?: string | null
}): InvoiceAnomalyDecision {
  const absDelta = invoiceAbsDelta(opts.expected, opts.invoiced)
  const relDelta = invoiceRelDelta(opts.expected, opts.invoiced)

  if (opts.createdNew) {
    return {
      anomaly: true,
      kind: 'new',
      note: requiredAnomalyNote('new', opts.existingNote),
      absDelta,
      relDelta,
    }
  }
  if (opts.qualitative) {
    return {
      anomaly: true,
      kind: 'qualitative',
      note: requiredAnomalyNote('qualitative', opts.qualitativeNote ?? opts.existingNote),
      absDelta,
      relDelta,
    }
  }
  if (isSignificantInvoiceDelta(opts.expected, opts.invoiced)) {
    return {
      anomaly: true,
      kind: 'delta',
      note: requiredAnomalyNote('delta', opts.existingNote),
      absDelta,
      relDelta,
    }
  }
  return { anomaly: false, kind: 'none', note: null, absDelta, relDelta }
}

export function entryIsAnomaly(entry: { anomaly?: boolean } | null | undefined): boolean {
  return entry?.anomaly === true
}

export function fieldHasAnomaly(
  entries: Array<{ anomaly?: boolean }> | null | undefined,
  lineItems?: Array<{ anomaly?: boolean }> | null,
): boolean {
  return Boolean(entries?.some(entryIsAnomaly) || lineItems?.some(entryIsAnomaly))
}

export function fieldAnomalyNote(
  entries: Array<{ anomaly?: boolean; anomaly_note?: string | null }> | null | undefined,
  lineItems?: Array<{ anomaly?: boolean; anomaly_note?: string | null }> | null,
): string | null {
  const hit = [...(entries ?? []), ...(lineItems ?? [])].find(row => entryIsAnomaly(row) && String(row.anomaly_note ?? '').trim())
  return hit ? String(hit.anomaly_note).trim() : null
}

function matchInvoiceEntry(
  existing: CostEntry[],
  invoice: InvoiceApplyItem,
  used: Set<string>,
): CostEntry | null {
  const invNo = parseInvoiceNumber(invoice.invoice_number)
  if (invNo) {
    const byInv = existing.find(e => !used.has(e.id) && parseInvoiceNumber(e.invoice_number) === invNo)
    if (byInv) return byInv
  }
  const desc = norm(invoice.description)
  if (!desc) return null
  const byDesc = existing.find(e => !used.has(e.id) && norm(e.description) === desc)
  if (!byDesc) return null
  const existingInv = parseInvoiceNumber(byDesc.invoice_number)
  if (existingInv && invNo && existingInv !== invNo) return null
  return byDesc
}

function applyDecisionToEntry(entry: CostEntry, decision: InvoiceAnomalyDecision, invoice: InvoiceApplyItem): CostEntry {
  return {
    ...entry,
    invoice_amount: parseInvoiceAmount(invoice.amount) ?? entry.invoice_amount ?? null,
    invoice_number: parseInvoiceNumber(invoice.invoice_number) ?? entry.invoice_number ?? null,
    paid: entry.paid === true,
    anomaly: decision.anomaly,
    anomaly_note: decision.anomaly ? decision.note : null,
  }
}

/**
 * Apply one invoice item onto money_entries.
 * Never writes PAID. Section figure-source becomes INVOICED.
 */
export function applyInvoiceToEntries(opts: {
  existing: CostEntry[] | null | undefined
  invoice: InvoiceApplyItem
}): ApplyInvoiceToEntriesResult {
  const existing = Array.isArray(opts.existing) ? opts.existing : []
  const used = new Set<string>()
  const matched = matchInvoiceEntry(existing, opts.invoice, used)
  const invoiced = parseInvoiceAmount(opts.invoice.amount) ?? 0

  if (matched) {
    used.add(matched.id)
    const decision = decideInvoiceAnomaly({
      createdNew: false,
      expected: matched.amount,
      invoiced,
      qualitative: opts.invoice.qualitative === true,
      qualitativeNote: opts.invoice.qualitative_note,
      existingNote: matched.anomaly_note,
    })
    const next = existing.map(row => (
      row.id === matched.id
        ? applyDecisionToEntry(row, decision, opts.invoice)
        : row
    ))
    return {
      entries: next,
      sectionState: INVOICED_FIELD_STATE,
      paidWritten: false,
      createdNew: false,
      matchedExisting: true,
      flaggedIds: next.filter(entryIsAnomaly).map(e => e.id),
      targetId: matched.id,
    }
  }

  const created: CostEntry = {
    id: newEntryId(),
    description: String(opts.invoice.description ?? '').trim() || `Invoice ${opts.invoice.invoice_number}`.trim(),
    notes: parseInvoiceNumber(opts.invoice.invoice_number)
      ? `Invoice ${parseInvoiceNumber(opts.invoice.invoice_number)}`
      : '',
    amount: invoiced,
    invoice_amount: invoiced,
    invoice_number: parseInvoiceNumber(opts.invoice.invoice_number),
    gst_included: true,
    confirmed: false,
    paid: false,
    paid_at: null,
    anomaly: true,
    anomaly_note: requiredAnomalyNote(
      'new',
      opts.invoice.qualitative_note,
    ),
  }
  const decision = decideInvoiceAnomaly({
    createdNew: true,
    expected: created.amount,
    invoiced,
    qualitative: opts.invoice.qualitative === true,
    qualitativeNote: opts.invoice.qualitative_note,
    existingNote: created.anomaly_note,
  })
  const flagged = applyDecisionToEntry(created, decision, opts.invoice)
  const next = [...existing, flagged]
  return {
    entries: next,
    sectionState: INVOICED_FIELD_STATE,
    paidWritten: false,
    createdNew: true,
    matchedExisting: false,
    flaggedIds: next.filter(entryIsAnomaly).map(e => e.id),
    targetId: flagged.id,
  }
}

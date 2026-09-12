/** Shared Run Costing helpers — entries as source of truth for line totals. */

/**
 * Confirm / PAID flags shared by cost `entries[]` and venue_staff `line_items[]`.
 * Not figure-source / cost_fields.state.
 */
export type PayableLine = {
  id: string
  /** W1.1 operator attestation that this line/role was checked — not payment. */
  confirmed: boolean
  /**
   * W1.2 cash/receipt. Wave 2 bank/Amex match will set the same fields.
   * Omit / false = not paid. Never implied by cost_fields.state === 'known'
   * (figure accuracy / Edit→Confirmed).
   */
  paid?: boolean
  paid_at?: string | null
  /**
   * W1.2b — prior paid flags captured immediately before section
   * “MARK ALL AS PAID”. Cleared after a successful restore when leaving
   * bulk-paid mode. Not a figure-source / cost_fields.state field.
   */
  paid_snapshot?: PaidStatusSnapshot | null
}

export type CostEntry = PayableLine & {
  description: string
  notes: string
  amount: number
  /**
   * Invoice amount on this line. Distinct from `amount` (Expected).
   * Set when marking invoiced / applying invoice. Never overwrites Expected.
   */
  invoice_amount?: number | null
  gst_included: boolean
  /** W1.5 stub store id/path. Optional — does not lock or close-gate. */
  attachment_path?: string | null
  attachment_filename?: string | null
  attachment_mime?: string | null
  /** W1.5 stub note. UI label: Link quote/invoice later. */
  quote_note?: string | null
  /** Wave 2 Payables document FK — unused in W1.5 UI. */
  payables_document_id?: string | null
  /**
   * Advancing receipt extract — stay night (YYYY-MM-DD). Optional.
   * Per-night accommodation lines live as entries on the run-level field.
   */
  night_date?: string | null
  city?: string | null
  vendor?: string | null
  confirmation_id?: string | null
  receipt_kind?: 'charge' | 'refund' | null
}

/**
 * Planned venue_staff role (rate × hours × headcount).
 * Confirm / PAID live on the JSONB object — same pattern as entries[].
 */
export type StaffLineItem = PayableLine & {
  role: string
  rate: number
  hours: number
  headcount: number
  source?: string
  /** Invoice amount for this planned role. Distinct from rate×hours×headcount (Expected). */
  invoice_amount?: number | null
}

/**
 * Prior paid flags for one line. Restore writes `paid` / `paid_at` only.
 * `confirmed` is the tick at bulk-PAID time (audit). Never restored.
 */
export type PaidStatusSnapshot = {
  paid: boolean
  paid_at: string | null
  /** Tick state when MARK ALL AS PAID ran. Audit only — not restored. */
  confirmed: boolean
}

/** Fields frozen while a line is PAID. Un-pay first to edit. */
export const PAID_LOCKED_ENTRY_FIELDS = [
  'description',
  'notes',
  'amount',
  'gst_included',
  'confirmed',
] as const

export type PaidLockedEntryField = (typeof PAID_LOCKED_ENTRY_FIELDS)[number]

/** Fields frozen while a planned role is PAID. Un-pay first to edit. */
export const PAID_LOCKED_LINE_ITEM_FIELDS = [
  'role',
  'source',
  'rate',
  'hours',
  'headcount',
  'confirmed',
] as const

export type PaidLockedLineItemField = (typeof PAID_LOCKED_LINE_ITEM_FIELDS)[number]

/** Section badge CONFIRMED — existing cost_fields.state value, not a parallel status. */
export const CONFIRMED_FIELD_STATE = 'known' as const

/**
 * Invoice received — figure-source state between Confirmed and PAID.
 * PAID ≠ draft-known; invoiced ≠ paid.
 * PAID is entries[].paid / paid_at chrome — never a cost_fields.state string.
 * invoiced means the invoice is on the line; it does not imply receipt/payment.
 */
export const INVOICED_FIELD_STATE = 'invoiced' as const

export const COST_FIELD_STATES = ['known', 'estimated', 'guess', 'pending', 'auto_calc', 'invoiced'] as const
export type CostFieldState = (typeof COST_FIELD_STATES)[number]

/**
 * Section Edit dropdown sentinel — a payment *action*, not a cost_fields.state.
 * UI label: “MARK ALL AS PAID”. Writes entries[].paid (+ implied confirm), never state='paid'.
 */
export const SECTION_BULK_PAID_VALUE = 'bulk_paid' as const
export type SectionEditValue = CostFieldState | typeof SECTION_BULK_PAID_VALUE

/**
 * Section Edit dropdown figure-source options (ladder chrome).
 * Invoiced sits immediately before PAID. PAID is SECTION_BULK_PAID_VALUE, not a state.
 */
export const COST_FIELD_EDIT_OPTIONS: ReadonlyArray<{ value: CostFieldState; label: string }> = [
  { value: 'known', label: 'Confirmed' },
  { value: 'estimated', label: 'Estimate' },
  { value: 'guess', label: 'Guess' },
  { value: 'pending', label: 'Figures Needed' },
  { value: 'auto_calc', label: 'Auto Calc' },
  { value: 'invoiced', label: 'Invoiced' },
]

/** Combined Edit dropdown values: figure-source options then MARK ALL AS PAID. */
export function costFieldEditDropdownValues(): string[] {
  return [...COST_FIELD_EDIT_OPTIONS.map(o => o.value), SECTION_BULK_PAID_VALUE]
}

/** PATCH /api/cost-fields/[id] `section_payment` values. */
export const SECTION_PAYMENT_PAID = 'paid' as const
export const SECTION_PAYMENT_RESTORE = 'restore' as const
export type SectionPayment = typeof SECTION_PAYMENT_PAID | typeof SECTION_PAYMENT_RESTORE

export function isCostFieldState(value: string | null | undefined): value is CostFieldState {
  return value != null && (COST_FIELD_STATES as readonly string[]).includes(value)
}

export function isNonConfirmedFieldState(
  value: string | null | undefined,
): value is Exclude<CostFieldState, 'known' | 'invoiced'> {
  return isCostFieldState(value) && value !== CONFIRMED_FIELD_STATE && value !== INVOICED_FIELD_STATE
}

export type CostFieldDef = {
  key: string
  label: string
  category: string
  defaultState: 'known' | 'estimated' | 'guess' | 'pending' | 'auto_calc'
  scope: 'run' | 'show'
}

/** Auto-calc / revenue lines — entries optional; not forced to ≥1. */
export const ENTRY_EXEMPT_FIELD_KEYS = new Set(['social_ads_var', 'gross_box_office'])

/**
 * Fields production role may edit (matches CostFieldsTab visibility).
 * Run-level Production category + per-show venue_staff / venue_marketing / production_costs.
 */
export const PRODUCTION_EDITABLE_FIELD_KEYS = new Set([
  'venue_staff',
  'production_costs',
  'lighting_hire',
  'backline_hire',
  'food_basics',
])
// venue_marketing intentionally omitted — production must not see Venue Marketing (Lead 2026-09-05)

/**
 * Venue-cost Production/AV — user-facing section label.
 * field_key stays `production_costs`. Stored DB labels may lag; use displayCostFieldLabel.
 */
export const VENUE_PRODUCTION_AV_LABEL = 'Venue Production/AV'

/**
 * Run-level Production parent (lighting_hire section).
 * field_key stays `lighting_hire`. One Portal row per run.
 */
export const PRODUCTION_BOUGHT_IN_LABEL = 'Production Bought In'

/**
 * Sole lighting_hire child line. Default $330 per run (Admin Settings
 * lighting_hire_default; known/confirmed). Never zero without Gareth OK.
 * Not the parent section label.
 */
export const LIGHTING_HIRE_LINE_LABEL = 'Lighting Equipment Hire'

/** Canonical per-show cost lines shown in Run Costing. */
export const DEFINED_SHOW_COST_FIELDS: CostFieldDef[] = [
  { key: 'gross_box_office', label: 'Gross Box Office', category: 'Revenue', defaultState: 'pending', scope: 'show' },
  { key: 'venue_hire', label: 'Venue Hire', category: 'Venue Costs', defaultState: 'guess', scope: 'show' },
  { key: 'venue_staff', label: 'Venue Staff / On-costs', category: 'Venue Costs', defaultState: 'guess', scope: 'show' },
  { key: 'venue_marketing', label: 'Venue Marketing', category: 'Venue Costs', defaultState: 'guess', scope: 'show' },
  { key: 'production_costs', label: VENUE_PRODUCTION_AV_LABEL, category: 'Venue Costs', defaultState: 'guess', scope: 'show' },
]

/** Canonical run-level cost lines shown in Run Costing (always listed in UI). */
export const DEFINED_RUN_COST_FIELDS: CostFieldDef[] = [
  { key: 'flights', label: 'Flights', category: 'Travel & Accommodation', defaultState: 'guess', scope: 'run' },
  { key: 'accommodation', label: 'Accommodation', category: 'Travel & Accommodation', defaultState: 'guess', scope: 'run' },
  { key: 'ground_transport', label: 'Ground Transport', category: 'Travel & Accommodation', defaultState: 'guess', scope: 'run' },
  { key: 'brad_driver_fee', label: 'Brad Driver Fee (weekday off work)', category: 'Travel & Accommodation', defaultState: 'known', scope: 'run' },
  { key: 'crew_fees_total', label: 'Crew Fees (all shows)', category: 'Crew & Operations', defaultState: 'guess', scope: 'run' },
  { key: 'food_basics', label: 'Food & Basics', category: 'Production', defaultState: 'estimated', scope: 'run' },
  { key: 'per_diems', label: 'Per Diems', category: 'Crew & Operations', defaultState: 'guess', scope: 'run' },
  { key: 'lighting_hire', label: PRODUCTION_BOUGHT_IN_LABEL, category: 'Production', defaultState: 'estimated', scope: 'run' },
  { key: 'backline_hire', label: 'Backline Hire (local)', category: 'Production', defaultState: 'estimated', scope: 'run' },
  { key: 'crew_travel_day', label: 'Crew Travel-Day Fee', category: 'Crew & Operations', defaultState: 'guess', scope: 'run' },
  { key: 'fb_ads', label: 'Facebook / Social Ads', category: 'Marketing', defaultState: 'guess', scope: 'run' },
  { key: 'social_ads_var', label: 'Social Media Marketing Co. — $1/ticket', category: 'Marketing', defaultState: 'auto_calc', scope: 'run' },
]

const DEFINED_COST_FIELDS: CostFieldDef[] = [...DEFINED_SHOW_COST_FIELDS, ...DEFINED_RUN_COST_FIELDS]

export function definedCostField(fieldKey: string): CostFieldDef | undefined {
  return DEFINED_COST_FIELDS.find(f => f.key === fieldKey)
}

/**
 * User-facing section label for a known field_key.
 * Defined label wins so Costing / Advancing / Settlements stay in sync when
 * stored `cost_fields.label` still has the previous copy.
 */
export function displayCostFieldLabel(fieldKey: string, storedLabel?: string | null): string {
  const defined = definedCostField(fieldKey)?.label
  if (defined) return defined
  const stored = storedLabel?.trim()
  if (stored) return stored
  return fieldKey.replace(/_/g, ' ')
}

/** Child-entry description when seeding a placeholder. lighting_hire keeps the $330 line name. */
export function defaultCostEntryDescription(fieldKey: string, fieldLabel?: string | null): string {
  if (fieldKey === 'lighting_hire') return LIGHTING_HIRE_LINE_LABEL
  const trimmed = fieldLabel?.trim()
  return trimmed || 'Estimate'
}

export function canEditCostFields(role: string | undefined): boolean {
  return role === 'owner' || role === 'admin' || role === 'production'
}

export function productionCanEditFieldKey(fieldKey: string): boolean {
  return PRODUCTION_EDITABLE_FIELD_KEYS.has(fieldKey)
}

/** Whether a role should see / auto-seed this defined field on open. */
export function roleCanSeeCostField(role: string | undefined, fieldKey: string): boolean {
  if (role === 'owner' || role === 'admin') return true
  if (role === 'production') return productionCanEditFieldKey(fieldKey)
  return false
}

export function entriesSum(entries: CostEntry[] | null | undefined): number {
  if (!entries?.length) return 0
  return entries.reduce((sum, e) => sum + (Number(e.amount) || 0), 0)
}

/** Planned-role total: rate × hours × headcount. */
export function lineItemsSum(items: StaffLineItem[] | null | undefined): number {
  if (!items?.length) return 0
  return items.reduce(
    (sum, item) => sum + (Number(item.rate) || 0) * (Number(item.hours) || 0) * (Number(item.headcount) || 0),
    0,
  )
}

/** True when the section has ≥1 line and every line-item confirm tick is checked. */
export function allEntriesConfirmed(entries: PayableLine[] | null | undefined): boolean {
  return Array.isArray(entries) && entries.length > 0 && entries.every(e => e.confirmed)
}

/** Payment roll-up: every line is PAID. Distinct from CONFIRMED (`state === known`). */
export function allEntriesPaid(entries: PayableLine[] | null | undefined): boolean {
  return Array.isArray(entries) && entries.length > 0 && entries.every(e => e.paid)
}

/** True when at least one line is PAID. Used for invoiced + partial-PAID dual badge. */
export function someEntriesPaid(entries: PayableLine[] | null | undefined): boolean {
  return Array.isArray(entries) && entries.some(e => e.paid)
}

/**
 * Section PAID badge: all-PAID (existing), or invoiced with some lines paid (dual badge).
 * Never treats invoiced as paid.
 */
export function showSectionPaidBadge(
  storedState: string | null | undefined,
  entries: PayableLine[] | null | undefined,
): boolean {
  if (allEntriesPaid(entries)) return true
  return storedState === INVOICED_FIELD_STATE && someEntriesPaid(entries)
}

/**
 * Venue Staff chrome / MARK ALL / all-PAID overlay uses planned roles when
 * present; otherwise cost entries (actuals). Other fields always use entries.
 */
export function sectionPayableLines(
  fieldKey: string,
  entries: PayableLine[] | null | undefined,
  lineItems: PayableLine[] | null | undefined,
): PayableLine[] {
  if (fieldKey === 'venue_staff' && Array.isArray(lineItems) && lineItems.length > 0) {
    return lineItems
  }
  return Array.isArray(entries) ? entries : []
}

/**
 * W1.1 attestation for display: a paid line counts as confirmed.
 * Does not write cost_fields.state — use allEntriesConfirmed for stored roll-up.
 */
export function entryIsAttested(entry: Pick<CostEntry, 'confirmed' | 'paid'>): boolean {
  return entry.confirmed === true || entry.paid === true
}

/** Tick paid-but-unticked lines so attestation matches the lock. Returns newly confirmed rows. */
export function ensurePaidLinesConfirmed<T extends PayableLine>(entries: T[]): {
  entries: T[]
  newlyConfirmed: T[]
} {
  const newlyConfirmed: T[] = []
  const next = entries.map((entry) => {
    if (!entry.paid || entry.confirmed) return entry
    newlyConfirmed.push(entry)
    return { ...entry, confirmed: true }
  })
  return { entries: next, newlyConfirmed }
}

/**
 * Display-only chip when every line is PAID. Gareth locked CONFIRMED.
 * Flip this constant if Finance later wants the word PAID — chrome stays confirmed-green.
 */
export const ALL_PAID_SECTION_CHIP_LABEL = 'CONFIRMED' as const

/**
 * Card chrome key for STATE_STYLES. All-PAID overlays `known` (green) without
 * changing stored figure-source state. Invoiced is not overlaid — dual badge OK.
 */
export function displayCostFieldChromeState(
  storedState: string | null | undefined,
  entries: PayableLine[] | null | undefined,
): string {
  if (storedState === INVOICED_FIELD_STATE) return INVOICED_FIELD_STATE
  if (allEntriesPaid(entries)) return CONFIRMED_FIELD_STATE
  return storedState ?? 'pending'
}

/** Header status chip. All-PAID uses ALL_PAID_SECTION_CHIP_LABEL (display only). */
export function displayCostFieldChipLabel(
  storedState: string | null | undefined,
  entries: PayableLine[] | null | undefined,
  storedLabel: string,
): string {
  if (storedState === INVOICED_FIELD_STATE) return storedLabel
  if (allEntriesPaid(entries)) return ALL_PAID_SECTION_CHIP_LABEL
  return storedLabel
}

/**
 * True when confirm ticks did not change, or only flipped true on lines that
 * are now PAID (implied attestation). Payment-only edits must not write state.
 */
export function paymentDidNotChangeAttestationTicks(
  previous: PayableLine[] | null | undefined,
  next: PayableLine[],
): boolean {
  const prevById = new Map((previous ?? []).map(e => [e.id, e]))
  for (const prev of previous ?? []) {
    if (!next.some(row => row.id === prev.id)) return false
  }
  for (const row of next) {
    const prev = prevById.get(row.id)
    const was = prev?.confirmed === true
    const now = row.confirmed === true
    if (was === now) continue
    if (was && !now) return false
    if (!was && now && !row.paid) return false
  }
  return true
}

/** Line is locked after receipt. Un-pay to edit amount/description/notes/confirm. */
export function entryIsPaidLocked(entry: Pick<CostEntry, 'paid'> | null | undefined): boolean {
  return Boolean(entry?.paid)
}

/**
 * PAID is available only after operator attestation on the line.
 * Do not gate on cost_fields.state === 'known' (Edit→Confirmed / figure accuracy).
 */
export function canMarkEntryPaid(entry: Pick<CostEntry, 'confirmed' | 'paid'>): boolean {
  return entry.confirmed === true
}

export function parseInvoiceAmount(raw: unknown): number | null {
  if (raw == null || raw === '') return null
  const n = typeof raw === 'number' ? raw : Number(raw)
  return Number.isFinite(n) ? n : null
}

/**
 * When marking invoiced, stamp invoice_amount from Expected if the line has none.
 * Never overwrites a stored invoice amount or the Expected figure.
 */
export function applyInvoiceAmountsIfMissing<T extends { invoice_amount?: number | null }>(
  rows: T[],
  expectedOf: (row: T) => number,
): T[] {
  return rows.map((row) => {
    if (parseInvoiceAmount(row.invoice_amount) != null) return row
    return { ...row, invoice_amount: expectedOf(row) }
  })
}

export function invoiceAmountsChanged<T extends { invoice_amount?: number | null }>(
  prev: T[],
  next: T[],
): boolean {
  if (prev.length !== next.length) return true
  return next.some((row, i) => parseInvoiceAmount(prev[i]?.invoice_amount) !== parseInvoiceAmount(row.invoice_amount))
}

export type InvoiceVariance = {
  expected: number
  invoiced: number
  hasVariance: boolean
}

/** Compare Expected vs Invoice. Null invoice → no variance row (not yet applied). */
export function invoiceVariance(
  expected: number | null | undefined,
  invoiced: number | null | undefined,
): InvoiceVariance | null {
  const inv = parseInvoiceAmount(invoiced)
  if (inv == null) return null
  const exp = Number(expected) || 0
  return { expected: exp, invoiced: inv, hasVariance: exp !== inv }
}

export function entryInvoiceVariance(
  entry: Pick<CostEntry, 'amount' | 'invoice_amount'>,
): InvoiceVariance | null {
  return invoiceVariance(entry.amount, entry.invoice_amount)
}

/** Section Expected vs sum of line invoice amounts. Missing invoice_amount uses that line's Expected. */
export function sectionInvoiceVariance(
  expected: number | null | undefined,
  entries: Array<Pick<CostEntry, 'amount' | 'invoice_amount'>> | null | undefined,
): InvoiceVariance | null {
  if (!entries?.length) return null
  if (!entries.some(e => parseInvoiceAmount(e.invoice_amount) != null)) return null
  const invoiced = entries.reduce((sum, e) => {
    const inv = parseInvoiceAmount(e.invoice_amount)
    return sum + (inv ?? (Number(e.amount) || 0))
  }, 0)
  const exp = expected != null && Number.isFinite(Number(expected))
    ? Number(expected)
    : entries.reduce((sum, e) => sum + (Number(e.amount) || 0), 0)
  return invoiceVariance(exp, invoiced)
}

export function parsePaidAt(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  const ms = Date.parse(trimmed)
  return Number.isNaN(ms) ? null : trimmed
}

export function parsePaidSnapshot(raw: unknown): PaidStatusSnapshot | null {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null
  const row = raw as Record<string, unknown>
  return {
    paid: Boolean(row.paid),
    paid_at: parsePaidAt(row.paid_at),
    confirmed: row.confirmed === undefined ? true : Boolean(row.confirmed),
  }
}

export function snapshotPaidStatus(entry: Pick<PayableLine, 'paid' | 'paid_at' | 'confirmed'>): PaidStatusSnapshot {
  return {
    paid: Boolean(entry.paid),
    paid_at: entry.paid ? parsePaidAt(entry.paid_at) : null,
    confirmed: entry.confirmed === true,
  }
}

/** Line ids that were unticked when MARK ALL AS PAID captured the snapshot. */
export function untickedIdsFromPaidSnapshots(entries: PayableLine[] | null | undefined): string[] {
  if (!Array.isArray(entries)) return []
  return entries
    .filter(e => e.paid_snapshot != null && e.paid_snapshot.confirmed === false)
    .map(e => e.id)
}

/** True when a section bulk-PAID snapshot is still pending restore (undo). */
export function hasBulkPaidSnapshot(entries: PayableLine[] | null | undefined): boolean {
  return Array.isArray(entries) && entries.some(e => e.paid_snapshot != null)
}

/** Section Edit select: show MARK ALL AS PAID while a snapshot is outstanding. */
export function sectionEditSelectValue(
  entries: PayableLine[] | null | undefined,
  state: string,
): SectionEditValue {
  if (hasBulkPaidSnapshot(entries)) return SECTION_BULK_PAID_VALUE
  return isCostFieldState(state) ? state : 'guess'
}

export function parseSectionPayment(raw: unknown): SectionPayment | null {
  if (raw === SECTION_PAYMENT_PAID || raw === SECTION_PAYMENT_RESTORE) return raw
  return null
}

/**
 * W1.2b — MARK ALL AS PAID.
 * No confirm-tick gate (Lead/Gareth 2026-09-07): unticked lines are confirmed
 * by this explicit bulk payment action so existing paid-requires-confirmed
 * lock rules still hold. First bulk captures paid_snapshot; later bulks keep
 * the original so undo still restores the pre-bulk paid map.
 */
export function applyBulkMarkAllPaid<T extends PayableLine>(
  entries: T[],
  now = new Date().toISOString(),
): T[] {
  return entries.map((entry) => {
    const paid_snapshot = entry.paid_snapshot ?? snapshotPaidStatus(entry)
    return {
      ...entry,
      paid_snapshot,
      confirmed: true,
      paid: true,
      paid_at: entry.paid ? (entry.paid_at ?? now) : now,
    }
  })
}

/**
 * Restore entries[].paid / paid_at from paid_snapshot only.
 * Does not touch confirmed, amounts, or cost_fields.state.
 * Clears snapshot after apply so the next bulk can capture a fresh map.
 */
export function restorePaidSnapshot<T extends PayableLine>(entries: T[]): T[] {
  return entries.map((entry) => {
    if (entry.paid_snapshot == null) {
      return { ...entry, paid_snapshot: null }
    }
    const snap = entry.paid_snapshot
    return {
      ...entry,
      paid: snap.paid,
      paid_at: snap.paid ? snap.paid_at : null,
      paid_snapshot: null,
    }
  })
}

/**
 * Keep outstanding bulk-PAID snapshots across per-line Pay / entry edits
 * so refresh + undo still work if the client omits paid_snapshot.
 * Falls back to index when ids were assigned on first persist.
 */
export function preservePaidSnapshots<T extends PayableLine>(next: T[], previous: T[] | null | undefined): T[] {
  const prevById = new Map((previous ?? []).map(e => [e.id, e]))
  return next.map((entry, idx) => {
    if (entry.paid_snapshot != null) return entry
    const prior = prevById.get(entry.id) ?? previous?.[idx]
    if (prior?.paid_snapshot != null) {
      return { ...entry, paid_snapshot: prior.paid_snapshot }
    }
    return entry
  })
}

/** Skip W1.1 confirm→state rollup so payment actions cannot clobber figure-source state. */
export function shouldSkipConfirmRollup(opts: {
  bulkPaidApplied?: boolean
  snapshotRestored?: boolean
  paymentImpliedConfirmsOnly?: boolean
}): boolean {
  return Boolean(opts.bulkPaidApplied || opts.snapshotRestored || opts.paymentImpliedConfirmsOnly)
}

/** Portal Audit Trail `field_name` for section MARK ALL AS PAID. */
export const AUDIT_FIELD_BULK_PAID = 'MARK ALL AS PAID'
/** Portal Audit Trail `field_name` for undo / leaving bulk-PAID (paid-flag restore). */
export const AUDIT_FIELD_PAID_RESTORE = 'PAID snapshot restore'
/** Portal Audit Trail `field_name` when PAID implied confirm-ticks (state unchanged). */
export const AUDIT_FIELD_PAID_ALSO_CONFIRMED = 'PAID also confirmed'
/** Portal Audit Trail `field_name` when confirm ticks roll a section up to KNOWN. */
export const AUDIT_FIELD_SECTION_CONFIRMED = 'section confirmed'
/** Portal Audit Trail `field_name` when a line is classifier-moved between sections. */
export const AUDIT_FIELD_LINE_MOVED = 'line moved'

export function entryAuditLabel(entry: Pick<CostEntry, 'id' | 'description'>): string {
  const title = (entry.description ?? '').trim()
  const shortId = entry.id.slice(0, 8)
  return title ? `${title} (${shortId})` : `line ${shortId}`
}

export function roleAuditLabel(item: Pick<StaffLineItem, 'id' | 'role'>): string {
  const title = (item.role ?? '').trim()
  const shortId = item.id.slice(0, 8)
  return title ? `${title} (${shortId})` : `role ${shortId}`
}

export function payableAuditLabel(row: { id: string; description?: string; role?: string }): string {
  if (row.role != null && row.role !== '') return roleAuditLabel({ id: row.id, role: row.role })
  return entryAuditLabel({ id: row.id, description: row.description ?? '' })
}

export type PayableAuditUnit = 'line' | 'role'

function unitWord(unit: PayableAuditUnit, count: number): string {
  if (unit === 'role') return count === 1 ? 'role' : 'roles'
  return count === 1 ? 'line' : 'lines'
}

function joinAuditLabels(labels: string[], max = 6): string {
  if (labels.length <= max) return labels.join(', ')
  return `${labels.slice(0, max).join(', ')}, and ${labels.length - max} more`
}

export function formatSectionScope(opts: {
  sectionLabel: string
  showLabel?: string | null
  runCode?: string | null
}): string {
  const section = (opts.sectionLabel || 'this section').trim()
  const extras: string[] = []
  const show = (opts.showLabel ?? '').trim()
  const run = (opts.runCode ?? '').trim()
  if (show) extras.push(show)
  if (run) extras.push(`run ${run}`)
  return extras.length ? `${section} (${extras.join(', ')})` : section
}

export type SectionPaymentAuditCopy = {
  fieldName: string
  oldValue: string
  newValue: string
}

/**
 * Plain-language Audit Trail copy for MARK ALL AS PAID.
 * Who / when / by-line live on the audit_log row; this is the Change text.
 */
export function formatBulkPaidAuditCopy(opts: {
  actorName: string
  sectionLabel: string
  showLabel?: string | null
  runCode?: string | null
  entries: Array<PayableLine & { description?: string; role?: string }>
  unit?: PayableAuditUnit
}): SectionPaymentAuditCopy {
  const actor = opts.actorName.trim() || 'Someone'
  const unit = opts.unit ?? 'line'
  const scope = formatSectionScope(opts)
  const lineCount = opts.entries.length
  const alreadyPaid = opts.entries.filter(e => e.paid).length
  const unconfirmed = opts.entries.filter(e => !e.confirmed)
  const lines = `${lineCount} ${unitWord(unit, lineCount)}`
  let sentence = `${actor} marked all ${unit === 'role' ? 'roles' : 'lines'} in ${scope} as PAID (${lines}`
  if (unconfirmed.length > 0) {
    const verb = unconfirmed.length === 1 ? 'was' : 'were'
    sentence += `; ${unconfirmed.length} ${verb} not confirm-ticked: ${joinAuditLabels(unconfirmed.map(payableAuditLabel))} [ids: ${unconfirmed.map(e => e.id).join(', ')}]`
  }
  sentence += ').'
  const alsoConfirmed = formatAllPaidAlsoConfirmedSentence({
    actorName: actor,
    sectionLabel: opts.sectionLabel,
    confirmedCount: unconfirmed.length,
    unit,
  })
  if (alsoConfirmed) sentence += ` ${alsoConfirmed}`
  return {
    fieldName: AUDIT_FIELD_BULK_PAID,
    oldValue: `${alreadyPaid} of ${lineCount} ${unitWord(unit, lineCount)} already paid`,
    newValue: sentence,
  }
}

function actorPossessive(name: string): string {
  const actor = name.trim() || 'Someone'
  return /s$/i.test(actor) ? `${actor}'` : `${actor}'s`
}

/**
 * Plain sentence when all-PAID implied confirm-ticks (does not rewrite figure-source state).
 * Example: “Gareth's MARK ALL AS PAID also confirmed 2 lines in Venue Hire.”
 */
export function formatAllPaidAlsoConfirmedSentence(opts: {
  actorName: string
  sectionLabel: string
  confirmedCount: number
  actionLabel?: string
  unit?: PayableAuditUnit
}): string | null {
  if (opts.confirmedCount <= 0) return null
  const n = opts.confirmedCount
  const unit = opts.unit ?? 'line'
  const lines = `${n} ${unitWord(unit, n)}`
  const section = (opts.sectionLabel || 'this section').trim()
  const action = (opts.actionLabel ?? 'MARK ALL AS PAID').trim() || 'MARK ALL AS PAID'
  return `${actorPossessive(opts.actorName)} ${action} also confirmed ${lines} in ${section}.`
}

/**
 * Plain-language Audit Trail copy for restoring the prior paid snapshot.
 * Paid flags only — never mentions a figure-source rewrite.
 */
export function formatPaidRestoreAuditCopy(opts: {
  actorName: string
  sectionLabel: string
  showLabel?: string | null
  runCode?: string | null
  before: Array<PayableLine & { description?: string; role?: string }>
  after: Array<PayableLine & { description?: string; role?: string }>
  unit?: PayableAuditUnit
}): SectionPaymentAuditCopy {
  const actor = opts.actorName.trim() || 'Someone'
  const unit = opts.unit ?? 'line'
  const scope = formatSectionScope(opts)
  const beforeById = new Map(opts.before.map(e => [e.id, e]))
  const unpaidAgain = opts.after.filter(row => Boolean(beforeById.get(row.id)?.paid) && !row.paid)
  const lineCount = opts.after.length
  let sentence = `${actor} restored prior PAID snapshot for ${scope}`
  if (unpaidAgain.length > 0) {
    sentence += ` (${unpaidAgain.length} ${unitWord(unit, unpaidAgain.length)} unpaid again: ${joinAuditLabels(unpaidAgain.map(payableAuditLabel))})`
  } else {
    sentence += ` (${lineCount} ${unitWord(unit, lineCount)}; paid flags unchanged)`
  }
  sentence += '.'
  return {
    fieldName: AUDIT_FIELD_PAID_RESTORE,
    oldValue: 'Section was bulk-PAID',
    newValue: sentence,
  }
}

/**
 * Plain-language Audit Trail copy when every line is confirm-ticked
 * and the section rolls up to KNOWN. Confirm ≠ PAID ≠ figure-source KNOWN
 * stay distinct: this sentence is the attestation roll-up.
 */
export function formatSectionConfirmedAuditCopy(opts: {
  actorName: string
  sectionLabel: string
  lineCount: number
  unit?: PayableAuditUnit
}): SectionPaymentAuditCopy {
  const actor = opts.actorName.trim() || 'Someone'
  const n = opts.lineCount
  const unit = opts.unit ?? 'line'
  const lines = `${n} ${unitWord(unit, n)}`
  return {
    fieldName: AUDIT_FIELD_SECTION_CONFIRMED,
    oldValue: 'Section was not fully confirm-ticked',
    newValue: `${actor} confirmed the ${opts.sectionLabel} section (all ${lines} ticked).`,
  }
}

/** Stamp paid_at when marking PAID; clear on un-pay. Preserves existing / client paid_at. */
export function stampPaidAt<T extends PayableLine>(
  next: T[],
  previous: T[] | null | undefined,
  now = new Date().toISOString(),
): T[] {
  const prevById = new Map((previous ?? []).map(e => [e.id, e]))
  return next.map((entry) => {
    if (!entry.paid) return { ...entry, paid_at: null }
    const prior = prevById.get(entry.id)
    return { ...entry, paid_at: entry.paid_at ?? prior?.paid_at ?? now }
  })
}

function lockedFieldChanged(prev: CostEntry, next: CostEntry, field: PaidLockedEntryField): boolean {
  if (field === 'amount') return Number(prev.amount) !== Number(next.amount)
  return prev[field] !== next[field]
}

/**
 * Reject edits to a still-paid line, paying without attestation, or deleting a paid line.
 * Un-paying in the same payload unlocks (Wave 2 bank match can call the same lock).
 */
export function paidLockViolation(
  existing: CostEntry[] | null | undefined,
  next: CostEntry[],
): string | null {
  const prevById = new Map((existing ?? []).map(e => [e.id, e]))

  for (const row of next) {
    if (row.paid && !row.confirmed) {
      return 'Cannot mark a line PAID until it is confirmed (operator attestation)'
    }
    const prev = prevById.get(row.id)
    if (!prev?.paid || !row.paid) continue
    const changed = PAID_LOCKED_ENTRY_FIELDS.some(field => lockedFieldChanged(prev, row, field))
    if (changed) {
      return 'Paid line is locked — un-pay before editing amount, description, notes, or confirm'
    }
  }

  for (const prev of existing ?? []) {
    if (prev.paid && !next.some(row => row.id === prev.id)) {
      return 'Cannot remove a paid line — un-pay first'
    }
  }

  return null
}

function lockedLineItemFieldChanged(
  prev: StaffLineItem,
  next: StaffLineItem,
  field: PaidLockedLineItemField,
): boolean {
  if (field === 'rate' || field === 'hours' || field === 'headcount') {
    return Number(prev[field]) !== Number(next[field])
  }
  if (field === 'source') return String(prev.source ?? '') !== String(next.source ?? '')
  return prev[field] !== next[field]
}

/**
 * Reject edits to a still-paid planned role, paying without attestation, or deleting a paid role.
 * Un-paying in the same payload unlocks.
 */
export function paidLineItemLockViolation(
  existing: StaffLineItem[] | null | undefined,
  next: StaffLineItem[],
): string | null {
  const prevById = new Map((existing ?? []).map(e => [e.id, e]))

  for (const row of next) {
    if (row.paid && !row.confirmed) {
      return 'Cannot mark a role PAID until it is confirmed (operator attestation)'
    }
    const prev = prevById.get(row.id)
    if (!prev?.paid || !row.paid) continue
    const changed = PAID_LOCKED_LINE_ITEM_FIELDS.some(field => lockedLineItemFieldChanged(prev, row, field))
    if (changed) {
      return 'Paid role is locked — un-pay before editing rate, hours, headcount, description, or confirm'
    }
  }

  for (const prev of existing ?? []) {
    if (prev.paid && !next.some(row => row.id === prev.id)) {
      return 'Cannot remove a paid role — un-pay first'
    }
  }

  return null
}

/**
 * Page-open seed: empty entries → one or more unconfirmed placeholders.
 * Do not treat that write as an un-confirm (would flip a manual CONFIRMED badge).
 */
export function isUnconfirmedEntriesSeed(
  existingEntries: CostEntry[] | null | undefined,
  nextEntries: CostEntry[] | null | undefined,
): boolean {
  if (existingEntries && existingEntries.length > 0) return false
  if (!nextEntries?.length) return false
  return nextEntries.every(e => !e.confirmed)
}

/** Default non-confirmed state for a defined field — never `known` or `invoiced`. */
export function fallbackNonConfirmedState(fieldKey: string): Exclude<CostFieldState, 'known' | 'invoiced'> {
  const def = definedCostField(fieldKey)
  const raw = def?.defaultState
  if (raw && raw !== CONFIRMED_FIELD_STATE && raw !== INVOICED_FIELD_STATE && raw !== 'auto_calc') return raw
  return 'estimated'
}

/**
 * Read the last pre-confirm state from audit_log rows (newest first).
 * Accepts both writeAuditLog (`state`) and trigger names (`flights.state`).
 */
export function pickPriorStateFromAuditRows(
  rows: Array<{ field_name?: string | null; old_value?: string | null; new_value?: string | null }>,
): string | null {
  for (const row of rows) {
    const name = row.field_name ?? ''
    if (name !== 'state' && !name.endsWith('.state')) continue
    if (row.new_value !== CONFIRMED_FIELD_STATE) continue
    if (isNonConfirmedFieldState(row.old_value)) return row.old_value
  }
  return null
}

/**
 * Roll line-item ticks up to cost_fields.state (`known` = CONFIRMED attestation).
 * Unticking any line restores priorNonConfirmedState, else the field default.
 * PAID is not a cost_fields.state — do not write `paid` here (figure accuracy stays).
 * invoiced is past Confirmed on the ladder — confirm ticks must not downgrade it.
 */
export function rolledUpCostFieldState(opts: {
  entries: PayableLine[] | null | undefined
  currentState: string
  priorNonConfirmedState?: string | null
  fieldKey?: string
}): string {
  const { entries, currentState, priorNonConfirmedState, fieldKey } = opts
  if (!Array.isArray(entries) || entries.length === 0) return currentState
  if (allEntriesConfirmed(entries)) {
    return currentState === INVOICED_FIELD_STATE ? INVOICED_FIELD_STATE : CONFIRMED_FIELD_STATE
  }
  if (currentState !== CONFIRMED_FIELD_STATE) return currentState
  if (isNonConfirmedFieldState(priorNonConfirmedState)) return priorNonConfirmedState
  return fieldKey ? fallbackNonConfirmedState(fieldKey) : 'estimated'
}

function newEntryId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `e-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

/**
 * Ensure ≥1 entry. If empty, create one default from label + amount.
 * Does not invent amounts beyond the provided fallback (existing value or 0).
 */
export function ensureMinimumEntry(
  entries: CostEntry[] | null | undefined,
  label: string,
  fallbackAmount: number | null | undefined,
): CostEntry[] {
  if (Array.isArray(entries) && entries.length > 0) return entries
  const amount = fallbackAmount != null && !Number.isNaN(Number(fallbackAmount))
    ? Number(fallbackAmount)
    : 0
  const description = (label && label.trim()) || 'Estimate'
  return [{
    id: newEntryId(),
    description,
    notes: '',
    amount,
    gst_included: true,
    confirmed: false,
    paid: false,
    paid_at: null,
    attachment_path: null,
    attachment_filename: null,
    attachment_mime: null,
    quote_note: '',
    payables_document_id: null,
  }]
}

function payableFlagsFromRaw(row: Record<string, unknown>, fallbackId: () => string): PayableLine {
  const paid = Boolean(row.paid)
  return {
    id: typeof row.id === 'string' && row.id ? row.id : fallbackId(),
    confirmed: Boolean(row.confirmed),
    paid,
    paid_at: paid ? parsePaidAt(row.paid_at) : null,
    paid_snapshot: parsePaidSnapshot(row.paid_snapshot),
  }
}

/** Normalize planned venue_staff roles; assign ids so confirm/PAID can key off them. */
export function normalizeLineItems(raw: unknown): StaffLineItem[] | null {
  if (raw === undefined) return null
  if (!Array.isArray(raw)) return []
  return raw.map((e) => {
    const row = e as Record<string, unknown>
    return {
      ...payableFlagsFromRaw(row, newEntryId),
      role: String(row.role ?? ''),
      rate: Number(row.rate) || 0,
      hours: Number(row.hours) || 0,
      headcount: Number(row.headcount) || 0,
      source: row.source != null ? String(row.source) : '',
      invoice_amount: parseInvoiceAmount(row.invoice_amount),
    }
  })
}

/** Normalize entries payload from client; drop invalid rows. */
export function normalizeEntries(raw: unknown): CostEntry[] | null {
  if (raw === undefined) return null
  if (!Array.isArray(raw)) return []
  return raw.map((e) => {
    const row = e as Record<string, unknown>
    const paid = Boolean(row.paid)
    return {
      id: typeof row.id === 'string' && row.id ? row.id : newEntryId(),
      description: String(row.description ?? ''),
      notes: String(row.notes ?? ''),
      amount: Number(row.amount) || 0,
      invoice_amount: parseInvoiceAmount(row.invoice_amount),
      gst_included: Boolean(row.gst_included),
      confirmed: Boolean(row.confirmed),
      paid,
      paid_at: paid ? parsePaidAt(row.paid_at) : null,
      paid_snapshot: parsePaidSnapshot(row.paid_snapshot),
      attachment_path: row.attachment_path != null && String(row.attachment_path) ? String(row.attachment_path) : null,
      attachment_filename: row.attachment_filename != null && String(row.attachment_filename) ? String(row.attachment_filename) : null,
      attachment_mime: row.attachment_mime != null && String(row.attachment_mime) ? String(row.attachment_mime) : null,
      quote_note: String(row.quote_note ?? ''),
      payables_document_id: row.payables_document_id != null && String(row.payables_document_id)
        ? String(row.payables_document_id)
        : null,
      night_date: typeof row.night_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(row.night_date)
        ? row.night_date
        : null,
      city: row.city != null && String(row.city).trim() ? String(row.city).trim() : null,
      vendor: row.vendor != null && String(row.vendor).trim() ? String(row.vendor).trim() : null,
      confirmation_id: row.confirmation_id != null && String(row.confirmation_id).trim()
        ? String(row.confirmation_id).trim()
        : null,
      receipt_kind: row.receipt_kind === 'refund' || row.receipt_kind === 'charge'
        ? row.receipt_kind
        : null,
    }
  })
}

/** Spec for a missing defined field that should be created on load/open. */
export type MissingCostFieldSpec = {
  fieldDef: CostFieldDef
  showId: string | null
}

/**
 * Find defined cost lines that have no DB row yet (e.g. backline_hire on G2 R01).
 * Pass showIds for per-show fields.
 */
export function findMissingDefinedCostFields(
  existing: Array<{ show_id: string | null; field_key: string }>,
  showIds: string[],
  opts?: { role?: string; onlyVisibleToRole?: boolean },
): MissingCostFieldSpec[] {
  const onlyVisible = opts?.onlyVisibleToRole ?? false
  const role = opts?.role
  const has = (showId: string | null, key: string) =>
    existing.some(f => (f.show_id ?? null) === showId && f.field_key === key)

  const missing: MissingCostFieldSpec[] = []

  for (const def of DEFINED_RUN_COST_FIELDS) {
    if (onlyVisible && !roleCanSeeCostField(role, def.key)) continue
    if (!has(null, def.key)) missing.push({ fieldDef: def, showId: null })
  }

  for (const showId of showIds) {
    for (const def of DEFINED_SHOW_COST_FIELDS) {
      if (onlyVisible && !roleCanSeeCostField(role, def.key)) continue
      if (!has(showId, def.key)) missing.push({ fieldDef: def, showId })
    }
  }

  return missing
}

/** Build POST /api/cost-fields body for a missing defined field. */
export function buildCreateCostFieldBody(
  runId: string,
  spec: MissingCostFieldSpec,
): Record<string, unknown> {
  const { fieldDef, showId } = spec
  const entries = ENTRY_EXEMPT_FIELD_KEYS.has(fieldDef.key)
    ? []
    : ensureMinimumEntry([], defaultCostEntryDescription(fieldDef.key, fieldDef.label), 0)

  const body: Record<string, unknown> = {
    run_id: runId,
    show_id: showId,
    category: fieldDef.category,
    field_key: fieldDef.key,
    label: fieldDef.label,
    value: ENTRY_EXEMPT_FIELD_KEYS.has(fieldDef.key) ? null : entriesSum(entries),
    state: fieldDef.defaultState,
    entries,
  }

  if (fieldDef.key === 'venue_staff') {
    body.line_items = []
  }

  return body
}

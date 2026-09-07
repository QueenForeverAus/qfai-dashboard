/** Shared Run Costing helpers — entries as source of truth for line totals. */

export type CostEntry = {
  id: string
  description: string
  notes: string
  amount: number
  gst_included: boolean
  confirmed: boolean
}

/** Section badge CONFIRMED — existing cost_fields.state value, not a parallel status. */
export const CONFIRMED_FIELD_STATE = 'known' as const

export const COST_FIELD_STATES = ['known', 'estimated', 'guess', 'pending', 'auto_calc'] as const
export type CostFieldState = (typeof COST_FIELD_STATES)[number]

export function isCostFieldState(value: string | null | undefined): value is CostFieldState {
  return value != null && (COST_FIELD_STATES as readonly string[]).includes(value)
}

export function isNonConfirmedFieldState(
  value: string | null | undefined,
): value is Exclude<CostFieldState, 'known'> {
  return isCostFieldState(value) && value !== CONFIRMED_FIELD_STATE
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

/** Canonical per-show cost lines shown in Run Costing. */
export const DEFINED_SHOW_COST_FIELDS: CostFieldDef[] = [
  { key: 'gross_box_office', label: 'Gross Box Office', category: 'Revenue', defaultState: 'pending', scope: 'show' },
  { key: 'venue_hire', label: 'Venue Hire', category: 'Venue Costs', defaultState: 'guess', scope: 'show' },
  { key: 'venue_staff', label: 'Venue Staff / On-costs', category: 'Venue Costs', defaultState: 'guess', scope: 'show' },
  { key: 'venue_marketing', label: 'Venue Marketing', category: 'Venue Costs', defaultState: 'guess', scope: 'show' },
  { key: 'production_costs', label: 'Production / AV', category: 'Venue Costs', defaultState: 'guess', scope: 'show' },
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
  { key: 'lighting_hire', label: 'Lighting Equipment Hire', category: 'Production', defaultState: 'estimated', scope: 'run' },
  { key: 'backline_hire', label: 'Backline Hire (local)', category: 'Production', defaultState: 'estimated', scope: 'run' },
  { key: 'crew_travel_day', label: 'Crew Travel-Day Fee', category: 'Crew & Operations', defaultState: 'guess', scope: 'run' },
  { key: 'fb_ads', label: 'Facebook / Social Ads', category: 'Marketing', defaultState: 'guess', scope: 'run' },
  { key: 'social_ads_var', label: 'Social Media Marketing Co. — $1/ticket', category: 'Marketing', defaultState: 'auto_calc', scope: 'run' },
]

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

/** True when the section has ≥1 line and every line-item confirm tick is checked. */
export function allEntriesConfirmed(entries: CostEntry[] | null | undefined): boolean {
  return Array.isArray(entries) && entries.length > 0 && entries.every(e => e.confirmed)
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

/** Default non-confirmed state for a defined field — never `known`. */
export function fallbackNonConfirmedState(fieldKey: string): Exclude<CostFieldState, 'known'> {
  const def = [...DEFINED_RUN_COST_FIELDS, ...DEFINED_SHOW_COST_FIELDS].find(f => f.key === fieldKey)
  const raw = def?.defaultState
  if (raw && raw !== CONFIRMED_FIELD_STATE && raw !== 'auto_calc') return raw
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
 * Roll line-item ticks up to cost_fields.state (`known` = CONFIRMED).
 * Unticking any line restores priorNonConfirmedState, else the field default.
 */
export function rolledUpCostFieldState(opts: {
  entries: CostEntry[] | null | undefined
  currentState: string
  priorNonConfirmedState?: string | null
  fieldKey?: string
}): string {
  const { entries, currentState, priorNonConfirmedState, fieldKey } = opts
  if (!Array.isArray(entries) || entries.length === 0) return currentState
  if (allEntriesConfirmed(entries)) return CONFIRMED_FIELD_STATE
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
  }]
}

/** Normalize entries payload from client; drop invalid rows. */
export function normalizeEntries(raw: unknown): CostEntry[] | null {
  if (raw === undefined) return null
  if (!Array.isArray(raw)) return []
  return raw.map((e) => {
    const row = e as Record<string, unknown>
    return {
      id: typeof row.id === 'string' && row.id ? row.id : newEntryId(),
      description: String(row.description ?? ''),
      notes: String(row.notes ?? ''),
      amount: Number(row.amount) || 0,
      gst_included: Boolean(row.gst_included),
      confirmed: Boolean(row.confirmed),
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
    : ensureMinimumEntry([], fieldDef.label, 0)

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

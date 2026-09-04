/** Shared Run Costing helpers — entries as source of truth for line totals. */

export type CostEntry = {
  id: string
  description: string
  notes: string
  amount: number
  gst_included: boolean
  confirmed: boolean
}

/** Auto-calc / revenue lines — entries optional; not forced to ≥1. */
export const ENTRY_EXEMPT_FIELD_KEYS = new Set(['social_ads_var', 'gross_box_office'])

/**
 * Fields production role may edit (matches CostFieldsTab visibility).
 * Run-level Production category + per-show venue_staff / production_costs.
 */
export const PRODUCTION_EDITABLE_FIELD_KEYS = new Set([
  'venue_staff',
  'production_costs',
  'lighting_hire',
  'backline_hire',
  'food_basics',
])

export function canEditCostFields(role: string | undefined): boolean {
  return role === 'owner' || role === 'admin' || role === 'production'
}

export function productionCanEditFieldKey(fieldKey: string): boolean {
  return PRODUCTION_EDITABLE_FIELD_KEYS.has(fieldKey)
}

export function entriesSum(entries: CostEntry[] | null | undefined): number {
  if (!entries?.length) return 0
  return entries.reduce((sum, e) => sum + (Number(e.amount) || 0), 0)
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

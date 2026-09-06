/** Run Costing — Notes / Source of Data labels and display-time attribution. */

export const NOTES_SOURCE_OF_DATA_LABEL = 'Notes / Source of Data'

/** Add/edit form only — typed notes, not source attribution. */
export const NOTES_INPUT_LABEL = 'Notes'

/** Fields whose seed blurbs are Factors-driven (same set as generate-entries). */
export const FACTOR_FIELD_KEYS = new Set([
  'ground_transport',
  'accommodation',
  'lighting_hire',
  'food_basics',
  'per_diems',
  'backline_hire',
  'crew_travel_day',
  'brad_driver_fee',
])

/**
 * First token of a real profile/auth display name.
 * Returns null when the name is missing — never invents a placeholder.
 */
export function staffDisplayName(fullName: string | null | undefined): string | null {
  const n = (fullName ?? '').trim()
  if (!n) return null
  const first = n.split(/\s+/)[0]
  return first || null
}

/** `Entered by Michael` from a real full_name, or null if unresolvable. */
export function enteredByLabel(fullName: string | null | undefined): string | null {
  const name = staffDisplayName(fullName)
  return name ? `Entered by ${name}` : null
}

/** Remittance / Factors / Draft schedule wording that must be left unchanged. */
export function hasPreservedSource(text: string | null | undefined): boolean {
  const t = (text ?? '').trim()
  if (!t) return false
  return (
    /remittance/i.test(t) ||
    /Source:\s*Factors/i.test(t) ||
    /\bDraft\s+\d+/i.test(t) ||
    /Draft\s+schedule/i.test(t)
  )
}

function truncateLead(s: string): string {
  const lead = s.split(/(?<=\.)\s+/)[0] || s
  return lead.length > 140 ? `${lead.slice(0, 137)}…` : lead
}

/**
 * Notes / Source of Data cell.
 * Prefer entry notes; optionally fall back to field-level source; then
 * `Entered by <name>` when a real editor name is known and the line is not
 * already remittance / Factors / Draft attributed.
 */
export function formatNotesSource(opts: {
  notes?: string | null
  fieldSource?: string | null
  fieldKey?: string | null
  editorDisplayName?: string | null
  allowFieldSourceFallback?: boolean
}): string {
  const allowField = opts.allowFieldSourceFallback !== false
  let n = (opts.notes ?? '').trim()
  if (n) {
    if (hasPreservedSource(n)) return n
    if (
      opts.fieldKey &&
      FACTOR_FIELD_KEYS.has(opts.fieldKey) &&
      !/Source:\s*Factors/i.test(n)
    ) {
      n = `${n} — Source: Factors`
    }
    return n
  }

  if (allowField) {
    const s = (opts.fieldSource ?? '').trim()
    if (s) return truncateLead(s)
  }

  const entered = enteredByLabel(opts.editorDisplayName)
  return entered ?? ''
}

/** Map cost_field id → staff display name from updated_by profiles, then audit actors. */
export function resolveEditorDisplayNames(args: {
  fields: Array<{ id: string; updated_by?: string | null }>
  profiles: Array<{ id: string; full_name: string | null }>
  auditActors?: Array<{ record_id?: string | null; full_name?: string | null }>
}): Record<string, string> {
  const nameByUserId = new Map<string, string>()
  for (const p of args.profiles) {
    const n = staffDisplayName(p.full_name)
    if (n) nameByUserId.set(p.id, n)
  }

  const out: Record<string, string> = {}
  for (const f of args.fields) {
    if (!f.updated_by) continue
    const n = nameByUserId.get(f.updated_by)
    if (n) out[f.id] = n
  }

  // Audit is typically newest-first; first actor for a record wins.
  for (const a of args.auditActors ?? []) {
    if (!a.record_id || out[a.record_id]) continue
    const n = staffDisplayName(a.full_name)
    if (n) out[a.record_id] = n
  }

  return out
}

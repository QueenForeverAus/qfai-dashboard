import type { SupabaseClient } from '@supabase/supabase-js'

export type AuditLogWriteRow = {
  table_name: string
  record_id: string
  run_id: string | null
  field_name: string
  old_value: string | null
  new_value: string | null
  change_type: 'update'
}

export const COST_FIELD_AUDIT_FIELDS = [
  'value',
  'state',
  'source',
  'entries',
  'line_items',
  'label',
] as const

export const ADVANCEMENT_AUDIT_FIELDS = [
  'status',
  'notes',
  'assigned_to',
  'paid',
  'payment_type',
  'label',
] as const

export const RUN_WORKSHEET_AUDIT_FIELDS = [
  'flights_notes',
  'vehicles_notes',
  'hotels_overview_notes',
] as const

const MAX_AUDIT_VALUE_LEN = 2000

/** Stringify a cell for audit_log; objects/arrays become JSON. */
export function auditStringify(value: unknown): string | null {
  if (value === null || value === undefined) return null
  let text: string
  if (typeof value === 'string') {
    text = value
  } else if (typeof value === 'number' || typeof value === 'boolean') {
    text = String(value)
  } else {
    try {
      text = JSON.stringify(value)
    } catch {
      text = String(value)
    }
  }
  return text.length > MAX_AUDIT_VALUE_LEN ? text.slice(0, MAX_AUDIT_VALUE_LEN) : text
}

function valuesEqual(before: unknown, after: unknown): boolean {
  if (before === after) return true
  if (before == null && after == null) return true
  if (typeof before === 'object' || typeof after === 'object') {
    return auditStringify(before) === auditStringify(after)
  }
  // numeric PG values often come back as strings
  if (
    (typeof before === 'number' || typeof after === 'number' || typeof before === 'string' || typeof after === 'string')
    && before != null
    && after != null
    && !Number.isNaN(Number(before))
    && !Number.isNaN(Number(after))
    && String(before) !== String(after)
  ) {
    return Number(before) === Number(after)
  }
  return String(before) === String(after)
}

/**
 * Diff selected fields on a row. Skips `updated_at` noise and unchanged values.
 */
export function auditFieldDiffs(
  table: string,
  recordId: string,
  runId: string | null,
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
  fields: readonly string[],
): AuditLogWriteRow[] {
  const prev = before ?? {}
  const next = after ?? {}
  const rows: AuditLogWriteRow[] = []
  for (const field of fields) {
    if (field === 'updated_at') continue
    const oldVal = prev[field]
    const newVal = next[field]
    if (valuesEqual(oldVal, newVal)) continue
    rows.push({
      table_name: table,
      record_id: recordId,
      run_id: runId,
      field_name: field,
      old_value: auditStringify(oldVal),
      new_value: auditStringify(newVal),
      change_type: 'update',
    })
  }
  return rows
}

/**
 * Insert audit rows attributed to `userId`. No-ops on an empty list.
 * Failures are logged and swallowed so the caller’s successful write is not rolled back.
 */
export async function writeAuditLog(
  adminClient: SupabaseClient,
  userId: string,
  rows: AuditLogWriteRow[],
): Promise<void> {
  if (!rows.length) return
  const changedAt = new Date().toISOString()
  const payload = rows.map(row => ({
    ...row,
    changed_by: userId,
    changed_at: changedAt,
  }))
  const { error } = await adminClient.from('audit_log').insert(payload)
  if (error) {
    console.error('writeAuditLog failed', error.message)
  }
}

/**
 * Best-effort: set `app.user_id` so SECURITY DEFINER triggers using
 * `qf_audit_actor()` can attribute service-role writes.
 *
 * `set_config(..., true)` is transaction-local. supabase-js issues one HTTP
 * request per call, so this usually cannot stick until the following UPDATE.
 * Prefer `writeAuditLog` (and `updated_by` on the row) for attribution.
 */
export async function setAuditActor(
  adminClient: SupabaseClient,
  userId: string,
): Promise<void> {
  if (!userId) return
  const attempts: Array<() => PromiseLike<{ error: { message: string } | null }>> = [
    () => adminClient.rpc('qf_set_audit_actor', { p_user_id: userId }),
    () => adminClient.rpc('set_config', {
      setting_name: 'app.user_id',
      new_value: userId,
      is_local: true,
    }),
  ]
  for (const attempt of attempts) {
    try {
      const { error } = await attempt()
      if (!error) return
    } catch {
      // RPC not exposed — fall through
    }
  }
}

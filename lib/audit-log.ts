import type { SupabaseClient } from '@supabase/supabase-js'

export type AuditChange = {
  table_name: string
  record_id: string
  run_id: string | null
  field_name: string
  old_value: string | null
  new_value: string | null
  change_type: 'insert' | 'update'
}

function toAuditText(val: unknown): string | null {
  if (val === undefined || val === null) return null
  if (typeof val === 'string') return val.slice(0, 2000)
  if (typeof val === 'number' || typeof val === 'boolean') return String(val)
  try {
    return JSON.stringify(val).slice(0, 2000)
  } catch {
    return String(val).slice(0, 2000)
  }
}

/** PostgREST does not keep set_config across HTTP requests. Prefer updated_by + insertAuditRows. */
export async function setAuditActor(
  _supabase: SupabaseClient,
  _userId: string,
): Promise<void> {
  // no-op over PostgREST
}

export function diffAuditFields(
  tableName: string,
  recordId: string,
  runId: string | null,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  fields: string[],
): AuditChange[] {
  const rows: AuditChange[] = []
  for (const field of fields) {
    if (!(field in after) && !(field in before)) continue
    const oldV = toAuditText(before[field])
    const newV = toAuditText(after[field])
    if (oldV === newV) continue
    rows.push({
      table_name: tableName,
      record_id: recordId,
      run_id: runId,
      field_name: field,
      old_value: oldV,
      new_value: newV,
      change_type: 'update',
    })
  }
  return rows
}

/** Explicit audit_log inserts (service role). Complements DB triggers. */
export async function insertAuditRows(
  supabase: SupabaseClient,
  changedBy: string,
  changes: AuditChange[],
): Promise<void> {
  if (!changes.length) return
  const payload = changes.map((c) => ({
    table_name: c.table_name,
    record_id: c.record_id,
    run_id: c.run_id,
    field_name: c.field_name,
    old_value: c.old_value,
    new_value: c.new_value,
    changed_by: changedBy,
    change_type: c.change_type,
    changed_at: new Date().toISOString(),
  }))
  const { error } = await supabase.from('audit_log').insert(payload)
  if (error) console.error('[audit_log] insert failed', error.message)
}

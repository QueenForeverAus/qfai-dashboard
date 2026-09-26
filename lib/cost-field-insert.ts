/**
 * Idempotent cost_fields insert.
 *
 * Show-level rows are unique on (run_id, show_id, field_key). Run-level
 * rows (show_id NULL) are not, until cost_fields_run_level_field_key_uidx
 * exists — Postgres treats each NULL as distinct. Callers look up first
 * and, on 23505, return the row that won the race instead of 500.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export function isUniqueViolation(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  if (error.code === '23505') return true
  return /duplicate key/i.test(error.message ?? '')
}

export function costFieldIdentityKey(showId: string | null | undefined, fieldKey: string): string {
  return `${showId ?? ''}:${fieldKey}`
}

type IdentityRow = { show_id?: string | null; field_key?: string | null }

export async function findCostFieldByIdentity(
  supabase: SupabaseClient,
  runId: string,
  fieldKey: string,
  showId: string | null,
): Promise<{ row: Record<string, unknown> | null; error: { message: string } | null }> {
  let query = supabase
    .from('cost_fields')
    .select('*')
    .eq('run_id', runId)
    .eq('field_key', fieldKey)
  query = showId ? query.eq('show_id', showId) : query.is('show_id', null)
  const { data, error } = await query.order('created_at', { ascending: true }).limit(1)
  if (error) return { row: null, error: { message: error.message } }
  const row = Array.isArray(data) && data.length > 0 ? data[0] as Record<string, unknown> : null
  return { row, error: null }
}

/**
 * Insert only identities that are not already stored. A unique violation
 * on a parallel insert is skipped (the other request owns the row).
 * Run-level duplicates can still slip through until the partial unique
 * index exists; the lookup above closes the common page-load race.
 */
export async function insertCostFieldsSkipDuplicates(
  supabase: SupabaseClient,
  rows: Record<string, unknown>[],
): Promise<{ inserted: number; skipped: number }> {
  if (!rows.length) return { inserted: 0, skipped: 0 }
  const runId = String(rows[0]?.run_id ?? '')
  const { data: existing, error: readError } = await supabase
    .from('cost_fields')
    .select('show_id, field_key')
    .eq('run_id', runId)
  if (readError) {
    console.error('cost_fields identity read failed', readError.message)
    return { inserted: 0, skipped: rows.length }
  }
  const have = new Set(
    ((existing ?? []) as IdentityRow[]).map(row => costFieldIdentityKey(row.show_id, String(row.field_key ?? ''))),
  )
  const missing = rows.filter(row => !have.has(costFieldIdentityKey(
    (row.show_id as string | null | undefined) ?? null,
    String(row.field_key ?? ''),
  )))
  const skipped = rows.length - missing.length
  if (!missing.length) return { inserted: 0, skipped }

  const { error } = await supabase.from('cost_fields').insert(missing)
  if (!error) return { inserted: missing.length, skipped }
  if (!isUniqueViolation(error)) {
    console.error('cost_fields insert failed', error.message)
    return { inserted: 0, skipped: skipped + missing.length }
  }

  let inserted = 0
  for (const row of missing) {
    const { error: rowError } = await supabase.from('cost_fields').insert(row)
    if (!rowError) {
      inserted++
      continue
    }
    if (!isUniqueViolation(rowError)) console.error('cost_fields insert failed', rowError.message)
  }
  return { inserted, skipped: skipped + (missing.length - inserted) }
}

/**
 * Run-level cost_fields dedupe. STAGING ONLY.
 *
 *   node scripts/dedupe-run-level-cost-fields.mjs            # dry-run
 *   node scripts/dedupe-run-level-cost-fields.mjs --apply    # backup + delete
 *
 * Uses NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 * Refuses https://pfbgrukqxegkiaksuatm.supabase.co (production).
 * There is no flag that overrides that refusal.
 *
 * Keeper rule lives in lib/cost-field-dedupe.ts. Dropped rows are written
 * to cost_fields_run_level_dedupe_backup and to a JSON file under
 * scripts/dedupe-backups/ (gitignored by not committing that folder).
 */

import { createClient } from '@supabase/supabase-js'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { planRunLevelDedupe } from '../lib/cost-field-dedupe.ts'

const PROD_REF = 'pfbgrukqxegkiaksuatm'
const STAGING_REF = 'nlenbzhwnyigsihcphoz'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const apply = process.argv.includes('--apply')

if (!url || !key) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
if (url.includes(PROD_REF)) {
  console.error(`Refusing to run: ${url} is production (${PROD_REF}).`)
  process.exit(1)
}
if (!url.includes(STAGING_REF)) {
  console.error(`Refusing to run: URL is not staging (${STAGING_REF}).`)
  process.exit(1)
}

const supabase = createClient(url, key, { auth: { persistSession: false } })

const { data, error } = await supabase
  .from('cost_fields')
  .select('id, run_id, field_key, created_at, updated_by, value, entries, line_items')
  .is('show_id', null)

if (error) {
  console.error(error.message)
  process.exit(1)
}

const plans = planRunLevelDedupe(data ?? [])
const drops = plans.flatMap(plan => plan.drop.map(row => ({
  run_id: plan.run_id,
  field_key: plan.field_key,
  drop_id: row.id,
  keeper_id: plan.keep.id,
  drop_value: row.value ?? null,
  keeper_value: plan.keep.value ?? null,
  drop_created_at: row.created_at,
  keeper_created_at: plan.keep.created_at,
})))

console.log(JSON.stringify({
  mode: apply ? 'apply' : 'dry-run',
  duplicate_pairs: plans.length,
  rows_to_remove: drops.length,
  pairs: drops,
}, null, 2))

if (!apply) {
  console.error('Dry run only. Re-run with --apply to delete these rows on staging.')
  process.exit(0)
}

const batchId = crypto.randomUUID()
const here = dirname(fileURLToPath(import.meta.url))
const backupDir = join(here, 'dedupe-backups')
mkdirSync(backupDir, { recursive: true })
const backupPath = join(backupDir, `${batchId}.json`)

const fullDrops = []
for (const plan of plans) {
  for (const row of plan.drop) {
    const { data: full, error: readError } = await supabase
      .from('cost_fields')
      .select('*')
      .eq('id', row.id)
      .maybeSingle()
    if (readError || !full) {
      console.error('Failed to read row', row.id, readError?.message)
      process.exit(1)
    }
    fullDrops.push({ keeper_id: plan.keep.id, row: full })
  }
}

writeFileSync(backupPath, JSON.stringify({ batch_id: batchId, dropped: fullDrops }, null, 2))
console.error(`Wrote ${backupPath}`)

const backupRows = fullDrops.map(item => ({
  batch_id: batchId,
  cost_field_id: item.row.id,
  run_id: item.row.run_id,
  field_key: item.row.field_key,
  keeper_id: item.keeper_id,
  row_data: item.row,
}))
const { error: backupError } = await supabase
  .from('cost_fields_run_level_dedupe_backup')
  .insert(backupRows)
if (backupError) {
  console.error('Backup table insert failed. Create it with scripts/dedupe-run-level-cost-fields-apply.sql before --apply. No rows were deleted.')
  console.error(backupError.message)
  process.exit(1)
}

for (const item of fullDrops) {
  const { error: commentError } = await supabase
    .from('field_comments')
    .update({ cost_field_id: item.keeper_id })
    .eq('cost_field_id', item.row.id)
  if (commentError && !/schema cache|Could not find/i.test(commentError.message)) {
    console.error('comment re-point failed', item.row.id, commentError.message)
    process.exit(1)
  }
  const { error: deleteError } = await supabase.from('cost_fields').delete().eq('id', item.row.id)
  if (deleteError) {
    console.error('delete failed', item.row.id, deleteError.message)
    process.exit(1)
  }
}

const { count } = await supabase
  .from('cost_fields')
  .select('id', { count: 'exact', head: true })
  .is('show_id', null)

console.error(JSON.stringify({
  applied: true,
  batch_id: batchId,
  removed: fullDrops.length,
  backup: backupPath,
  run_level_rows_remaining: count,
}))

import { createAdminClient } from '@/lib/supabase/server-admin'
import { NextRequest, NextResponse } from 'next/server'
import { RUN_DEFAULTS } from '@/lib/defaults/run-defaults'
import { generateEntries } from '@/lib/defaults/generate-entries'
import { ensureMinimumEntry, entriesSum, ENTRY_EXEMPT_FIELD_KEYS } from '@/lib/cost-fields'

// Force-regenerates entries for specific field_keys across all runs (or a single run).
// Used to push defaults changes into existing seeded data without a full reseed.
export async function POST(req: NextRequest) {
  const { runId, runCode, fieldKeys } = await req.json()
  if (!fieldKeys || !Array.isArray(fieldKeys) || fieldKeys.length === 0) {
    return NextResponse.json({ error: 'fieldKeys array required' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Build run list — either a single run or all runs
  let runList: { id: string; code: string }[] = []
  if (runId && runCode) {
    runList = [{ id: runId, code: runCode }]
  } else {
    const { data: runs } = await supabase.from('runs').select('id, code')
    runList = (runs ?? []).map(r => ({ id: r.id, code: r.code }))
  }

  let totalUpdated = 0
  const results: Record<string, number> = {}

  for (const run of runList) {
    const defaults = RUN_DEFAULTS[run.code] ?? null
    const { data: shows } = await supabase
      .from('shows')
      .select('id, show_order, venue_city, show_date')
      .eq('run_id', run.id)
      .order('show_order')

    const { data: fields } = await supabase
      .from('cost_fields')
      .select('id, field_key, label, state, value')
      .eq('run_id', run.id)
      .in('field_key', fieldKeys)

    if (!fields || !shows) continue

    let runUpdated = 0
    for (const field of fields) {
      const generated = generateEntries(field.field_key, field.state, defaults, shows)
      const entries = ENTRY_EXEMPT_FIELD_KEYS.has(field.field_key)
        ? generated
        : ensureMinimumEntry(generated, field.label, field.value)
      const patch: Record<string, unknown> = { entries }
      if (!ENTRY_EXEMPT_FIELD_KEYS.has(field.field_key)) {
        patch.value = entriesSum(entries)
      }
      await supabase.from('cost_fields').update(patch).eq('id', field.id)
      runUpdated++
    }

    results[run.code] = runUpdated
    totalUpdated += runUpdated
  }

  return NextResponse.json({ ok: true, totalUpdated, results })
}

import { createAdminClient } from '@/lib/supabase/server-admin'
import { NextRequest, NextResponse } from 'next/server'
import { RUN_DEFAULTS } from '@/lib/defaults/run-defaults'
import { generateEntries } from '@/lib/defaults/generate-entries'
import { ensureMinimumEntry, entriesSum, ENTRY_EXEMPT_FIELD_KEYS } from '@/lib/cost-fields'

export async function POST(req: NextRequest) {
  const { runId, runCode } = await req.json()
  if (!runId || !runCode) return NextResponse.json({ error: 'runId and runCode required' }, { status: 400 })

  const supabase = createAdminClient()

  const [{ data: fields }, { data: shows }] = await Promise.all([
    supabase.from('cost_fields').select('id, field_key, label, state, value, entries').eq('run_id', runId),
    supabase.from('shows').select('id, show_order, venue_city, show_date').eq('run_id', runId).order('show_order'),
  ])

  if (!fields || !shows) return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 })

  const defaults = RUN_DEFAULTS[runCode] ?? null
  const emptyFields = fields.filter(f =>
    !ENTRY_EXEMPT_FIELD_KEYS.has(f.field_key) &&
    (f.entries === null || (Array.isArray(f.entries) && f.entries.length === 0))
  )

  let updated = 0
  for (const field of emptyFields) {
    const generated = generateEntries(field.field_key, field.state, defaults, shows)
    const entries = ensureMinimumEntry(generated, field.label, field.value)
    await supabase.from('cost_fields').update({ entries, value: entriesSum(entries) }).eq('id', field.id)
    updated++
  }

  return NextResponse.json({ ok: true, updated })
}

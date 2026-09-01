import { createAdminClient } from '@/lib/supabase/server-admin'
import { NextRequest, NextResponse } from 'next/server'
import { RUN_DEFAULTS } from '@/lib/defaults/run-defaults'
import { generateEntries } from '@/lib/defaults/generate-entries'

export async function POST(req: NextRequest) {
  const { runId, runCode } = await req.json()
  if (!runId || !runCode) return NextResponse.json({ error: 'runId and runCode required' }, { status: 400 })

  const supabase = createAdminClient()

  const [{ data: fields }, { data: shows }] = await Promise.all([
    supabase.from('cost_fields').select('id, field_key, state, entries').eq('run_id', runId),
    supabase.from('shows').select('id, show_order, venue_city, show_date').eq('run_id', runId).order('show_order'),
  ])

  if (!fields || !shows) return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 })

  const defaults = RUN_DEFAULTS[runCode] ?? null
  const nullFields = fields.filter(f => f.entries === null)

  let updated = 0
  for (const field of nullFields) {
    const entries = generateEntries(field.field_key, field.state, defaults, shows)
    await supabase.from('cost_fields').update({ entries }).eq('id', field.id)
    updated++
  }

  return NextResponse.json({ ok: true, updated })
}

import { createAdminClient } from '@/lib/supabase/server-admin'
import { NextRequest, NextResponse } from 'next/server'
import { RUN_DEFAULTS } from '@/lib/defaults/run-defaults'
import { generateEntries, type FactorOverrides } from '@/lib/defaults/generate-entries'
import { loadPortalSettings } from '@/lib/portal-settings'
import {
  buildFactorFieldPatch,
  canRefreshCostingsFromFactors,
  FACTOR_COSTING_FIELD_MAP,
  shouldRefreshCostField,
} from '@/lib/factors-refresh'
import { filterVisibleFactors, isRetiredFactorKey } from '@/lib/retired-factors'

export async function GET() {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('run_factors')
    .select('*')
    .order('category')
    .order('label')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(filterVisibleFactors(data ?? []))
}

export async function PATCH(req: NextRequest) {
  const { key, value } = await req.json()
  if (!key || value === undefined) {
    return NextResponse.json({ error: 'key and value required' }, { status: 400 })
  }
  if (isRetiredFactorKey(key)) {
    return NextResponse.json({
      error: 'This Factors key is retired. Inside fees are edited on the run Revenue block (contract / Harbour Draft / owner add). Music Rights stays on Factors.',
    }, { status: 400 })
  }

  const parsed = value === '' || value === null ? null : parseFloat(value)
  if (parsed != null && Number.isNaN(parsed)) {
    return NextResponse.json({ error: 'value must be a number or empty' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const { data: updated, error } = await supabase
    .from('run_factors')
    .update({ value: parsed, updated_at: new Date().toISOString() })
    .eq('key', key)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const affectedFieldKeys = FACTOR_COSTING_FIELD_MAP[key]
  if (affectedFieldKeys?.length) {
    const { data: allFactors } = await supabase.from('run_factors').select('key, value')
    const factorMap: FactorOverrides = {}
    for (const f of allFactors ?? []) {
      if (f.key in FACTOR_COSTING_FIELD_MAP) {
        const n = parseFloat(f.value)
        if (Number.isFinite(n)) (factorMap as Record<string, number>)[f.key] = n
      }
    }

    const lightingHireDefault = (await loadPortalSettings(supabase)).lighting_hire_default
    const today = new Date().toISOString().slice(0, 10)
    const { data: runs } = await supabase.from('runs').select('id, code, status')
    for (const run of runs ?? []) {
      if (!canRefreshCostingsFromFactors(run)) continue
      const defaults = RUN_DEFAULTS[run.code] ?? null

      const { data: shows } = await supabase
        .from('shows')
        .select('id, show_order, venue_city, show_date, capacity, ticket_price, tickets_sold, sell_through_pct')
        .eq('run_id', run.id)
        .gte('show_date', today)
        .order('show_order')

      if (!shows?.length) continue

      const { data: fields } = await supabase
        .from('cost_fields')
        .select('id, field_key, state, show_id')
        .eq('run_id', run.id)
        .in('field_key', affectedFieldKeys)

      if (!fields?.length) continue

      const showsById = new Map(shows.map(s => [s.id, s]))
      const numShows = shows.length
      for (const field of fields) {
        if (!shouldRefreshCostField({
          fieldKey: field.field_key,
          state: field.state,
          runStatus: run.status,
        })) continue
        const show = field.show_id ? showsById.get(field.show_id) ?? null : null
        const derived = buildFactorFieldPatch({
          fieldKey: field.field_key,
          runCode: run.code,
          numShows,
          factors: factorMap,
          lightingHireDefault,
          show,
        })
        const newEntries = generateEntries(field.field_key, field.state, defaults, shows, factorMap)
        const patch: Record<string, unknown> = {}
        if (derived) {
          patch.value = derived.value
          if (derived.state) patch.state = derived.state
        }
        if (newEntries?.length) patch.entries = JSON.parse(JSON.stringify(newEntries))
        if (Object.keys(patch).length) {
          await supabase.from('cost_fields').update(patch).eq('id', field.id)
        }
      }
    }
  }

  return NextResponse.json(updated)
}

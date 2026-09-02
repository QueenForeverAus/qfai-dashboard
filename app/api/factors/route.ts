import { createAdminClient } from '@/lib/supabase/server-admin'
import { NextRequest, NextResponse } from 'next/server'
import { RUN_DEFAULTS } from '@/lib/defaults/run-defaults'
import { generateEntries, type FactorOverrides } from '@/lib/defaults/generate-entries'

// Factor keys → affected cost_field field_keys (estimated state only)
const FACTOR_FIELD_MAP: Record<string, string[]> = {
  accom_per_night:             ['accommodation'],
  per_diem_per_person_per_day: ['per_diems'],
  food_basics_per_show:        ['food_basics'],
  lighting_hire_per_run:       ['lighting_hire'],
  backline_hire_per_run:       ['backline_hire'],
  crew_travel_day_adam:        ['crew_travel_day'],
  crew_travel_day_michael:     ['crew_travel_day'],
}

function computeNewValue(
  fieldKey: string,
  runCode: string,
  numShows: number,
  factors: FactorOverrides,
): number | null {
  switch (fieldKey) {
    case 'accommodation': {
      const nights = RUN_DEFAULTS[runCode]?.accommodationNights ?? numShows
      return nights * (factors.accom_per_night ?? 1400)
    }
    case 'per_diems': {
      const days = RUN_DEFAULTS[runCode]?.perDiemDays ?? numShows
      return days * 2 * (factors.per_diem_per_person_per_day ?? 40)
    }
    case 'food_basics':
      return numShows * (factors.food_basics_per_show ?? 225)
    case 'lighting_hire':
      return factors.lighting_hire_per_run ?? 330
    case 'backline_hire':
      return factors.backline_hire_per_run ?? 3800
    case 'crew_travel_day': {
      const adam = factors.crew_travel_day_adam ?? 250
      const michael = factors.crew_travel_day_michael ?? 250
      return adam + michael
    }
    default:
      return null
  }
}

export async function GET() {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('run_factors')
    .select('*')
    .order('category')
    .order('label')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const { key, value } = await req.json()
  if (!key || value === undefined) {
    return NextResponse.json({ error: 'key and value required' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const { data: updated, error } = await supabase
    .from('run_factors')
    .update({ value: parseFloat(value), updated_at: new Date().toISOString() })
    .eq('key', key)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Cascade: re-derive affected estimated fields across all runs
  const affectedFieldKeys = FACTOR_FIELD_MAP[key]
  if (affectedFieldKeys?.length) {
    // Fetch all current factor values to pass as overrides
    const { data: allFactors } = await supabase.from('run_factors').select('key, value')
    const factorMap: FactorOverrides = {}
    for (const f of allFactors ?? []) {
      if (f.key in FACTOR_FIELD_MAP || ['accom_per_night','per_diem_per_person_per_day','food_basics_per_show','lighting_hire_per_run','backline_hire_per_run','crew_travel_day_adam','crew_travel_day_michael'].includes(f.key)) {
        (factorMap as Record<string, number>)[f.key] = parseFloat(f.value)
      }
    }

    const today = new Date().toISOString().slice(0, 10)
    const { data: runs } = await supabase.from('runs').select('id, code')
    for (const run of runs ?? []) {
      const defaults = RUN_DEFAULTS[run.code] ?? null

      // Only fetch upcoming shows — don't cascade to shows that have already happened
      const { data: shows } = await supabase
        .from('shows')
        .select('id, show_order, venue_city, show_date')
        .eq('run_id', run.id)
        .gte('show_date', today)
        .order('show_order')

      if (!shows?.length) continue

      const { data: fields } = await supabase
        .from('cost_fields')
        .select('id, field_key, state')
        .eq('run_id', run.id)
        .in('field_key', affectedFieldKeys)
        .in('state', ['estimated', 'guess'])

      if (!fields?.length) continue

      const numShows = shows.length
      for (const field of fields) {
        const newValue = computeNewValue(field.field_key, run.code, numShows, factorMap)
        const newEntries = generateEntries(field.field_key, field.state, defaults, shows, factorMap)
        const patch: Record<string, unknown> = {}
        if (newValue !== null) patch.value = newValue
        // Explicitly stringify entries so the JSONB column always receives a valid payload
        if (newEntries?.length) patch.entries = JSON.parse(JSON.stringify(newEntries))
        if (Object.keys(patch).length) {
          await supabase.from('cost_fields').update(patch).eq('id', field.id)
        }
      }
    }
  }

  return NextResponse.json(updated)
}

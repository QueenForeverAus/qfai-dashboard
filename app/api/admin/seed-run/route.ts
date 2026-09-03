import { createAdminClient } from '@/lib/supabase/server-admin'
import { NextRequest, NextResponse } from 'next/server'
import { RUN_DEFAULTS } from '@/lib/defaults/run-defaults'
import { seedRunDefaults } from '@/lib/defaults/seed-run'
import { classifyRunRegion, explainRunRegion } from '@/lib/region-classify'

/**
 * Creates shows (if missing) and seeds cost_fields for a run.
 * Safe to call on runs that already have shows — won't duplicate shows.
 * Skips cost_fields seeding if already present.
 *
 * New runs: create shows with state_territory (+ venue_city), then seed-run
 * (or POST /api/admin/classify-regions) sets runs.region from locked costings
 * G1/G2/G3 rules — never leave seed defaults as the source of truth.
 */
export async function POST(req: NextRequest) {
  const { runCode } = await req.json()
  if (!runCode) return NextResponse.json({ error: 'runCode required' }, { status: 400 })

  // Defaults may be null for HELD runs not yet in run-defaults.ts — seedRunDefaults handles that gracefully
  const supabase = createAdminClient()

  const { data: run } = await supabase.from('runs').select('id, code, region').eq('code', runCode).single()
  if (!run) return NextResponse.json({ error: `Run ${runCode} not found in DB` }, { status: 404 })

  // Check existing shows
  const { data: existingShows } = await supabase
    .from('shows')
    .select('id, show_order')
    .eq('run_id', run.id)

  let shows = existingShows ?? []

  // Create missing shows from defaults (only if we have run-specific defaults)
  const defaults = RUN_DEFAULTS[runCode]
  if (defaults) {
    for (const showDef of defaults.shows) {
      const exists = shows.find(s => s.show_order === showDef.showOrder)
      if (!exists) {
        const { data: newShow } = await supabase.from('shows').insert({
          run_id: run.id,
          show_order: showDef.showOrder,
          venue_name: showDef.venueName,
          venue_city: showDef.venueCity,
          state_territory: showDef.state,
          show_date: showDef.showDate,
          capacity: showDef.capacity,
          ticket_price: showDef.ticketPrice,
        }).select('id, show_order').single()
        if (newShow) shows = [...shows, newShow]
      }
    }
  }

  // Re-fetch full shows for seeding + region classify
  const { data: fullShows } = await supabase
    .from('shows')
    .select('id, show_order, venue_name, venue_city, state_territory, show_date')
    .eq('run_id', run.id)
    .order('show_order')

  const locationInputs = (fullShows ?? []).map(s => ({
    state_territory: s.state_territory,
    venue_city: s.venue_city,
  }))
  const { region: classifiedRegion, reason: regionReason } = explainRunRegion(locationInputs)
  if (classifiedRegion !== run.region) {
    await supabase.from('runs').update({ region: classifiedRegion }).eq('id', run.id)
  }

  // Check if cost_fields already exist
  const { count } = await supabase
    .from('cost_fields')
    .select('id', { count: 'exact', head: true })
    .eq('run_id', run.id)

  if ((count ?? 0) > 0) {
    return NextResponse.json({
      ok: true,
      message: `${runCode} already has cost_fields — skipped seeding. Shows created: OK`,
      showCount: fullShows?.length,
      region: classifiedRegion,
      region_reason: regionReason,
      region_updated: classifiedRegion !== run.region,
    })
  }

  await seedRunDefaults(supabase, run.id, run.code, fullShows as unknown as Parameters<typeof seedRunDefaults>[3])

  return NextResponse.json({
    ok: true,
    message: `${runCode} seeded`,
    showCount: fullShows?.length,
    region: classifiedRegion,
    region_reason: regionReason,
    region_updated: classifiedRegion !== run.region,
  })
}

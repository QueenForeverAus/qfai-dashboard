import type { SupabaseClient } from '@supabase/supabase-js'
import { RUN_DEFAULTS, LIGHTING_HIRE_PER_RUN, FOOD_PER_SHOW, CREW_FEE_PER_SHOW } from './run-defaults'
import { generateEntries } from './generate-entries'
import { ensureMinimumEntry, ENTRY_EXEMPT_FIELD_KEYS } from '@/lib/cost-fields'

type Show = { id: string; show_order: number; capacity: number | null; ticket_price: number | null; venue_name: string; venue_city: string; show_date: string | null }

import type { RunDefault } from './run-defaults'

function withEntries(
  row: Record<string, unknown>,
  fieldKey: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  defaults: any,
  shows: Show[],
) {
  const generated = generateEntries(fieldKey, String(row.state ?? ''), defaults as RunDefault | null, shows)
  if (ENTRY_EXEMPT_FIELD_KEYS.has(fieldKey)) {
    return { ...row, entries: generated }
  }
  const label = String(row.label ?? fieldKey)
  const value = row.value == null ? null : Number(row.value)
  return {
    ...row,
    entries: ensureMinimumEntry(generated, label, value),
  }
}

/** Attach a single default entry when seeding rows that skip generateEntries. */
function withDefaultEntry(row: Record<string, unknown>) {
  const fieldKey = String(row.field_key ?? '')
  if (ENTRY_EXEMPT_FIELD_KEYS.has(fieldKey)) {
    return { ...row, entries: row.entries ?? [] }
  }
  const label = String(row.label ?? fieldKey)
  const value = row.value == null ? null : Number(row.value)
  return {
    ...row,
    entries: ensureMinimumEntry(
      Array.isArray(row.entries) ? row.entries as Parameters<typeof ensureMinimumEntry>[0] : [],
      label,
      value,
    ),
  }
}

export async function seedRunDefaults(
  supabase: SupabaseClient,
  runId: string,
  runCode: string,
  shows: Show[],
) {
  const defaults = RUN_DEFAULTS[runCode]
  const numShows = shows.length
  const rows: object[] = []

  // Update shows with capacity + ticket price from defaults
  if (defaults) {
    for (const showDef of defaults.shows) {
      const show = shows.find(s => s.show_order === showDef.showOrder)
      if (!show) continue
      await supabase
        .from('shows')
        .update({
          venue_name: showDef.venueName,
          venue_city: showDef.venueCity,
          state_territory: showDef.state,
          show_date: showDef.showDate,
          capacity: showDef.capacity,
          ticket_price: showDef.ticketPrice,
        })
        .eq('id', show.id)
    }
  }

  // Fixed run-level fields (same for every run)
  const crewFeesTotal = numShows * CREW_FEE_PER_SHOW
  rows.push(withEntries({
    run_id: runId, show_id: null,
    category: 'Crew & Operations', field_key: 'crew_fees_total',
    label: 'Crew Fees (all shows)',
    value: crewFeesTotal, state: 'known',
    source: `Fixed rates × ${numShows} show${numShows > 1 ? 's' : ''}: Adam Dahl sound $600 + Michael Richardson lighting $600 + Michael PM $250 + Darryn McLaughlin bass $600 + Danny Oakhill keys $600 = $${CREW_FEE_PER_SHOW.toLocaleString()}/show.`,
  }, 'crew_fees_total', defaults, shows))
  rows.push(withEntries({
    run_id: runId, show_id: null,
    category: 'Production', field_key: 'food_basics',
    label: 'Food & Basics',
    value: numShows * FOOD_PER_SHOW, state: 'estimated',
    source: `~$${FOOD_PER_SHOW}/show × ${numShows} show${numShows > 1 ? 's' : ''} — estimated. Sometimes venue-supplied, sometimes externally ordered; quoted fresh each time. Update to KNOWN once confirmed.`,
  }, 'food_basics', defaults, shows))
  rows.push(withEntries({
    run_id: runId, show_id: null,
    category: 'Production', field_key: 'lighting_hire',
    label: 'Lighting Equipment Hire',
    value: LIGHTING_HIRE_PER_RUN, state: 'estimated',
    source: `$${LIGHTING_HIRE_PER_RUN} standard per run — almost always required. Confirm with Michael Richardson: if extra lights needed on top, or if usual lights unavailable, or OS travel (can't bring gear), rate will differ.`,
  }, 'lighting_hire', defaults, shows))
  rows.push({
    run_id: runId, show_id: null,
    category: 'Marketing', field_key: 'social_ads_var',
    label: 'Social Media Marketing Co. — $1/ticket',
    value: null, state: 'pending', entries: [],
    source: '$1.10 inc GST per paid ticket. Calculated at settlement.',
  })

  // Run-specific defaults
  if (defaults) {
    if (defaults.flights) {
      rows.push(withEntries({
        run_id: runId, show_id: null,
        category: 'Travel & Accommodation', field_key: 'flights',
        label: 'Flights (band + crew)',
        value: defaults.flights.value, state: defaults.flights.state,
        source: defaults.flights.source,
      }, 'flights', defaults, shows))
    }
    rows.push(withEntries({
      run_id: runId, show_id: null,
      category: 'Travel & Accommodation', field_key: 'accommodation',
      label: 'Accommodation',
      value: defaults.accommodation.value, state: defaults.accommodation.state,
      source: defaults.accommodation.source,
    }, 'accommodation', defaults, shows))
    rows.push(withEntries({
      run_id: runId, show_id: null,
      category: 'Travel & Accommodation', field_key: 'ground_transport',
      label: 'Ground Transport',
      value: defaults.groundTransport.value, state: defaults.groundTransport.state,
      source: defaults.groundTransport.source,
    }, 'ground_transport', defaults, shows))
    if (defaults.bradDriverFee) {
      rows.push(withEntries({
        run_id: runId, show_id: null,
        category: 'Travel & Accommodation', field_key: 'brad_driver_fee',
        label: 'Brad Driver Fee',
        value: defaults.bradDriverFee.value, state: defaults.bradDriverFee.state,
        source: defaults.bradDriverFee.source,
      }, 'brad_driver_fee', defaults, shows))
    }
    if (defaults.crewTravelDay) {
      rows.push(withEntries({
        run_id: runId, show_id: null,
        category: 'Crew & Operations', field_key: 'crew_travel_day',
        label: 'Crew Travel-Day Fee',
        value: defaults.crewTravelDay.value, state: defaults.crewTravelDay.state,
        source: defaults.crewTravelDay.source,
      }, 'crew_travel_day', defaults, shows))
    }
    rows.push(withEntries({
      run_id: runId, show_id: null,
      category: 'Crew & Operations', field_key: 'per_diems',
      label: 'Per Diems',
      value: defaults.perDiems.value, state: defaults.perDiems.state,
      source: defaults.perDiems.source,
    }, 'per_diems', defaults, shows))
    rows.push(withEntries({
      run_id: runId, show_id: null,
      category: 'Marketing', field_key: 'fb_ads',
      label: 'Facebook / Social Ads',
      value: defaults.fbAds.value, state: defaults.fbAds.state,
      source: defaults.fbAds.source,
    }, 'fb_ads', defaults, shows))
    // Always seed backline_hire — UI always lists it (Production). Group 3 has defaults;
    // Group 1/2 get a $0 estimate placeholder so the line is never missing.
    if (defaults.backlineHire) {
      rows.push(withEntries({
        run_id: runId, show_id: null,
        category: 'Production', field_key: 'backline_hire',
        label: 'Backline Hire (local)',
        value: defaults.backlineHire.value, state: defaults.backlineHire.state,
        source: defaults.backlineHire.source,
      }, 'backline_hire', defaults, shows))
    } else {
      rows.push(withDefaultEntry({
        run_id: runId, show_id: null,
        category: 'Production', field_key: 'backline_hire',
        label: 'Backline Hire (local)',
        value: 0, state: 'estimated',
        source: 'Not required for this run region by default — set amount if local backline hire is needed.',
      }))
    }

    // Show-level fields
    for (const showDef of defaults.shows) {
      const show = shows.find(s => s.show_order === showDef.showOrder)
      if (!show) continue

      rows.push(withDefaultEntry({
        run_id: runId, show_id: show.id,
        category: 'Revenue', field_key: 'gross_box_office',
        label: 'Gross Box Office',
        value: null, state: 'pending',
        source: `Cap ${showDef.capacity.toLocaleString()} × $${showDef.ticketPrice} nett — pending ticket sales. Use sell-through slider in Overview.`,
      }))
      rows.push(withDefaultEntry({
        run_id: runId, show_id: show.id,
        category: 'Venue Costs', field_key: 'venue_hire',
        label: 'Venue Hire',
        value: showDef.venueHire.value, state: showDef.venueHire.state,
        source: showDef.venueHire.source,
      }))
      rows.push(withDefaultEntry({
        run_id: runId, show_id: show.id,
        category: 'Venue Costs', field_key: 'venue_staff',
        label: 'Venue Staff / On-costs',
        value: showDef.venueStaff.value, state: showDef.venueStaff.state,
        source: showDef.venueStaff.source,
        line_items: showDef.venueStaffItems ?? [],
      }))
      rows.push(withDefaultEntry({
        run_id: runId, show_id: show.id,
        category: 'Venue Costs', field_key: 'production_costs',
        label: 'Production / AV',
        value: null, state: 'pending',
        source: 'Additional production/AV costs not included in venue staff on-costs. Confirm with Michael Richardson.',
      }))
    }
  } else {
    // No specific defaults for this run — seed generic blanks
    for (const show of shows) {
      rows.push(
        withDefaultEntry({ run_id: runId, show_id: show.id, category: 'Revenue', field_key: 'gross_box_office', label: 'Gross Box Office', value: null, state: 'pending', source: null }),
        withDefaultEntry({ run_id: runId, show_id: show.id, category: 'Venue Costs', field_key: 'venue_hire', label: 'Venue Hire', value: null, state: 'guess', source: null }),
        withDefaultEntry({ run_id: runId, show_id: show.id, category: 'Venue Costs', field_key: 'venue_staff', label: 'Venue Staff / On-costs', value: null, state: 'guess', source: null, line_items: [] }),
        withDefaultEntry({ run_id: runId, show_id: show.id, category: 'Venue Costs', field_key: 'production_costs', label: 'Production / AV', value: null, state: 'pending', source: null }),
      )
    }
    rows.push(
      withDefaultEntry({ run_id: runId, show_id: null, category: 'Travel & Accommodation', field_key: 'flights', label: 'Flights (band + crew)', value: null, state: 'guess', source: null }),
      withDefaultEntry({ run_id: runId, show_id: null, category: 'Travel & Accommodation', field_key: 'accommodation', label: 'Accommodation', value: null, state: 'guess', source: null }),
      withDefaultEntry({ run_id: runId, show_id: null, category: 'Travel & Accommodation', field_key: 'ground_transport', label: 'Ground Transport', value: null, state: 'guess', source: null }),
      withDefaultEntry({ run_id: runId, show_id: null, category: 'Crew & Operations', field_key: 'per_diems', label: 'Per Diems', value: null, state: 'guess', source: null }),
      withDefaultEntry({ run_id: runId, show_id: null, category: 'Marketing', field_key: 'fb_ads', label: 'Facebook / Social Ads', value: null, state: 'guess', source: null }),
      withDefaultEntry({ run_id: runId, show_id: null, category: 'Production', field_key: 'backline_hire', label: 'Backline Hire (local)', value: 0, state: 'estimated', source: null }),
    )
  }

  if (rows.length > 0) {
    await supabase.from('cost_fields').insert(rows)
  }
}

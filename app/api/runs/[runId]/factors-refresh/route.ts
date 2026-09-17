import { createAdminClient } from '@/lib/supabase/server-admin'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { RUN_DEFAULTS } from '@/lib/defaults/run-defaults'
import { generateEntries, type FactorOverrides } from '@/lib/defaults/generate-entries'
import { loadPortalSettings } from '@/lib/portal-settings'
import {
  buildFactorFieldPatch,
  canRefreshCostingsFromFactors,
  FACTOR_COSTING_FIELD_MAP,
  factorsRefreshBlockedReason,
  shouldRefreshCostField,
} from '@/lib/factors-refresh'
import { isAdminOrOwner } from '@/lib/role-access'
import {
  mergeFactorRefreshEntries,
  tombstonedSeedKeysForField,
  type CostLineTombstone,
} from '@/lib/cost-line-tombstones'
import {
  INSIDE_FEES_FIELD_KEY,
  seedStandardInsideEntries,
} from '@/lib/inside-fee-lines'
import { entriesSum, normalizeEntries } from '@/lib/cost-fields'
import { insideFactorsFromRows } from '@/lib/pnl-run-costing'

const ALL_REFRESH_KEYS = [...new Set(Object.values(FACTOR_COSTING_FIELD_MAP).flat())]

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params
  const userClient = await createClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const supabase = createAdminClient()
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!isAdminOrOwner(profile?.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: run } = await supabase
    .from('runs')
    .select('id, code, status')
    .eq('id', runId)
    .maybeSingle()
  if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 })

  const blocked = factorsRefreshBlockedReason(run)
  if (blocked || !canRefreshCostingsFromFactors(run)) {
    return NextResponse.json({ error: blocked, refreshed: 0 }, { status: 409 })
  }

  const { data: allFactors } = await supabase.from('run_factors').select('key, value, category')
  const factorMap: FactorOverrides = {}
  for (const f of allFactors ?? []) {
    if (f.key in FACTOR_COSTING_FIELD_MAP) {
      const n = parseFloat(f.value)
      if (Number.isFinite(n)) (factorMap as Record<string, number>)[f.key] = n
    }
  }
  const insideFactors = insideFactorsFromRows(allFactors ?? [])

  const lightingHireDefault = (await loadPortalSettings(supabase)).lighting_hire_default
  const defaults = RUN_DEFAULTS[run.code] ?? null
  const { data: shows } = await supabase
    .from('shows')
    .select('id, show_order, venue_city, show_date, capacity, ticket_price, tickets_sold, sell_through_pct, booking_fee_per_payer, cc_fee_pct')
    .eq('run_id', run.id)
    .order('show_order')
  const { data: fields } = await supabase
    .from('cost_fields')
    .select('id, field_key, state, show_id, entries, value')
    .eq('run_id', run.id)
    .in('field_key', ALL_REFRESH_KEYS)
  const { data: tombstoneRows } = await supabase
    .from('cost_line_tombstones')
    .select('show_id, field_key, seed_key')
    .eq('run_id', run.id)
    .eq('sheet', 'costings')

  const tombstones = (tombstoneRows ?? []) as CostLineTombstone[]
  const showsById = new Map((shows ?? []).map(s => [s.id, s]))

  let refreshed = 0
  for (const field of fields ?? []) {
    if (!shouldRefreshCostField({
      fieldKey: field.field_key,
      state: field.state,
      runStatus: run.status,
    })) continue
    const show = field.show_id ? showsById.get(field.show_id) ?? null : null
    const derived = buildFactorFieldPatch({
      fieldKey: field.field_key,
      runCode: run.code,
      numShows: (shows ?? []).length,
      factors: factorMap,
      lightingHireDefault,
      show,
    })
    const existingEntries = normalizeEntries(field.entries) ?? []
    const generated = field.field_key === INSIDE_FEES_FIELD_KEY && show
      ? seedStandardInsideEntries({
          factors: insideFactors,
          venueOverride: {
            bookingFeePerPayer: show.booking_fee_per_payer == null ? null : Number(show.booking_fee_per_payer),
            ccFeePct: show.cc_fee_pct == null ? null : Number(show.cc_fee_pct),
          },
          payerCount: Math.round((Number(show.capacity) || 0) * ((Number(show.sell_through_pct) || 75) / 100)),
          grossTicketSales: Math.round(
            (Number(show.capacity) || 0)
            * ((Number(show.sell_through_pct) || 75) / 100)
            * (Number(show.ticket_price) || 0),
          ),
          tombstonedSeedKeys: tombstonedSeedKeysForField(tombstones, field.field_key, field.show_id),
        })
      : generateEntries(field.field_key, field.state, defaults, shows ?? [], factorMap)

    const merged = mergeFactorRefreshEntries({
      fieldKey: field.field_key,
      existing: existingEntries,
      generated,
      tombstones,
      showId: field.show_id ?? null,
    })

    const patch: Record<string, unknown> = {}
    if (derived) {
      patch.value = derived.value
      if (derived.state) patch.state = derived.state
    }
    if (merged.length || existingEntries.length) {
      patch.entries = JSON.parse(JSON.stringify(merged))
      if (field.field_key === INSIDE_FEES_FIELD_KEY || !derived) {
        patch.value = entriesSum(merged)
      }
    }
    if (Object.keys(patch).length) {
      await supabase.from('cost_fields').update(patch).eq('id', field.id)
      refreshed++
    }
  }

  return NextResponse.json({ ok: true, refreshed })
}

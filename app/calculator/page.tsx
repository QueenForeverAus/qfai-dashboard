import { createAdminClient } from '@/lib/supabase/server-admin'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import CalculatorClient, { type CalcRun, type Factors } from './CalculatorClient'

export const dynamic = 'force-dynamic'

export default async function CalculatorPage() {
  const userClient = await createClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) redirect('/login')

  const supabase = createAdminClient()

  const [
    { data: runsRaw },
    { data: runCostsRaw },
    { data: showCostsRaw },
    { data: factorsRaw },
  ] = await Promise.all([
    supabase
      .from('runs')
      .select('id, code, name, status, region, shows(id, venue_name, show_date, capacity, ticket_price, show_order)')
      .order('start_date', { ascending: true }),

    // Run-level costs — exclude social_ads_var (computed dynamically) and revenue fields
    supabase
      .from('cost_fields')
      .select('run_id, value')
      .is('show_id', null)
      .not('field_key', 'in', '("social_ads_var","gross_box_office")'),

    // Show-level costs: venue hire and on-costs only
    supabase
      .from('cost_fields')
      .select('show_id, field_key, value')
      .not('show_id', 'is', null)
      .in('field_key', ['venue_hire', 'venue_staff']),

    supabase
      .from('run_factors')
      .select('key, value')
      .in('key', ['harbour_agency_pct', 'daniel_champagne_per_ticket', 'apra_pct', 'cc_fee_pct']),
  ])

  // Assemble factors (DB stores percentages as whole numbers, e.g. 10 = 10%)
  const factorMap = Object.fromEntries((factorsRaw ?? []).map(f => [f.key, Number(f.value)]))
  const factors: Factors = {
    harbourPct: (factorMap.harbour_agency_pct ?? 10) / 100,
    danielPerTicket: factorMap.daniel_champagne_per_ticket ?? 1.10,
    apraPct: (factorMap.apra_pct ?? 2) / 100,
    ccPct: (factorMap.cc_fee_pct ?? 1) / 100,
  }

  // Sum run-level fixed costs per run_id
  const runCostTotals: Record<string, number> = {}
  for (const cf of runCostsRaw ?? []) {
    runCostTotals[cf.run_id] = (runCostTotals[cf.run_id] ?? 0) + (Number(cf.value) || 0)
  }

  // Map show-level costs (venue_hire, venue_staff) keyed by show_id
  const showCostMap: Record<string, { venueHire: number; onCosts: number }> = {}
  for (const cf of showCostsRaw ?? []) {
    if (!showCostMap[cf.show_id]) showCostMap[cf.show_id] = { venueHire: 0, onCosts: 0 }
    if (cf.field_key === 'venue_hire') showCostMap[cf.show_id].venueHire = Number(cf.value) || 0
    if (cf.field_key === 'venue_staff') showCostMap[cf.show_id].onCosts = Number(cf.value) || 0
  }

  // Assemble CalcRun[]
  type RawShow = { id: string; venue_name: string; show_date: string; capacity: number; ticket_price: number; show_order: number }
  const runs: CalcRun[] = (runsRaw ?? [])
    .filter(r => Array.isArray(r.shows) && r.shows.length > 0)
    .map(r => ({
      id: r.id,
      code: r.code,
      name: r.name,
      status: r.status,
      region: r.region ?? 'Group 1',
      fixedTotal: runCostTotals[r.id] ?? 0,
      warnings: [],
      shows: (r.shows as RawShow[])
        .sort((a, b) => a.show_order - b.show_order)
        .map(show => ({
          id: show.id,
          venue: show.venue_name,
          date: show.show_date,
          capacity: show.capacity,
          nettPrice: show.ticket_price,
          venueHire: showCostMap[show.id]?.venueHire ?? 0,
          onCosts: showCostMap[show.id]?.onCosts ?? 0,
        })),
    }))

  return (
    <div className="p-6">
      <CalculatorClient runs={runs} factors={factors} />
    </div>
  )
}

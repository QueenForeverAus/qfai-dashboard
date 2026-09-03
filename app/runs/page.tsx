import { createAdminClient } from '@/lib/supabase/server-admin'
import { todayAU } from '@/lib/dates'
import { computeCompletionPct } from '@/lib/completion'
import RunsPageClient, { type Run } from './RunsPageClient'

export const dynamic = 'force-dynamic'

export default async function RunsPage() {
  const supabase = createAdminClient()
  const [{ data: runs }, { data: costFields }] = await Promise.all([
    supabase.from('runs').select('*, shows(id)').order('start_date', { ascending: true }),
    supabase.from('cost_fields').select('run_id, state'),
  ])

  const allRuns = (runs ?? []) as Run[]
  const today = todayAU()

  const upcomingRuns     = allRuns.filter(r => !r.end_date || r.end_date >= today)
  const confirmedCount   = upcomingRuns.filter(r => r.status === 'confirmed').length
  const proposedCount    = upcomingRuns.filter(r => r.status === 'proposed').length
  const placeholderCount = upcomingRuns.filter(r => r.status === 'placeholder').length

  function showCount(runs: Run[]) { return runs.reduce((n, r) => n + (r.shows?.length ?? 0), 0) }
  const showStats = {
    confirmed:   showCount(upcomingRuns.filter(r => r.status === 'confirmed')),
    proposed:    showCount(upcomingRuns.filter(r => r.status === 'proposed')),
    placeholder: showCount(upcomingRuns.filter(r => r.status === 'placeholder')),
    total:       showCount(allRuns),
  }

  const fieldsByRun = new Map<string, { state: string }[]>()
  for (const f of costFields ?? []) {
    if (!fieldsByRun.has(f.run_id)) fieldsByRun.set(f.run_id, [])
    fieldsByRun.get(f.run_id)!.push(f)
  }

  const completionByRun: Record<string, number> = {}
  for (const run of allRuns) {
    completionByRun[run.id] = computeCompletionPct(fieldsByRun.get(run.id) ?? [])
  }

  return (
    <RunsPageClient
      allRuns={allRuns}
      today={today}
      completionByRun={completionByRun}
      confirmedCount={confirmedCount}
      proposedCount={proposedCount}
      placeholderCount={placeholderCount}
      showStats={showStats}
    />
  )
}

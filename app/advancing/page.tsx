import { createAdminClient } from '@/lib/supabase/server-admin'
import { RUN_LIST_SHOW_SELECT } from '@/lib/run-list-cancelled'
import RunsPageClient, { type Run } from '../runs/RunsPageClient'
import { buildRunsListPageModel } from '../runs/runs-list-data'
import { filterAdvancingShowsList } from '@/lib/tour-desk-nav'

export const dynamic = 'force-dynamic'

export default async function AdvancingShowsPage() {
  const supabase = createAdminClient()
  const [{ data: runs }, { data: costFields }, { data: workspaces }] = await Promise.all([
    supabase.from('runs').select(`*, shows(${RUN_LIST_SHOW_SELECT})`).order('start_date', { ascending: true }),
    supabase.from('cost_fields').select('run_id, state'),
    supabase.from('run_advancing_workspaces').select('run_id, archived_at').is('archived_at', null),
  ])

  const activeWorkspaceByRunId = new Map(
    (workspaces ?? []).map(row => [row.run_id as string, { archived_at: row.archived_at as string | null }]),
  )
  const advancingRuns = filterAdvancingShowsList(
    (runs ?? []) as Run[],
    run => activeWorkspaceByRunId.get(run.id) ?? null,
  )
  const model = buildRunsListPageModel(advancingRuns, costFields)

  return (
    <RunsPageClient
      desk="advancing"
      allRuns={model.allRuns}
      today={model.today}
      completionByRun={model.completionByRun}
      confirmedCount={model.confirmedCount}
      proposedCount={model.proposedCount}
      placeholderCount={model.placeholderCount}
      showStats={model.showStats}
      activeAdvancingRunIds={[...activeWorkspaceByRunId.keys()]}
    />
  )
}

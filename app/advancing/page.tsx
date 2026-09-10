import { createAdminClient } from '@/lib/supabase/server-admin'
import { RUN_LIST_SHOW_SELECT } from '@/lib/run-list-cancelled'
import RunsPageClient, { type Run } from '../runs/RunsPageClient'
import { buildRunsListPageModel } from '../runs/runs-list-data'
import { filterAdvancingShowsList } from '@/lib/tour-desk-nav'
import type { TourRow } from '@/lib/tours'
import { advancingSlaFromSettings, loadPortalSettings } from '@/lib/portal-settings'

export const dynamic = 'force-dynamic'

export default async function AdvancingShowsPage() {
  const supabase = createAdminClient()
  const [{ data: runs }, { data: costFields }, { data: workspaces }, toursResult, portalSettings] = await Promise.all([
    supabase.from('runs').select(`*, shows(${RUN_LIST_SHOW_SELECT})`).order('start_date', { ascending: true }),
    supabase.from('cost_fields').select('run_id, state'),
    supabase.from('run_advancing_workspaces').select('run_id, archived_at').is('archived_at', null),
    supabase.from('tours').select('id, name, date_from, date_to, sort_order, created_at, updated_at')
      .order('sort_order', { ascending: true })
      .order('date_from', { ascending: true })
      .order('name', { ascending: true }),
    loadPortalSettings(supabase),
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
      tours={toursResult.error ? [] : (toursResult.data ?? []) as TourRow[]}
      advancingSla={advancingSlaFromSettings(portalSettings)}
    />
  )
}

import { createAdminClient } from '@/lib/supabase/server-admin'
import { RUN_LIST_SHOW_SELECT } from '@/lib/run-list-cancelled'
import RunsPageClient, { type Run } from './RunsPageClient'
import { buildRunsListPageModel } from './runs-list-data'
import type { TourRow } from '@/lib/tours'

export const dynamic = 'force-dynamic'

export default async function RunsPage() {
  const supabase = createAdminClient()
  const [{ data: runs }, { data: costFields }, toursResult] = await Promise.all([
    supabase.from('runs').select(`*, shows(${RUN_LIST_SHOW_SELECT})`).order('start_date', { ascending: true }),
    supabase.from('cost_fields').select('run_id, state'),
    supabase.from('tours').select('id, name, date_from, date_to, sort_order, created_at, updated_at')
      .order('sort_order', { ascending: true })
      .order('date_from', { ascending: true })
      .order('name', { ascending: true }),
  ])

  const model = buildRunsListPageModel((runs ?? []) as Run[], costFields)

  return (
    <RunsPageClient
      allRuns={model.allRuns}
      today={model.today}
      completionByRun={model.completionByRun}
      confirmedCount={model.confirmedCount}
      proposedCount={model.proposedCount}
      placeholderCount={model.placeholderCount}
      showStats={model.showStats}
      tours={toursResult.error ? [] : (toursResult.data ?? []) as TourRow[]}
    />
  )
}

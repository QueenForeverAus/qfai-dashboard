import { todayAU } from '@/lib/dates'
import { computeCompletionPct } from '@/lib/completion'
import type { Run } from './RunsPageClient'

export type RunsListShowStats = {
  confirmed: number
  proposed: number
  placeholder: number
  total: number
}

export type RunsListPageModel = {
  allRuns: Run[]
  today: string
  completionByRun: Record<string, number>
  confirmedCount: number
  proposedCount: number
  placeholderCount: number
  showStats: RunsListShowStats
}

export function buildRunsListPageModel(
  allRuns: Run[],
  costFields: Array<{ run_id: string; state: string }> | null | undefined,
): RunsListPageModel {
  const today = todayAU()
  const upcomingRuns = allRuns.filter(r => !r.end_date || r.end_date >= today)
  const confirmedCount = upcomingRuns.filter(r => r.status === 'confirmed').length
  const proposedCount = upcomingRuns.filter(r => r.status === 'proposed').length
  const placeholderCount = upcomingRuns.filter(r => r.status === 'placeholder').length

  function showCount(runs: Run[]) {
    return runs.reduce((n, r) => n + (r.shows?.length ?? 0), 0)
  }
  const showStats: RunsListShowStats = {
    confirmed: showCount(upcomingRuns.filter(r => r.status === 'confirmed')),
    proposed: showCount(upcomingRuns.filter(r => r.status === 'proposed')),
    placeholder: showCount(upcomingRuns.filter(r => r.status === 'placeholder')),
    total: showCount(allRuns),
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

  return {
    allRuns,
    today,
    completionByRun,
    confirmedCount,
    proposedCount,
    placeholderCount,
    showStats,
  }
}

/**
 * Tour Desk Phase 1 — nav IA only.
 * Tour Desk is a menu heading (not a destination). Children wire to existing routes.
 *
 * Advancing Shows list membership is HARD-locked (Tour Desk v2):
 * BOOKED (`runs.status = confirmed`) and/or an active Run Advancing workspace.
 * Proposed/held without a workspace stay on Run Costings.
 */

import { isBookedBookingStatus } from './booked-cost-freeze.ts'
import { isAdvancingWorkspaceActive } from './run-advancing.ts'

export const TOUR_DESK_NAV_HEADING = 'Tour Desk'

export const RUN_COSTINGS_NAV_LABEL = 'Run Costings'
export const ADVANCING_SHOWS_NAV_LABEL = 'Advancing Shows'
export const SETTLEMENTS_NAV_LABEL = 'Settlements'

export const RUN_COSTINGS_HREF = '/runs'
export const ADVANCING_SHOWS_HREF = '/advancing'
export const SETTLEMENTS_HREF = '/settlements'

export const TOUR_DESK_NAV_CHILDREN = [
  { href: RUN_COSTINGS_HREF, label: RUN_COSTINGS_NAV_LABEL },
  { href: ADVANCING_SHOWS_HREF, label: ADVANCING_SHOWS_NAV_LABEL },
  { href: SETTLEMENTS_HREF, label: SETTLEMENTS_NAV_LABEL },
] as const

export const RUN_DETAIL_TABS = ['costs', 'outlook', 'audit', 'run_advancing', 'advancement', 'show_pack'] as const
export type RunDetailTab = (typeof RUN_DETAIL_TABS)[number]

/** Tabs that belong under Run Costings. */
export const COSTING_DESK_TABS: readonly RunDetailTab[] = ['costs', 'outlook', 'audit']

/** Tabs that belong under Advancing Shows (Run Advancing + checklist + Worksheet). */
export const ADVANCING_DESK_TABS: readonly RunDetailTab[] = ['run_advancing', 'advancement', 'show_pack']

export function parseRunDetailTab(value: string | null | undefined): RunDetailTab | null {
  if (!value) return null
  return (RUN_DETAIL_TABS as readonly string[]).includes(value) ? (value as RunDetailTab) : null
}

export function isAdvancingDeskTab(tab: string | null | undefined): boolean {
  return tab === 'run_advancing' || tab === 'advancement' || tab === 'show_pack'
}

export function isCostingDeskTab(tab: string | null | undefined): boolean {
  return tab === 'costs' || tab === 'outlook' || tab === 'audit' || tab == null || tab === ''
}

export function runDetailHref(runCode: string, tab?: RunDetailTab | null): string {
  const base = `/runs/${runCode.toLowerCase()}`
  if (!tab || tab === 'costs') return base
  return `${base}?tab=${tab}`
}

export function runDetailTabUrl(pathname: string, currentSearch: string, tab: RunDetailTab): string {
  const params = new URLSearchParams(currentSearch.startsWith('?') ? currentSearch.slice(1) : currentSearch)
  if (tab === 'costs') params.delete('tab')
  else params.set('tab', tab)
  const qs = params.toString()
  return qs ? `${pathname}?${qs}` : pathname
}

/**
 * Advancing Shows index / submenu list rule (Tour Desk v2 HARD lock).
 *
 * Include a run when:
 *   - it is BOOKED (`runs.status = confirmed`), OR
 *   - it has an active (non-archived) `run_advancing_workspaces` row
 *
 * Exclude proposed/held with no workspace, and UNBOOKED runs whose
 * workspace was soft-archived. Deep links to `?tab=run_advancing` on a
 * proposed run may still render the empty-state banner — the list must
 * not advertise those runs.
 */
export function isAdvancingShowsListRun(opts: {
  status?: string | null
  workspace?: { archived_at?: string | null } | null
}): boolean {
  return isBookedBookingStatus(opts.status) || isAdvancingWorkspaceActive(opts.workspace)
}

export function filterAdvancingShowsList<T extends { status?: string | null }>(
  runs: T[],
  workspaceFor: (run: T) => { archived_at?: string | null } | null | undefined,
): T[] {
  return runs.filter(run => isAdvancingShowsListRun({
    status: run.status,
    workspace: workspaceFor(run),
  }))
}

export function isTourDeskChildActive(opts: {
  href: string
  pathname: string
  tab?: string | null
}): boolean {
  const { href, pathname, tab } = opts
  if (href === SETTLEMENTS_HREF) {
    return pathname === SETTLEMENTS_HREF || pathname.startsWith(`${SETTLEMENTS_HREF}/`)
  }
  if (href === ADVANCING_SHOWS_HREF) {
    if (pathname === ADVANCING_SHOWS_HREF || pathname.startsWith(`${ADVANCING_SHOWS_HREF}/`)) return true
    return pathname.startsWith(`${RUN_COSTINGS_HREF}/`) && isAdvancingDeskTab(tab)
  }
  if (href === RUN_COSTINGS_HREF) {
    if (pathname === ADVANCING_SHOWS_HREF || pathname.startsWith(`${ADVANCING_SHOWS_HREF}/`)) return false
    if (pathname === RUN_COSTINGS_HREF || pathname.startsWith(`${RUN_COSTINGS_HREF}/`)) {
      return !isAdvancingDeskTab(tab)
    }
    return false
  }
  return false
}

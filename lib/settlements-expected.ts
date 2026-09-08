/**
 * Settlements Phase 4 — Col2 Expected bind (pure).
 *
 * Active Run Advancing workspace → advancing_cost_fields + shows chrome.
 * No workspace → frozen cost_fields fallback (BOOKED-but-copy-failed).
 * Never invents figures. Never writes cost_fields.
 */

import type { CostingSnapshotField } from './settlements.ts'
import {
  isAdvancingWorkspaceActive,
  mergeShowsWithAdvancingChrome,
  type AdvancingShowChrome,
  type ShowChromeSource,
} from './run-advancing.ts'
import type { SettlementExpectedSource } from './settlements-sheet.ts'

/** Settlements Col2 is a live read. It never writes locked Run Costings. */
export const SETTLEMENTS_COL2_WRITES_COST_FIELDS = false as const

export function asSnapshotFields(rows: Array<Record<string, unknown>>): CostingSnapshotField[] {
  return rows.map(f => ({
    id: String(f.id),
    run_id: String(f.run_id),
    show_id: (f.show_id as string | null) ?? null,
    category: String(f.category ?? ''),
    field_key: String(f.field_key ?? ''),
    label: String(f.label ?? ''),
    value: f.value == null ? null : Number(f.value),
    state: String(f.state ?? 'guess'),
    source: (f.source as string | null) ?? null,
    entries: Array.isArray(f.entries) ? f.entries : [],
    line_items: Array.isArray(f.line_items) ? f.line_items : [],
  }))
}

/**
 * Col2 Expected bind.
 *
 * Active Run Advancing workspace → advancing_cost_fields (even if empty).
 * No active workspace (not BOOKED, archived, or BOOKED-but-copy-failed)
 * → frozen cost_fields. Never invents figures.
 *
 * Does not mutate costingFields. Settlements never writes cost_fields.
 */
export function resolveSettlementExpectedLive(opts: {
  advancingWorkspace: { archived_at?: string | null } | null | undefined
  advancingFields?: Array<Record<string, unknown>> | null
  costingFields: Array<Record<string, unknown>>
}): {
  source: SettlementExpectedSource
  fields: CostingSnapshotField[]
} {
  if (isAdvancingWorkspaceActive(opts.advancingWorkspace)) {
    return {
      source: 'advancing',
      fields: asSnapshotFields(opts.advancingFields ?? []),
    }
  }
  return {
    source: 'costing_fallback',
    fields: asSnapshotFields(opts.costingFields),
  }
}

export function parseAdvancingShowsChrome(raw: unknown): AdvancingShowChrome[] {
  return Array.isArray(raw) ? raw as AdvancingShowChrome[] : []
}

/** Overlay Advancing P&L chrome onto shows only when Col2 is Advancing-sourced. */
export function applySettlementExpectedShows<T extends ShowChromeSource>(opts: {
  shows: T[]
  chrome: AdvancingShowChrome[] | unknown
  source: SettlementExpectedSource
}): T[] {
  if (opts.source !== 'advancing') return opts.shows
  return mergeShowsWithAdvancingChrome(opts.shows, parseAdvancingShowsChrome(opts.chrome))
}

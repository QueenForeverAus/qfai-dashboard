/**
 * Run-level cost_fields duplicate keeper.
 *
 * show_id NULL bypasses unique(run_id, show_id, field_key), so the same
 * field can be inserted twice. This chooses one row and drops the rest.
 * It does not merge values, entries, or notes from the dropped row.
 *
 * Rank (first difference wins):
 *   1. non-zero money — value, or any entries[].amount, or any
 *      line_items role total (rate × hours × headcount)
 *   2. has line items — entries or line_items array is non-empty
 *   3. human edit — updated_by is set
 *   4. else the oldest created_at, then the lowest id
 *
 * Not an auto-applied migration. See scripts/dedupe-run-level-cost-fields.sql.
 */

export type RunLevelDedupeRow = {
  id: string
  run_id: string
  field_key: string
  created_at: string
  updated_by?: string | null
  value?: number | null
  entries?: unknown
  line_items?: unknown
}

function money(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : Number(raw)
  return Number.isFinite(n) ? n : 0
}

export function dedupeRowHasNonZeroMoney(row: RunLevelDedupeRow): boolean {
  if (Math.abs(money(row.value)) > 0.004) return true
  if (Array.isArray(row.entries)) {
    for (const entry of row.entries) {
      if (entry && typeof entry === 'object' && Math.abs(money((entry as { amount?: unknown }).amount)) > 0.004) {
        return true
      }
    }
  }
  if (Array.isArray(row.line_items)) {
    for (const item of row.line_items) {
      if (!item || typeof item !== 'object') continue
      const role = item as { rate?: unknown; hours?: unknown; headcount?: unknown }
      const total = money(role.rate) * money(role.hours) * money(role.headcount)
      if (Math.abs(total) > 0.004) return true
    }
  }
  return false
}

export function dedupeRowHasLineItems(row: RunLevelDedupeRow): boolean {
  return (Array.isArray(row.entries) && row.entries.length > 0)
    || (Array.isArray(row.line_items) && row.line_items.length > 0)
}

export function dedupeRowHasHumanEdit(row: RunLevelDedupeRow): boolean {
  return Boolean(row.updated_by)
}

export function chooseRunLevelKeeper<T extends RunLevelDedupeRow>(rows: T[]): { keep: T; drop: T[] } {
  if (!rows.length) throw new Error('chooseRunLevelKeeper requires at least one row')
  const ranked = [...rows].sort((a, b) => {
    const moneyDelta = Number(dedupeRowHasNonZeroMoney(b)) - Number(dedupeRowHasNonZeroMoney(a))
    if (moneyDelta) return moneyDelta
    const linesDelta = Number(dedupeRowHasLineItems(b)) - Number(dedupeRowHasLineItems(a))
    if (linesDelta) return linesDelta
    const humanDelta = Number(dedupeRowHasHumanEdit(b)) - Number(dedupeRowHasHumanEdit(a))
    if (humanDelta) return humanDelta
    const ta = Date.parse(a.created_at)
    const tb = Date.parse(b.created_at)
    if (ta !== tb) return ta - tb
    if (a.id !== b.id) return a.id < b.id ? -1 : 1
    return 0
  })
  return { keep: ranked[0], drop: ranked.slice(1) }
}

export type RunLevelDedupePlan<T extends RunLevelDedupeRow> = {
  run_id: string
  field_key: string
  keep: T
  drop: T[]
}

/** Groups run-level rows. Caller must pass show_id IS NULL rows only. */
export function planRunLevelDedupe<T extends RunLevelDedupeRow>(rows: T[]): Array<RunLevelDedupePlan<T>> {
  const groups = new Map<string, T[]>()
  for (const row of rows) {
    const key = `${row.run_id}\0${row.field_key}`
    const list = groups.get(key) ?? []
    list.push(row)
    groups.set(key, list)
  }
  const plans: Array<RunLevelDedupePlan<T>> = []
  for (const list of groups.values()) {
    if (list.length < 2) continue
    const { keep, drop } = chooseRunLevelKeeper(list)
    plans.push({ run_id: keep.run_id, field_key: keep.field_key, keep, drop })
  }
  plans.sort((a, b) => a.run_id.localeCompare(b.run_id) || a.field_key.localeCompare(b.field_key))
  return plans
}

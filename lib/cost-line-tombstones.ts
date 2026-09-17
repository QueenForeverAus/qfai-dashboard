/**
 * Hard-delete preserve for Costings / Advancing lines.
 *
 * If a field or seeded line was deleted, Factors refresh and page-open
 * backfill must not resurrect it. Deleted stays deleted.
 */

import type { CostEntry } from './cost-fields.ts'
import { generatedEntrySeedKey, type SeedEntry } from './defaults/generate-entries.ts'

export const COST_LINE_TOMBSTONE_SHEETS = ['costings', 'advancing'] as const
export type CostLineTombstoneSheet = (typeof COST_LINE_TOMBSTONE_SHEETS)[number]

/** Whole-field tombstone — findMissing / seed must not recreate the section. */
export const FIELD_TOMBSTONE_SEED_KEY = '*' as const

export const ADVANCING_NULL_SHOW_SENTINEL = '00000000-0000-0000-0000-000000000000'

export type CostLineTombstone = {
  run_id: string
  sheet: CostLineTombstoneSheet
  show_id: string | null
  field_key: string
  seed_key: string
  deleted_at?: string
}

export type TombstoneRef = Pick<CostLineTombstone, 'show_id' | 'field_key' | 'seed_key'>

export function tombstoneSheetFromTable(table: string | null | undefined): CostLineTombstoneSheet {
  return table === 'advancing_cost_fields' ? 'advancing' : 'costings'
}

export function normalizeTombstoneSeedKey(seedKey: string | null | undefined): string {
  const key = String(seedKey ?? '').trim()
  return key || FIELD_TOMBSTONE_SEED_KEY
}

export function tombstoneIdentityKey(ref: {
  show_id?: string | null
  field_key: string
  seed_key: string
}): string {
  return `${ref.show_id ?? ADVANCING_NULL_SHOW_SENTINEL}:${ref.field_key}:${normalizeTombstoneSeedKey(ref.seed_key)}`
}

export function isFieldTombstone(seedKey: string | null | undefined): boolean {
  return normalizeTombstoneSeedKey(seedKey) === FIELD_TOMBSTONE_SEED_KEY
}

export function isTombstoned(
  tombstones: Iterable<TombstoneRef> | null | undefined,
  ref: { show_id?: string | null; field_key: string; seed_key?: string | null },
): boolean {
  const list = [...(tombstones ?? [])]
  if (!list.length) return false
  const showId = ref.show_id ?? null
  const field = ref.field_key
  if (list.some(t => (t.show_id ?? null) === showId && t.field_key === field && isFieldTombstone(t.seed_key))) {
    return true
  }
  const seed = ref.seed_key
  if (seed == null || seed === '') return false
  return list.some(t =>
    (t.show_id ?? null) === showId
    && t.field_key === field
    && normalizeTombstoneSeedKey(t.seed_key) === normalizeTombstoneSeedKey(seed),
  )
}

export function tombstonedSeedKeysForField(
  tombstones: Iterable<TombstoneRef> | null | undefined,
  fieldKey: string,
  showId?: string | null,
): Set<string> {
  const keys = new Set<string>()
  for (const t of tombstones ?? []) {
    if (t.field_key !== fieldKey) continue
    if ((t.show_id ?? null) !== (showId ?? null)) continue
    keys.add(normalizeTombstoneSeedKey(t.seed_key))
  }
  return keys
}

export function entrySeedKey(
  fieldKey: string,
  entry: Pick<CostEntry, 'seed_key' | 'description' | 'inside_kind'>,
): string | null {
  const stored = String(entry.seed_key ?? '').trim()
  if (stored) return stored
  const kind = String(entry.inside_kind ?? '').trim()
  if (kind && kind !== 'custom') return kind
  const desc = String(entry.description ?? '').trim()
  if (!desc) return null
  return generatedEntrySeedKey(fieldKey, desc)
}

export function removedSeedKeys(
  fieldKey: string,
  existing: CostEntry[] | null | undefined,
  next: CostEntry[] | null | undefined,
): string[] {
  const nextKeys = new Set(
    (next ?? []).map(e => entrySeedKey(fieldKey, e)).filter((k): k is string => Boolean(k)),
  )
  const removed: string[] = []
  for (const prev of existing ?? []) {
    const key = entrySeedKey(fieldKey, prev)
    if (!key) continue
    if (!nextKeys.has(key) && !removed.includes(key)) removed.push(key)
  }
  return removed
}

export function tombstonesForRemovedEntries(opts: {
  runId: string
  sheet: CostLineTombstoneSheet
  showId: string | null
  fieldKey: string
  existing: CostEntry[] | null | undefined
  next: CostEntry[] | null | undefined
}): CostLineTombstone[] {
  const seeds = removedSeedKeys(opts.fieldKey, opts.existing, opts.next)
  const rows = seeds.map(seed_key => ({
    run_id: opts.runId,
    sheet: opts.sheet,
    show_id: opts.showId,
    field_key: opts.fieldKey,
    seed_key,
  }))
  const existingCount = (opts.existing ?? []).length
  const nextCount = (opts.next ?? []).length
  if (existingCount > 0 && nextCount === 0) {
    rows.push({
      run_id: opts.runId,
      sheet: opts.sheet,
      show_id: opts.showId,
      field_key: opts.fieldKey,
      seed_key: FIELD_TOMBSTONE_SEED_KEY,
    })
  }
  return rows
}

function paidChrome<T extends CostEntry>(keep: T, incoming: SeedEntry | CostEntry): T {
  return {
    ...keep,
    description: incoming.description || keep.description,
    notes: incoming.notes ?? keep.notes,
    amount: Number(incoming.amount) || 0,
    gst_included: incoming.gst_included ?? keep.gst_included,
    seed_key: keep.seed_key ?? ('seed_key' in incoming ? incoming.seed_key : null) ?? keep.inside_kind ?? null,
  }
}

/**
 * Factors refresh merge: update remaining seeded lines, never resurrect
 * tombstoned seed keys, keep user-added / custom entries.
 */
export function mergeFactorRefreshEntries(opts: {
  fieldKey: string
  existing: CostEntry[] | null | undefined
  generated: Array<SeedEntry | CostEntry>
  tombstones?: Iterable<TombstoneRef> | null
  showId?: string | null
}): CostEntry[] {
  const existing = opts.existing ?? []
  const used = new Set<string>()
  const out: CostEntry[] = []

  for (const gen of opts.generated) {
    const seed = String(gen.seed_key ?? generatedEntrySeedKey(opts.fieldKey, gen.description)).trim()
    if (!seed) continue
    if (isTombstoned(opts.tombstones, {
      show_id: opts.showId ?? null,
      field_key: opts.fieldKey,
      seed_key: seed,
    })) continue

    const match = existing.find(row => {
      if (used.has(row.id)) return false
      const key = entrySeedKey(opts.fieldKey, row)
      if (key === seed) {
        used.add(row.id)
        return true
      }
      return false
    })

    if (match) {
      out.push(paidChrome(match, { ...gen, seed_key: seed }))
    } else {
      out.push({
        id: gen.id,
        description: gen.description,
        notes: gen.notes,
        amount: Number(gen.amount) || 0,
        gst_included: gen.gst_included,
        confirmed: Boolean('confirmed' in gen ? gen.confirmed : false),
        paid: false,
        paid_at: null,
        seed_key: seed,
        rate: 'rate' in gen ? gen.rate ?? null : null,
        rate_unit: 'rate_unit' in gen ? gen.rate_unit ?? null : null,
        inside_kind: 'inside_kind' in gen && (
          gen.inside_kind === 'booking_fee'
          || gen.inside_kind === 'cc_fee'
          || gen.inside_kind === 'ticketing_inside'
          || gen.inside_kind === 'comp_tickets'
          || gen.inside_kind === 'custom'
        )
          ? gen.inside_kind
          : null,
      })
    }
  }

  for (const row of existing) {
    if (used.has(row.id)) continue
    const seed = entrySeedKey(opts.fieldKey, row)
    if (seed && isTombstoned(opts.tombstones, {
      show_id: opts.showId ?? null,
      field_key: opts.fieldKey,
      seed_key: seed,
    })) continue
    out.push(row)
  }

  return out
}

export function filterEntriesAgainstTombstones<T extends CostEntry>(
  fieldKey: string,
  showId: string | null,
  entries: T[] | null | undefined,
  tombstones?: Iterable<TombstoneRef> | null,
): T[] {
  return (entries ?? []).filter(entry => {
    const seed = entrySeedKey(fieldKey, entry)
    if (!seed) return true
    return !isTombstoned(tombstones, { show_id: showId, field_key: fieldKey, seed_key: seed })
  })
}

/**
 * Hard-delete preserve for Costings / Advancing lines.
 *
 * If a field or seeded line was deleted, Factors refresh and page-open
 * backfill must not resurrect it. Deleted stays deleted.
 */

import type { CostEntry } from './cost-fields.ts'
import { generatedEntrySeedKey, type SeedEntry } from './defaults/generate-entries.ts'
import { factorSlotId, matchFactorGeneratedEntries } from './factor-entry-match.ts'

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

function tombstoneLooksLikeSlot(
  fieldKey: string,
  seedKey: string,
  slot: string,
): boolean {
  const prefix = `${fieldKey}:`
  const description = seedKey.startsWith(prefix) ? seedKey.slice(prefix.length) : seedKey
  const tombSlot = factorSlotId(fieldKey, { seed_key: seedKey, description })
  if (!tombSlot) return false
  return tombSlot === slot || slot.startsWith(`${tombSlot}:`)
}

/**
 * Factors refresh merge: update the line for the same factor slot
 * (stable key, legacy label, or venue rename), never resurrect a
 * tombstoned slot, keep manual entries. See factor-entry-match.ts.
 */
export function mergeFactorRefreshEntries(opts: {
  fieldKey: string
  existing: CostEntry[] | null | undefined
  generated: Array<SeedEntry | CostEntry>
  tombstones?: Iterable<TombstoneRef> | null
  showId?: string | null
}): CostEntry[] {
  const tombs = [...(opts.tombstones ?? [])]
  const showId = opts.showId ?? null
  return matchFactorGeneratedEntries({
    fieldKey: opts.fieldKey,
    existing: opts.existing,
    generated: opts.generated,
    blocked: (aliases, slot) => {
      if (aliases.some(seed => isTombstoned(tombs, {
        show_id: showId,
        field_key: opts.fieldKey,
        seed_key: seed,
      }))) return true
      if (!slot) return false
      return tombs.some(t =>
        t.field_key === opts.fieldKey
        && (t.show_id ?? null) === showId
        && !isFieldTombstone(t.seed_key)
        && tombstoneLooksLikeSlot(opts.fieldKey, t.seed_key, slot),
      )
    },
    tombstoned: entry => {
      const seed = entrySeedKey(opts.fieldKey, entry)
      if (!seed) return false
      return isTombstoned(tombs, {
        show_id: showId,
        field_key: opts.fieldKey,
        seed_key: seed,
      })
    },
  })
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

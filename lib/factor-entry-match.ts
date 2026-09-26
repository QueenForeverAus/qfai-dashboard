/**
 * Factors refresh — how an existing Costings line is recognised.
 *
 * Going forward, factor-generated entries carry a stable `seed_key`:
 *   factor:<field_key>:<slot>
 * The slot does not include the venue name or the display label.
 *
 *   food_basics       show:<n>          n = 1-based position in show order
 *   lighting_hire     per_run           one line for the whole run
 *   backline_hire     per_run | keyboard
 *   crew_travel_day   adam | michael
 *   accommodation     pre:<n> | night:<n>
 *   per_diems         darryn | danny
 *
 * Notes on those lines keep "Source: Factors" (see generate-entries).
 *
 * On refresh, a generated line updates one existing entry instead of
 * appending, when any of these hit (best score wins):
 *   1. same stable seed_key
 *   2. legacy description key (`<field>:<normalised description>`)
 *   3. same slot inferred from older wording — "City — Show N" matches
 *      Show N after a venue rename; "Lighting equipment hire — full run"
 *      matches the per-run lighting line; "Backline hire (local)" matches
 *      the per-run backline line
 *
 * When several rows share a slot, one is kept (prefer a protected line,
 * then a stable key, then a non-zero amount, then the current label).
 * The others are dropped. Amounts are not added together.
 *
 * Left untouched:
 *   - manual lines (no factor slot, not the blank section placeholder)
 *   - protected lines (paid, invoiced, attachment, anomaly, custom inside)
 *     even when they occupy a factor slot — refresh will not overwrite
 *     them or add a second line for that slot
 *   - tombstoned slots / seed keys (hard delete stays deleted)
 *
 * A $0 line whose description is still the section default
 * ("Crew Travel-Day Fee", "Estimate", …) is a placeholder. It is replaced
 * by the generated factor lines, not kept beside them.
 *
 * After the merge, entry-backed fields store value = sum(entries), which
 * is the same figure the page-load reconcile writes. Music Rights and
 * Daniel Champagne have no entries; their value is the calc amount.
 */

import {
  defaultCostEntryDescription,
  definedCostField,
  type CostEntry,
} from './cost-fields.ts'

export function generatedEntrySeedKey(fieldKey: string, description: string): string {
  const desc = String(description ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
  return `${fieldKey}:${desc}`
}

/** Stable identity for a factor-generated line. Not derived from the label. */
export function factorLineSeedKey(fieldKey: string, slot: string): string {
  return `factor:${fieldKey}:${slot}`
}

export function isProtectedManualCostEntry(entry: {
  paid?: boolean
  invoice_number?: string | null
  invoice_amount?: number | null
  attachment_path?: string | null
  anomaly?: boolean
  inside_kind?: string | null
}): boolean {
  if (entry.paid) return true
  if (entry.anomaly === true) return true
  if (entry.inside_kind === 'custom') return true
  if (String(entry.invoice_number ?? '').trim()) return true
  if (entry.invoice_amount != null && Number.isFinite(Number(entry.invoice_amount))) return true
  if (String(entry.attachment_path ?? '').trim()) return true
  return false
}

/**
 * Blank section row seeded before a real factor breakdown existed.
 * A line that already matches a factor slot (lighting hire wording,
 * "Backline hire (local)", "City — Show N") is not a placeholder.
 */
export function isFactorPlaceholderEntry(fieldKey: string, entry: CostEntry): boolean {
  if (isProtectedManualCostEntry(entry)) return false
  if (factorSlotId(fieldKey, entry)) return false
  const desc = String(entry.description ?? '').trim().toLowerCase()
  if (!desc) return true
  const generic = new Set<string>([
    defaultCostEntryDescription(fieldKey, definedCostField(fieldKey)?.label).toLowerCase(),
    (definedCostField(fieldKey)?.label ?? '').trim().toLowerCase(),
    'estimate',
  ])
  generic.delete('')
  return generic.has(desc)
}

type SlotEntry = {
  seed_key?: string | null
  description?: string | null
}

/**
 * Slot for a stored or generated line.
 * Description inference ignores venue names. Stable keys win.
 * Accommodation pre-show nights come back as `pre` (caller numbers them).
 */
export function factorSlotId(fieldKey: string, entry: SlotEntry): string | null {
  const seed = String(entry.seed_key ?? '').trim()
  const prefix = `factor:${fieldKey}:`
  if (seed.startsWith(prefix)) {
    const slot = seed.slice(prefix.length).trim()
    return slot || null
  }
  const desc = String(entry.description ?? '').trim()
  if (!desc) return null
  switch (fieldKey) {
    case 'food_basics': {
      const m = desc.match(/(?:—|–|-)\s*show\s+(\d+)\s*$/i)
      return m ? `show:${Number(m[1])}` : null
    }
    case 'lighting_hire':
      return /lighting/i.test(desc) && /(equipment|hire|full run)/i.test(desc) ? 'per_run' : null
    case 'backline_hire':
      if (/keyboard/i.test(desc)) return 'keyboard'
      if (/backline/i.test(desc)) return 'per_run'
      return null
    case 'crew_travel_day':
      if (/adam dahl|^adam\b/i.test(desc)) return 'adam'
      if (/michael richardson|^michael\b/i.test(desc)) return 'michael'
      return null
    case 'accommodation': {
      if (/pre-show night/i.test(desc)) return 'pre'
      const m = desc.match(/\bnight\s+(\d+)\b/i)
      return m ? `night:${Number(m[1])}` : null
    }
    case 'per_diems':
      if (/darryn/i.test(desc)) return 'darryn'
      if (/danny/i.test(desc)) return 'danny'
      return null
    default:
      return null
  }
}

function lineAliases(fieldKey: string, entry: {
  seed_key?: string | null
  description?: string | null
  inside_kind?: string | null
}): string[] {
  const keys = new Set<string>()
  const stored = String(entry.seed_key ?? '').trim()
  if (stored) keys.add(stored)
  const desc = String(entry.description ?? '').trim()
  if (desc) keys.add(generatedEntrySeedKey(fieldKey, desc))
  const kind = String(entry.inside_kind ?? '').trim()
  if (kind && kind !== 'custom') keys.add(kind)
  return [...keys]
}

/** Number repeated accommodation pre-show nights. Other slots are already unique. */
export function resolvedFactorSlots<T extends SlotEntry & { id: string }>(
  fieldKey: string,
  rows: T[],
): Map<string, string> {
  const out = new Map<string, string>()
  let pre = 0
  for (const row of rows) {
    let slot = factorSlotId(fieldKey, row)
    if (!slot) continue
    if (slot === 'pre') {
      pre += 1
      slot = `pre:${pre}`
    }
    out.set(row.id, slot)
  }
  return out
}

type GeneratedLine = {
  id: string
  description: string
  notes?: string | null
  amount: number
  gst_included?: boolean
  confirmed?: boolean
  seed_key?: string | null
  rate?: number | null
  rate_unit?: 'per_payer' | 'pct_gross' | null
  inside_kind?: CostEntry['inside_kind']
}

function applyGenerated<T extends CostEntry>(keep: T, incoming: GeneratedLine, seed: string): T {
  const keepNotes = String(keep.notes ?? '').trim()
  const notes = keepNotes && !/Source:\s*Factors/i.test(keepNotes)
    ? keep.notes
    : (incoming.notes ?? keep.notes)
  return {
    ...keep,
    description: incoming.description || keep.description,
    notes: notes ?? '',
    amount: Number(incoming.amount) || 0,
    gst_included: incoming.gst_included ?? keep.gst_included,
    seed_key: seed || keep.seed_key || null,
  }
}

function freshFromGenerated(gen: GeneratedLine, seed: string): CostEntry {
  return {
    id: gen.id,
    description: gen.description,
    notes: gen.notes ?? '',
    amount: Number(gen.amount) || 0,
    gst_included: gen.gst_included ?? false,
    confirmed: Boolean(gen.confirmed),
    paid: false,
    paid_at: null,
    seed_key: seed || null,
    rate: gen.rate ?? null,
    rate_unit: gen.rate_unit ?? null,
    inside_kind: gen.inside_kind ?? null,
  }
}

/**
 * Replace-or-update merge used by Factors refresh.
 * `blocked(aliases, slot)` skips a generated line (tombstone).
 * `tombstoned(entry)` drops a leftover whose own seed was deleted.
 */
export function matchFactorGeneratedEntries(opts: {
  fieldKey: string
  existing: CostEntry[] | null | undefined
  generated: GeneratedLine[]
  blocked?: (aliases: string[], slot: string | null) => boolean
  tombstoned?: (entry: CostEntry) => boolean
}): CostEntry[] {
  const existing = opts.existing ?? []
  const existingSlots = resolvedFactorSlots(opts.fieldKey, existing)
  const used = new Set<string>()
  const consumedSlots = new Set<string>()
  const out: CostEntry[] = []

  for (const gen of opts.generated) {
    const seed = String(gen.seed_key ?? generatedEntrySeedKey(opts.fieldKey, gen.description)).trim()
    const aliases = lineAliases(opts.fieldKey, { ...gen, seed_key: seed })
    const slot = factorSlotId(opts.fieldKey, { ...gen, seed_key: seed })
    if (opts.blocked?.(aliases, slot)) continue

    let best: { row: CostEntry; index: number; score: number } | null = null
    for (let index = 0; index < existing.length; index++) {
      const row = existing[index]
      if (used.has(row.id)) continue
      const rowSlot = existingSlots.get(row.id) ?? null
      const rowAliases = lineAliases(opts.fieldKey, row)
      const aliasHit = rowAliases.some(key => aliases.includes(key))
      const slotHit = Boolean(slot) && rowSlot === slot
      if (!aliasHit && !slotHit) continue
      let score = 0
      if (isProtectedManualCostEntry(row)) score += 1000
      if (seed && String(row.seed_key ?? '') === seed) score += 100
      if (Math.abs(Number(row.amount) || 0) > 0.004) score += 10
      if (aliasHit) score += 5
      if (!best || score > best.score || (score === best.score && index < best.index)) {
        best = { row, index, score }
      }
    }

    if (slot) consumedSlots.add(slot)
    if (best) {
      used.add(best.row.id)
      out.push(isProtectedManualCostEntry(best.row) ? best.row : applyGenerated(best.row, gen, seed))
    } else {
      out.push(freshFromGenerated(gen, seed))
    }
  }

  for (const row of existing) {
    if (used.has(row.id)) continue
    if (isProtectedManualCostEntry(row)) {
      out.push(row)
      continue
    }
    if (opts.tombstoned?.(row)) continue
    const slot = existingSlots.get(row.id)
    if (slot && consumedSlots.has(slot)) continue
    if (opts.generated.length > 0 && isFactorPlaceholderEntry(opts.fieldKey, row)) continue
    out.push(row)
  }

  return out
}

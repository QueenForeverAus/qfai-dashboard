/**
 * Wave B Topic 11 — Group-change review.
 *
 * Changing Group Type on Costings applies the new group's seeds.
 * CONFIRMED / INVOICED / PAID lines are keep-or-replace (never silent wipe).
 * Unprotected estimated/guess lines auto-replace.
 */

import {
  allEntriesPaid,
  INVOICED_FIELD_STATE,
  someEntriesPaid,
  type CostEntry,
} from './cost-fields.ts'
import { isConfirmedStoredState } from './certainty-ladder.ts'
import {
  GROUP_CHANGE_SAME,
  GROUP_SEED_FIELD_KEYS,
  groupSeedLineKey,
  isGroupType,
  type GroupSeedFieldKey,
} from './group-type.ts'
import type { RunRegion } from './types.ts'
import { buildFactorEstimateSeedRows, type SeedShow } from './defaults/seed-run.ts'
import type { FactorMap } from './defaults/estimate-from-factors.ts'

export type GroupChangeProtectedReason = 'confirmed' | 'invoiced' | 'paid'

export type GroupChangeAction = 'add' | 'update' | 'remove'

export type GroupChangeDecision = 'keep' | 'replace'

export type GroupChangeField = {
  id?: string
  field_key: string
  show_id?: string | null
  label?: string | null
  category?: string | null
  value?: number | null
  state?: string | null
  source?: string | null
  entries?: CostEntry[] | unknown[] | null
}

export type GroupChangeLine = {
  key: string
  fieldKey: GroupSeedFieldKey
  showId: string | null
  action: GroupChangeAction
  protected: boolean
  protectedReasons: GroupChangeProtectedReason[]
  /** Default when operator has not chosen: keep if protected, else replace. */
  defaultDecision: GroupChangeDecision
  existing: GroupChangeField | null
  proposed: GroupChangeField | null
}

export type GroupChangePreview = {
  from: RunRegion
  to: RunRegion
  lines: GroupChangeLine[]
  protectedCount: number
}

export function groupChangeProtectedReasons(field: GroupChangeField | null | undefined): GroupChangeProtectedReason[] {
  if (!field) return []
  const reasons: GroupChangeProtectedReason[] = []
  const state = String(field.state ?? '').trim().toLowerCase()
  if (isConfirmedStoredState(state) || state === 'confirmed') reasons.push('confirmed')
  if (state === INVOICED_FIELD_STATE) reasons.push('invoiced')
  const entries = Array.isArray(field.entries) ? field.entries as CostEntry[] : []
  if (someEntriesPaid(entries) || allEntriesPaid(entries)) reasons.push('paid')
  return reasons
}

export function isGroupChangeProtected(field: GroupChangeField | null | undefined): boolean {
  return groupChangeProtectedReasons(field).length > 0
}

function asSeedField(row: object): GroupChangeField {
  const r = row as GroupChangeField
  return {
    field_key: String(r.field_key ?? ''),
    show_id: r.show_id ?? null,
    label: r.label ?? null,
    category: r.category ?? null,
    value: r.value ?? null,
    state: r.state ?? null,
    source: r.source ?? null,
    entries: r.entries ?? [],
  }
}

function seedValue(field: GroupChangeField | null): string {
  if (!field) return '∅'
  const entries = Array.isArray(field.entries) ? field.entries : []
  const descs = entries
    .map(e => {
      const row = e as { description?: string; amount?: number }
      return `${row.description ?? ''}:${row.amount ?? ''}`
    })
    .join('|')
  return `${field.value ?? 'null'}|${field.state ?? ''}|${descs}`
}

export function buildGroupSeedFields(opts: {
  runId: string
  shows: SeedShow[]
  factors: FactorMap
  region: RunRegion
  lightingHireFallback: number
}): GroupChangeField[] {
  return buildFactorEstimateSeedRows(
    opts.runId,
    opts.shows,
    opts.factors,
    opts.region,
    opts.lightingHireFallback,
  )
    .map(asSeedField)
    .filter(f => (GROUP_SEED_FIELD_KEYS as readonly string[]).includes(f.field_key))
}

export function previewGroupChange(opts: {
  from: string
  to: string
  existing: GroupChangeField[]
  proposed: GroupChangeField[]
}): GroupChangePreview {
  if (!isGroupType(opts.from) || !isGroupType(opts.to)) {
    throw new Error('Invalid Group Type')
  }
  if (opts.from === opts.to) {
    throw new Error(GROUP_CHANGE_SAME)
  }

  const existingByKey = new Map<string, GroupChangeField>()
  for (const field of opts.existing) {
    if (!(GROUP_SEED_FIELD_KEYS as readonly string[]).includes(field.field_key)) continue
    existingByKey.set(groupSeedLineKey(field.field_key, field.show_id), field)
  }
  const proposedByKey = new Map<string, GroupChangeField>()
  for (const field of opts.proposed) {
    proposedByKey.set(groupSeedLineKey(field.field_key, field.show_id), field)
  }

  const keys = new Set([...existingByKey.keys(), ...proposedByKey.keys()])
  const lines: GroupChangeLine[] = []

  for (const key of keys) {
    const existing = existingByKey.get(key) ?? null
    const proposed = proposedByKey.get(key) ?? null
    const fieldKey = (existing?.field_key ?? proposed?.field_key) as GroupSeedFieldKey
    const showId = existing?.show_id ?? proposed?.show_id ?? null
    let action: GroupChangeAction
    if (existing && !proposed) action = 'remove'
    else if (!existing && proposed) action = 'add'
    else action = 'update'
    if (action === 'update' && seedValue(existing) === seedValue(proposed)) continue

    const reasons = groupChangeProtectedReasons(existing)
    const protectedLine = reasons.length > 0
    lines.push({
      key,
      fieldKey,
      showId,
      action,
      protected: protectedLine,
      protectedReasons: reasons,
      defaultDecision: protectedLine ? 'keep' : 'replace',
      existing,
      proposed,
    })
  }

  return {
    from: opts.from,
    to: opts.to,
    lines,
    protectedCount: lines.filter(l => l.protected).length,
  }
}

/**
 * Resolve keep/replace. Protected lines without an explicit replace stay kept.
 * Never silently wipes CONFIRMED / INVOICED / PAID.
 */
export function resolveGroupChangeDecision(
  line: GroupChangeLine,
  decisions?: Record<string, GroupChangeDecision> | null,
): GroupChangeDecision {
  const chosen = decisions?.[line.key]
  if (line.protected) {
    return chosen === 'replace' ? 'replace' : 'keep'
  }
  return chosen === 'keep' ? 'keep' : 'replace'
}

export type AppliedGroupChange = {
  keep: GroupChangeLine[]
  replace: GroupChangeLine[]
  applied: GroupChangeLine[]
}

export function applyGroupChangeDecisions(
  preview: GroupChangePreview,
  decisions?: Record<string, GroupChangeDecision> | null,
): AppliedGroupChange {
  const keep: GroupChangeLine[] = []
  const replace: GroupChangeLine[] = []
  for (const line of preview.lines) {
    const decision = resolveGroupChangeDecision(line, decisions)
    if (decision === 'keep') keep.push(line)
    else replace.push(line)
  }
  return { keep, replace, applied: replace }
}

export function nextFieldFromReplace(line: GroupChangeLine): GroupChangeField | null {
  if (line.action === 'remove') return null
  return line.proposed
}

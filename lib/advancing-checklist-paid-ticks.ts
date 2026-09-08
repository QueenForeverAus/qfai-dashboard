/**
 * Tour Desk v2 Phase 2 — PAID on Run Advancing → Advancing Checklist auto-tick.
 *
 * Mapping is best-effort known keys only. Unknown cost lines stay manual.
 * Does not change figure-accuracy / `known` / draft-known semantics.
 * Never writes Advancing edits back into locked Run Costings.
 *
 * Field-key decision (vs DEFINED_RUN_COST_FIELDS / R01 patterns):
 * - flights → flights_complete
 * - accommodation → hotel_confirmed  (no separate `hotels` key)
 * - ground_transport → car_hire_van  (cars / van hire live on Ground Transport;
 *   there is no `car_hire` field_key)
 * - backline_hire → backline_hire_ordered (optional; region-gated item exists).
 *   The checklist item is show-scoped (group3), not run-scoped — a PAID run-level
 *   backline_hire ticks every pending show row for that key.
 */

import {
  allEntriesPaid,
  normalizeEntries,
  normalizeLineItems,
  sectionPayableLines,
} from './cost-fields.ts'

/** Canonical Run Advancing cost `field_key` → checklist `item_key`. */
export const PAID_COST_FIELD_TO_CHECKLIST_ITEM = {
  flights: 'flights_complete',
  accommodation: 'hotel_confirmed',
  ground_transport: 'car_hire_van',
  backline_hire: 'backline_hire_ordered',
} as const

export type PaidMappedCostFieldKey = keyof typeof PAID_COST_FIELD_TO_CHECKLIST_ITEM
export type PaidMappedChecklistItemKey =
  (typeof PAID_COST_FIELD_TO_CHECKLIST_ITEM)[PaidMappedCostFieldKey]

export type PaidTickSource = 'advancing' | 'costing'

export type ChecklistTickCandidate = {
  id: string
  item_key: string
  status: string
}

export type PaidTickSkipReason =
  | 'costing_sheet'
  | 'not_paid'
  | 'unmapped'
  | 'already_done'
  | 'n_a'
  | 'unknown_status'

export type PaidTickDecision = {
  id: string
  item_key: string
  action: 'tick' | 'skip'
  reason: 'paid_pending' | PaidTickSkipReason
}

export const AUTO_TICKED_FROM_PAID_HINT = 'Auto-ticked from PAID on Run Advancing'

export const AUDIT_FIELD_PAID_CHECKLIST_TICK = 'Advancing Checklist auto-tick'

export function checklistItemKeyForPaidCostField(
  fieldKey: string,
): PaidMappedChecklistItemKey | null {
  const mapped = PAID_COST_FIELD_TO_CHECKLIST_ITEM[fieldKey as PaidMappedCostFieldKey]
  return mapped ?? null
}

export function checklistItemKeysForPaidFields(fieldKeys: string[]): string[] {
  const keys = new Set<string>()
  for (const fieldKey of fieldKeys) {
    const itemKey = checklistItemKeyForPaidCostField(fieldKey)
    if (itemKey) keys.add(itemKey)
  }
  return [...keys]
}

const CHECKLIST_ITEM_TO_PAID_COST_FIELD = Object.fromEntries(
  Object.entries(PAID_COST_FIELD_TO_CHECKLIST_ITEM).map(([fieldKey, itemKey]) => [itemKey, fieldKey]),
) as Record<PaidMappedChecklistItemKey, PaidMappedCostFieldKey>

export function costFieldKeyForChecklistItem(itemKey: string): PaidMappedCostFieldKey | null {
  return CHECKLIST_ITEM_TO_PAID_COST_FIELD[itemKey as PaidMappedChecklistItemKey] ?? null
}

/**
 * Same meaning as Settlements / Costing all-PAID chrome:
 * ≥1 payable line and every line `paid === true`.
 * Uses entries, or venue_staff planned roles when those are the payable lines.
 */
export function costFieldIsEffectivelyPaid(field: {
  field_key: string
  entries?: unknown
  line_items?: unknown
}): boolean {
  const entries = normalizeEntries(field.entries)
  const lineItems = normalizeLineItems(field.line_items)
  return allEntriesPaid(sectionPayableLines(field.field_key, entries, lineItems))
}

export function paidFieldKeysFromCostFields(
  fields: Array<{ field_key: string; entries?: unknown; line_items?: unknown }>,
): string[] {
  return fields.filter(costFieldIsEffectivelyPaid).map(field => field.field_key)
}

export function costFieldWriteSourceForChecklist(
  table: 'cost_fields' | 'advancing_cost_fields',
): PaidTickSource {
  return table === 'advancing_cost_fields' ? 'advancing' : 'costing'
}

/**
 * Write-path helper: one saved cost field → tick decisions.
 * Costing sheet never ticks. Unpaid fields never un-tick.
 */
export function decidePaidChecklistTicksForField(opts: {
  source: PaidTickSource
  fieldKey: string
  fieldIsPaid: boolean
  items: ChecklistTickCandidate[]
}): { tickIds: string[]; decisions: PaidTickDecision[] } {
  if (opts.source === 'costing') {
    return decidePaidChecklistTicks({
      source: 'costing',
      paidFieldKeys: [opts.fieldKey],
      items: opts.items,
    })
  }
  if (!opts.fieldIsPaid) {
    const mapped = checklistItemKeyForPaidCostField(opts.fieldKey)
    return {
      tickIds: [],
      decisions: opts.items.map(item => ({
        id: item.id,
        item_key: item.item_key,
        action: 'skip' as const,
        reason: mapped && item.item_key === mapped ? 'not_paid' as const : 'unmapped' as const,
      })),
    }
  }
  return decidePaidChecklistTicks({
    source: 'advancing',
    paidFieldKeys: [opts.fieldKey],
    items: opts.items,
  })
}

/**
 * Decide which checklist rows to set `status: 'done'`.
 * Never un-ticks. Never overwrites `n_a`. Costing sheet never ticks.
 */
export function decidePaidChecklistTicks(opts: {
  source: PaidTickSource
  paidFieldKeys: string[]
  items: ChecklistTickCandidate[]
}): { tickIds: string[]; decisions: PaidTickDecision[] } {
  if (opts.source === 'costing') {
    return {
      tickIds: [],
      decisions: opts.items.map(item => ({
        id: item.id,
        item_key: item.item_key,
        action: 'skip' as const,
        reason: 'costing_sheet' as const,
      })),
    }
  }

  const mappedItemKeys = new Set(checklistItemKeysForPaidFields(opts.paidFieldKeys))
  const decisions: PaidTickDecision[] = []
  const tickIds: string[] = []

  for (const item of opts.items) {
    if (!mappedItemKeys.has(item.item_key)) {
      decisions.push({
        id: item.id,
        item_key: item.item_key,
        action: 'skip',
        reason: 'unmapped',
      })
      continue
    }
    if (item.status === 'done') {
      decisions.push({
        id: item.id,
        item_key: item.item_key,
        action: 'skip',
        reason: 'already_done',
      })
      continue
    }
    if (item.status === 'n_a') {
      decisions.push({
        id: item.id,
        item_key: item.item_key,
        action: 'skip',
        reason: 'n_a',
      })
      continue
    }
    if (item.status === 'pending') {
      decisions.push({
        id: item.id,
        item_key: item.item_key,
        action: 'tick',
        reason: 'paid_pending',
      })
      tickIds.push(item.id)
      continue
    }
    decisions.push({
      id: item.id,
      item_key: item.item_key,
      action: 'skip',
      reason: 'unknown_status',
    })
  }

  return { tickIds, decisions }
}

export function formatPaidChecklistTickAuditCopy(opts: {
  actorName: string
  itemLabel: string
  fieldKey: string
}): { fieldName: string; oldValue: string; newValue: string } {
  const actor = opts.actorName.trim() || 'Someone'
  const item = opts.itemLabel.trim() || opts.fieldKey
  return {
    fieldName: AUDIT_FIELD_PAID_CHECKLIST_TICK,
    oldValue: 'pending',
    newValue: `${actor} auto-ticked ${item} from PAID on Run Advancing (${opts.fieldKey}).`,
  }
}

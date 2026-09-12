/**
 * Persist Settlements Actual → Advancing write-back.
 * Writes advancing_cost_fields only. Never cost_fields. Never Actual.
 */

import { writeAuditLog } from './audit-log.ts'
import {
  loadActiveAdvancingWorkspace,
  loadAdvancingCostFields,
} from './run-advancing-persist.ts'
import { isAdvancingWorkspaceActive } from './run-advancing.ts'
import {
  findAdvancingFieldForSheetKey,
  formatSettlementsSyncAuditCopy,
  planActualWriteBack,
  SETTLEMENTS_SYNC_WRITES_COST_FIELDS,
  type PaidWriteBackPlan,
} from './settlements-advancing-sync.ts'
import type { createAdminClient } from '@/lib/supabase/server-admin'

type AdminClient = ReturnType<typeof createAdminClient>

export type PersistActualWriteBackResult = {
  applied: boolean
  plan: PaidWriteBackPlan
  writes_cost_fields: false
}

export async function persistActualWriteBack(opts: {
  admin: AdminClient
  runId: string
  runCode: string
  lineKey: string
  showId: string | null
  label: string
  actualAmount: number
  markPaid: boolean
  sourceNote: string
  actorUserId: string | null
  actorName: string
}): Promise<PersistActualWriteBackResult> {
  if (SETTLEMENTS_SYNC_WRITES_COST_FIELDS) {
    throw new Error('Settlements sync must never write cost_fields')
  }

  const workspace = await loadActiveAdvancingWorkspace(opts.admin, opts.runId)
  const active = isAdvancingWorkspaceActive(workspace)
  const fields = active && workspace
    ? await loadAdvancingCostFields(opts.admin, workspace.id)
    : []
  const field = findAdvancingFieldForSheetKey(fields, opts.lineKey, opts.showId)

  const plan = planActualWriteBack({
    lineKey: opts.lineKey,
    showId: opts.showId,
    actualAmount: opts.actualAmount,
    markPaid: opts.markPaid,
    sourceNote: opts.sourceNote,
    advancingWorkspaceActive: active,
    advancingField: field
      ? {
          id: field.id,
          field_key: field.field_key,
          show_id: field.show_id,
          label: field.label,
          value: field.value,
          state: field.state,
          source: field.source,
          entries: field.entries,
          line_items: field.line_items,
        }
      : null,
  })

  if (!plan.ok || plan.action === 'none' || !plan.field_id) {
    return { applied: false, plan, writes_cost_fields: false }
  }

  const now = new Date().toISOString()
  const updates: Record<string, unknown> = {
    state: plan.next_state,
    value: plan.next_value,
    source: plan.next_source,
    entries: plan.next_entries,
    updated_at: now,
    updated_by: opts.actorUserId,
  }
  if (plan.next_line_items) updates.line_items = plan.next_line_items

  const { error } = await opts.admin
    .from('advancing_cost_fields')
    .update(updates)
    .eq('id', plan.field_id)
  if (error) throw new Error(error.message)

  if (opts.actorUserId) {
    const copy = formatSettlementsSyncAuditCopy({
      actorName: opts.actorName,
      runCode: opts.runCode,
      label: opts.label,
      action: plan.action,
      amount: opts.actualAmount,
      sourceNote: opts.sourceNote,
    })
    await writeAuditLog(opts.admin, opts.actorUserId, [{
      table_name: 'advancing_cost_fields',
      record_id: plan.field_id,
      run_id: opts.runId,
      field_name: copy.fieldName,
      old_value: copy.oldValue,
      new_value: copy.newValue,
      change_type: 'update',
    }])
  }

  return { applied: true, plan, writes_cost_fields: false }
}

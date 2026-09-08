/**
 * Persist PAID→checklist ticks. Advancing workspace only.
 * Load-sync should pass writeAudit: false to avoid extra app-level audit rows;
 * DB triggers still record a status change when pending → done.
 */

import {
  ADVANCEMENT_AUDIT_FIELDS,
  auditFieldDiffs,
  setAuditActor,
  writeAuditLog,
} from './audit-log.ts'
import {
  costFieldIsEffectivelyPaid,
  costFieldKeyForChecklistItem,
  costFieldWriteSourceForChecklist,
  decidePaidChecklistTicks,
  formatPaidChecklistTickAuditCopy,
  type PaidTickSource,
} from './advancing-checklist-paid-ticks.ts'
import type { createAdminClient } from '@/lib/supabase/server-admin'

type AdminClient = ReturnType<typeof createAdminClient>

export async function applyPaidChecklistTicks(opts: {
  admin: AdminClient
  runId: string
  paidFieldKeys: string[]
  source: PaidTickSource
  actorUserId?: string | null
  actorName?: string | null
  writeAudit: boolean
}): Promise<{ tickedIds: string[] }> {
  if (opts.source !== 'advancing' || opts.paidFieldKeys.length === 0) {
    return { tickedIds: [] }
  }

  const { data: items, error } = await opts.admin
    .from('advancement_items')
    .select('id, item_key, status, label')
    .eq('run_id', opts.runId)

  if (error || !items?.length) {
    if (error) console.error('applyPaidChecklistTicks load failed:', error.message)
    return { tickedIds: [] }
  }

  const { tickIds, decisions } = decidePaidChecklistTicks({
    source: opts.source,
    paidFieldKeys: opts.paidFieldKeys,
    items: items.map(row => ({
      id: String(row.id),
      item_key: String(row.item_key),
      status: String(row.status),
    })),
  })

  if (tickIds.length === 0) return { tickedIds: [] }

  if (opts.actorUserId) {
    await setAuditActor(opts.admin, opts.actorUserId)
  }

  const now = new Date().toISOString()
  const tickedIds: string[] = []
  const labelById = new Map(items.map(row => [String(row.id), String(row.label ?? '')]))
  const reasonById = new Map(decisions.map(d => [d.id, d]))

  for (const id of tickIds) {
    const updates: Record<string, unknown> = {
      status: 'done',
      updated_at: now,
    }
    if (opts.actorUserId) updates.updated_by = opts.actorUserId

    const { data, error: updateError } = await opts.admin
      .from('advancement_items')
      .update(updates)
      .eq('id', id)
      .eq('status', 'pending')
      .select('id, status, notes, assigned_to, paid, payment_type, label')
      .maybeSingle()

    if (updateError) {
      console.error('applyPaidChecklistTicks update failed:', updateError.message)
      continue
    }
    if (!data) continue
    tickedIds.push(String(data.id))

    if (opts.writeAudit && opts.actorUserId) {
      const itemKey = reasonById.get(id)?.item_key ?? ''
      const fieldKey = costFieldKeyForChecklistItem(itemKey) ?? opts.paidFieldKeys[0] ?? ''
      const narrative = formatPaidChecklistTickAuditCopy({
        actorName: opts.actorName ?? 'Someone',
        itemLabel: labelById.get(id) ?? itemKey,
        fieldKey,
      })
      await writeAuditLog(opts.admin, opts.actorUserId, [
        {
          table_name: 'advancement_items',
          record_id: id,
          run_id: opts.runId,
          field_name: narrative.fieldName,
          old_value: narrative.oldValue,
          new_value: narrative.newValue,
          change_type: 'update',
        },
        ...auditFieldDiffs(
          'advancement_items',
          id,
          opts.runId,
          { status: 'pending' },
          { status: 'done' },
          ADVANCEMENT_AUDIT_FIELDS,
        ),
      ])
    }
  }

  return { tickedIds }
}

/** After a successful cost-field save — no-op on Run Costing. */
export async function autoTickChecklistAfterCostFieldSave(opts: {
  admin: AdminClient
  table: 'cost_fields' | 'advancing_cost_fields'
  runId: string | null
  field: { field_key: string; entries?: unknown; line_items?: unknown }
  actorUserId: string
  actorName?: string | null
  writeAudit: boolean
}): Promise<{ tickedIds: string[] }> {
  const source = costFieldWriteSourceForChecklist(opts.table)
  if (source !== 'advancing' || !opts.runId) return { tickedIds: [] }
  if (!costFieldIsEffectivelyPaid(opts.field)) return { tickedIds: [] }

  try {
    return await applyPaidChecklistTicks({
      admin: opts.admin,
      runId: opts.runId,
      paidFieldKeys: [opts.field.field_key],
      source,
      actorUserId: opts.actorUserId,
      actorName: opts.actorName,
      writeAudit: opts.writeAudit,
    })
  } catch (err) {
    console.error('PAID→checklist auto-tick failed:', err)
    return { tickedIds: [] }
  }
}

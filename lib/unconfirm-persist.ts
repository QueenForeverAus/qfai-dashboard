/**
 * Server-side Unconfirm / Re-BOOK.
 * Staging additive columns + run_unconfirm_events — see
 * supabase/migrations/20260915_wave_a_unconfirm_factors.sql
 */

import { writeAuditLog } from './audit-log.ts'
import {
  canRebookAfterUnconfirm,
  canUnconfirmRun,
  formatRebookAuditCopy,
  formatUnconfirmAuditCopy,
} from './unconfirm.ts'
import {
  captureBookedCostSnapshotIfNeeded,
  loadRunBookingFreeze,
} from './booked-cost-freeze-persist.ts'
import { recopyCostingsIntoAdvancingPreservingPaid } from './run-advancing-persist.ts'
import type { createAdminClient } from '@/lib/supabase/server-admin'

type AdminClient = ReturnType<typeof createAdminClient>

export async function persistUnconfirm(opts: {
  admin: AdminClient
  runId: string
  runCode: string
  status: string
  role: string
  actorId: string
  actorName: string
  reason?: string | null
}): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const existing = await loadRunBookingFreeze(opts.admin, opts.runId)
  if (!existing) return { ok: false, error: 'Run not found', status: 404 }
  const gate = canUnconfirmRun({
    role: opts.role,
    status: existing.status,
    costingsUnconfirmedAt: existing.costings_unconfirmed_at ?? null,
  })
  if (!gate.ok) return { ok: false, error: gate.error, status: 409 }

  const now = new Date().toISOString()
  const reason = (opts.reason ?? '').trim() || null

  const { error } = await opts.admin
    .from('runs')
    .update({
      costings_unconfirmed_at: now,
      costings_unconfirmed_by: opts.actorId,
      costings_unconfirmed_reason: reason,
      updated_at: now,
    })
    .eq('id', existing.id)

  if (error) {
    console.error('Unconfirm run update failed:', error.message)
    return { ok: false, error: error.message, status: 500 }
  }

  await opts.admin.from('run_unconfirm_events').insert({
    run_id: existing.id,
    action: 'unconfirm',
    actor_id: opts.actorId,
    reason,
    created_at: now,
  })

  const copy = formatUnconfirmAuditCopy({
    actorName: opts.actorName,
    runCode: opts.runCode,
    reason,
  })
  await writeAuditLog(opts.admin, opts.actorId, [{
    table_name: 'runs',
    record_id: existing.id,
    run_id: existing.id,
    field_name: copy.fieldName,
    old_value: copy.oldValue,
    new_value: copy.newValue,
    change_type: 'update',
  }])

  return { ok: true }
}

export async function persistRebookAfterUnconfirm(opts: {
  admin: AdminClient
  runId: string
  runCode: string
  role: string
  actorId: string
  actorName: string
}): Promise<{ ok: true; fieldCount: number } | { ok: false; error: string; status: number }> {
  const existing = await loadRunBookingFreeze(opts.admin, opts.runId)
  if (!existing) return { ok: false, error: 'Run not found', status: 404 }
  const gate = canRebookAfterUnconfirm({
    role: opts.role,
    status: existing.status,
    costingsUnconfirmedAt: existing.costings_unconfirmed_at ?? null,
  })
  if (!gate.ok) return { ok: false, error: gate.error, status: 409 }

  const now = new Date().toISOString()
  const { error } = await opts.admin
    .from('runs')
    .update({
      costings_unconfirmed_at: null,
      costings_unconfirmed_by: null,
      costings_unconfirmed_reason: null,
      updated_at: now,
    })
    .eq('id', existing.id)

  if (error) {
    console.error('Re-BOOK run update failed:', error.message)
    return { ok: false, error: error.message, status: 500 }
  }

  await captureBookedCostSnapshotIfNeeded({
    admin: opts.admin,
    runId: existing.id,
    runCode: opts.runCode,
    nextStatus: existing.status,
    prevStatus: existing.status,
    actorId: opts.actorId,
    actorName: opts.actorName,
    forceRecapture: true,
  })

  const copied = await recopyCostingsIntoAdvancingPreservingPaid({
    admin: opts.admin,
    runId: existing.id,
    runCode: opts.runCode,
    actorId: opts.actorId,
    actorName: opts.actorName,
  })

  await opts.admin.from('run_unconfirm_events').insert({
    run_id: existing.id,
    action: 'rebook',
    actor_id: opts.actorId,
    reason: null,
    created_at: now,
  })

  const copy = formatRebookAuditCopy({
    actorName: opts.actorName,
    runCode: opts.runCode,
    fieldCount: copied.fieldCount,
  })
  await writeAuditLog(opts.admin, opts.actorId, [{
    table_name: 'runs',
    record_id: existing.id,
    run_id: existing.id,
    field_name: copy.fieldName,
    old_value: copy.oldValue,
    new_value: copy.newValue,
    change_type: 'update',
  }])

  return { ok: true, fieldCount: copied.fieldCount }
}

/**
 * Server-side BOOKED cost-sheet snapshot capture + write gate.
 * Staging additive columns on `runs` — see supabase/migrations/20260907_booked_cost_freeze.sql
 */

import { NextResponse } from 'next/server'
import { writeAuditLog } from './audit-log.ts'
import {
  buildBookedCostSnapshot,
  costLineMutationBlockedReason,
  formatBookedCostFreezeAuditCopy,
  hasBookedCostSnapshot,
  isRunCostSheetFrozen,
  parseBookedCostSnapshot,
  shouldCaptureBookedCostSnapshot,
  type BookedCostSnapshot,
} from './booked-cost-freeze.ts'
import type { createAdminClient } from '@/lib/supabase/server-admin'

type AdminClient = ReturnType<typeof createAdminClient>

export type RunBookingFreezeRow = {
  id: string
  code: string
  status: string
  booked_cost_snapshot: unknown
  booked_cost_frozen_at: string | null
}

export async function loadRunBookingFreeze(
  admin: AdminClient,
  runId: string,
): Promise<RunBookingFreezeRow | null> {
  const byId = await admin
    .from('runs')
    .select('id, code, status, booked_cost_snapshot, booked_cost_frozen_at')
    .eq('id', runId)
    .maybeSingle()
  if (byId.data) return byId.data as RunBookingFreezeRow
  const byCode = await admin
    .from('runs')
    .select('id, code, status, booked_cost_snapshot, booked_cost_frozen_at')
    .eq('code', runId.toUpperCase())
    .maybeSingle()
  return (byCode.data as RunBookingFreezeRow | null) ?? null
}

export async function rejectIfBookedCostFrozen(
  admin: AdminClient,
  runId: string | null | undefined,
): Promise<NextResponse | null> {
  if (!runId) return NextResponse.json({ error: 'run_id is required' }, { status: 400 })
  const run = await loadRunBookingFreeze(admin, runId)
  if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 })
  const reason = costLineMutationBlockedReason(isRunCostSheetFrozen(run))
  if (reason) {
    return NextResponse.json({ error: reason, frozen: true, booking_status: 'BOOKED' }, { status: 409 })
  }
  return null
}

export async function captureBookedCostSnapshotIfNeeded(opts: {
  admin: AdminClient
  runId: string
  runCode: string
  nextStatus: string
  prevStatus?: string | null
  actorId?: string | null
  actorName?: string | null
}): Promise<{ captured: boolean; snapshot: BookedCostSnapshot | null }> {
  const existing = await loadRunBookingFreeze(opts.admin, opts.runId)
  const hasSnapshot = hasBookedCostSnapshot(existing?.booked_cost_snapshot)
  if (!shouldCaptureBookedCostSnapshot({
    nextStatus: opts.nextStatus,
    prevStatus: opts.prevStatus ?? existing?.status ?? null,
    hasSnapshot,
  })) {
    return { captured: false, snapshot: parseBookedCostSnapshot(existing?.booked_cost_snapshot) }
  }

  const { data: fields } = await opts.admin
    .from('cost_fields')
    .select('*')
    .eq('run_id', opts.runId)

  const capturedAt = new Date().toISOString()
  const snapshot = buildBookedCostSnapshot({
    runId: opts.runId,
    runCode: opts.runCode,
    capturedAt,
    fields: fields ?? [],
  })

  const { error } = await opts.admin
    .from('runs')
    .update({
      booked_cost_snapshot: snapshot,
      booked_cost_frozen_at: capturedAt,
      booked_cost_frozen_by: opts.actorId ?? null,
      updated_at: capturedAt,
    })
    .eq('id', opts.runId)

  if (error) {
    console.error('BOOKED cost snapshot write failed:', error.message)
    return { captured: false, snapshot: null }
  }

  if (opts.actorId) {
    const copy = formatBookedCostFreezeAuditCopy({
      actorName: opts.actorName ?? 'Someone',
      runCode: opts.runCode,
      fieldCount: snapshot.field_count,
    })
    await writeAuditLog(opts.admin, opts.actorId, [{
      table_name: 'runs',
      record_id: opts.runId,
      run_id: opts.runId,
      field_name: copy.fieldName,
      old_value: copy.oldValue,
      new_value: copy.newValue,
      change_type: 'update',
    }])
  }

  return { captured: true, snapshot }
}

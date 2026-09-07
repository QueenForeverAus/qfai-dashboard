/**
 * Shared POST handler for advancing-packet-v1 apply.
 * Routes: /api/runs/[runId]/advancing-extract (canonical)
 *         /api/runs/[runId]/apply-advancing (alias)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server-admin'
import { createClient } from '@/lib/supabase/server'
import { canEditCostFields } from '@/lib/cost-fields'
import { staffDisplayName } from '@/lib/cost-entry-source'
import { applyAdvancingPlan, planAdvancingApply } from '@/lib/advancing-extract'
import {
  envelopeToParsedPacket,
  gateAdvancingEnvelope,
  parseAdvancingEnvelope,
} from '@/lib/advancing-packet-v1'

const FORCE_ROLES = new Set(['owner', 'admin'])

export async function handleAdvancingApplyPost(
  req: NextRequest,
  runId: string,
): Promise<NextResponse> {
  const userClient = await createClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('id, role, full_name')
    .eq('id', user.id)
    .single()

  if (!profile || !canEditCostFields(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const canForce = FORCE_ROLES.has(String(profile.role ?? ''))
  const requestedForce = Boolean(
    body && typeof body === 'object' && !Array.isArray(body)
      && ((body as Record<string, unknown>).force === true
        || (body as Record<string, unknown>).force_apply === true),
  )
  const force = canForce && requestedForce

  let envelope
  try {
    envelope = parseAdvancingEnvelope(body, { force })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Invalid advancing-packet-v1' },
      { status: 400 },
    )
  }
  envelope.force = force

  const { data: run } = await admin
    .from('runs')
    .select('id, code, region')
    .eq('id', runId)
    .maybeSingle()

  if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 })

  const bodyRec = body && typeof body === 'object' && !Array.isArray(body)
    ? body as Record<string, unknown>
    : {}
  const requestedShow = String(bodyRec.show_id ?? envelope.packets[0]?.show_id ?? '').trim()

  for (const packet of envelope.packets) {
    if (packet.run_id && packet.run_id !== runId) {
      return NextResponse.json(
        { error: 'run_id does not match this run' },
        { status: 400 },
      )
    }
    if (requestedShow && packet.show_id && packet.show_id !== requestedShow) {
      return NextResponse.json(
        { error: 'show_id is inconsistent across the envelope' },
        { status: 400 },
      )
    }
  }

  const gate = gateAdvancingEnvelope(envelope, { runId, showId: requestedShow })
  if (!gate.ok) {
    return NextResponse.json(
      { error: gate.error, soft_flags: gate.soft_flags, applied: [], skipped: [], superseded: [], audit: [] },
      { status: gate.status },
    )
  }

  if (!requestedShow) {
    return NextResponse.json({ error: 'show_id is required' }, { status: 400 })
  }

  const { data: show } = await admin
    .from('shows')
    .select('id, run_id, venue_name, venue_city')
    .eq('id', requestedShow)
    .maybeSingle()

  if (!show || show.run_id !== run.id) {
    return NextResponse.json({ error: 'Show not found on this run' }, { status: 404 })
  }

  let packet
  try {
    packet = envelopeToParsedPacket(envelope, {
      runId: run.id,
      showId: show.id,
      runGroup: run.region,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Invalid advancing packet' },
      { status: 400 },
    )
  }

  const plan = planAdvancingApply(packet, {
    forceApply: force,
    runGroup: packet.runGroup ?? run.region,
  })

  try {
    const result = await applyAdvancingPlan({
      admin,
      userId: user.id,
      actorName: staffDisplayName(profile.full_name) || 'Someone',
      runId: run.id,
      showId: show.id,
      venueName: show.venue_name || show.venue_city || packet.venueShortName,
      role: profile.role,
      packet,
      plan,
      forceApply: force,
    })
    return NextResponse.json({
      applied: result.applied,
      skipped: result.skipped,
      superseded: result.superseded,
      audit: result.audit,
      status: result.status,
      source_note: result.source_note,
      apply_id: result.apply_id,
      soft_flags: result.soft_flags,
      queue_reason: result.queue_reason,
      fields: result.fields,
    })
  } catch (err) {
    console.error('advancing-extract apply failed', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Apply failed' },
      { status: 500 },
    )
  }
}

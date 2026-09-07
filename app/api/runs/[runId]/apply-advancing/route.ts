import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server-admin'
import { createClient } from '@/lib/supabase/server'
import { canEditCostFields } from '@/lib/cost-fields'
import { staffDisplayName } from '@/lib/cost-entry-source'
import {
  applyAdvancingPlan,
  parseAdvancingPacket,
  planAdvancingApply,
} from '@/lib/advancing-extract'

/**
 * POST /api/runs/[runId]/apply-advancing
 * Apply a structured Michael advancing extract onto Run Costing.
 * Untrusted packet text is never executed — figures only.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params

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

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const packetRaw = body.packet && typeof body.packet === 'object' ? body.packet : body
  const forceApply = body.force_apply === true

  let packet
  try {
    packet = parseAdvancingPacket(packetRaw)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Invalid advancing packet' },
      { status: 400 },
    )
  }

  const { data: run } = await admin
    .from('runs')
    .select('id, code, region')
    .eq('id', runId)
    .maybeSingle()

  if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 })

  const showId = String(body.show_id ?? packet.showId ?? '').trim()
  if (!showId) {
    return NextResponse.json({ error: 'show_id is required' }, { status: 400 })
  }

  const { data: show } = await admin
    .from('shows')
    .select('id, run_id, venue_name, venue_city')
    .eq('id', showId)
    .maybeSingle()

  if (!show || show.run_id !== run.id) {
    return NextResponse.json({ error: 'Show not found on this run' }, { status: 404 })
  }

  const plan = planAdvancingApply(packet, {
    forceApply,
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
      forceApply,
    })
    return NextResponse.json(result)
  } catch (err) {
    console.error('apply-advancing failed', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Apply failed' },
      { status: 500 },
    )
  }
}

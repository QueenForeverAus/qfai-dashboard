import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server-admin'
import { createClient } from '@/lib/supabase/server'
import { staffDisplayName } from '@/lib/cost-entry-source'
import { isBookedBookingStatus } from '@/lib/booked-cost-freeze'
import { isAdvancingWorkspaceActive } from '@/lib/run-advancing'
import { loadActiveAdvancingWorkspace } from '@/lib/run-advancing-persist'
import { persistReceiptApply } from '@/lib/receipts/apply-persist'
import { hotelReceiptFixtureById } from '@/lib/receipts/hotel-fixtures'
import { parseReceiptExtractPacket } from '@/lib/receipts/packet'

async function resolveRun(
  admin: ReturnType<typeof createAdminClient>,
  runIdOrCode: string,
): Promise<{ id: string; code: string; status: string } | null> {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(runIdOrCode)) {
    const { data } = await admin.from('runs').select('id, code, status').eq('id', runIdOrCode).maybeSingle()
    return data
  }
  const { data } = await admin
    .from('runs')
    .select('id, code, status')
    .eq('code', runIdOrCode.toUpperCase())
    .maybeSingle()
  return data
}

/**
 * POST /api/runs/[runId]/advancing-receipts/apply
 * Owner/admin. Preview (default) or confirm-apply a hotel receipt extract.
 * Writes advancing_cost_fields + worksheet + checklist only.
 * Portal paste UI was removed in W2 — this route stays for the W3 scraper.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId: runIdParam } = await params
  const userClient = await createClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single()

  if (!profile || !['owner', 'admin'].includes(String(profile.role))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const run = await resolveRun(admin, runIdParam)
  if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 })

  const body = await req.json().catch(() => ({})) as {
    packet?: unknown
    fixture_id?: string
    preview?: boolean
    confirm?: boolean
  }

  let packet: unknown = body.packet
  if (body.fixture_id) {
    const fixture = hotelReceiptFixtureById(String(body.fixture_id))
    if (!fixture) {
      return NextResponse.json({ error: `Unknown fixture_id ${body.fixture_id}` }, { status: 400 })
    }
    packet = fixture.packet
  }
  if (packet == null) {
    return NextResponse.json({ error: 'packet or fixture_id is required' }, { status: 400 })
  }

  const parsed = parseReceiptExtractPacket(packet)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  if (!isBookedBookingStatus(run.status)) {
    return NextResponse.json({
      error: run.status === 'proposed'
        ? 'Never apply a receipt extract on a proposed-only run. BOOK the run first so Run Advancing exists.'
        : 'Receipt apply is only available on BOOKED runs with an active Advancing workspace.',
      preview: {
        ok: false,
        writes_cost_fields: false,
      },
    }, { status: 409 })
  }

  const workspace = await loadActiveAdvancingWorkspace(admin, run.id)
  if (!workspace || !isAdvancingWorkspaceActive(workspace)) {
    return NextResponse.json({
      error: 'No active Run Advancing workspace. BOOK the run to copy the cost sheet, then apply here.',
      preview: { ok: false, writes_cost_fields: false },
    }, { status: 409 })
  }

  const previewOnly = body.confirm !== true

  try {
    const result = await persistReceiptApply({
      admin,
      runId: run.id,
      workspaceId: workspace.id,
      bookingStatus: run.status,
      packet: parsed.packet,
      actorUserId: user.id,
      actorName: staffDisplayName(profile.full_name) ?? 'Someone',
      previewOnly,
    })

    if (!result.preview.ok) {
      return NextResponse.json({
        error: result.preview.error,
        preview: result.preview,
        applied: false,
      }, { status: 422 })
    }

    return NextResponse.json({
      applied: result.applied,
      preview: result.preview,
      accommodation_field_id: result.accommodation_field_id,
      ticked_ids: result.ticked_ids,
      writes_cost_fields: false,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Apply failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

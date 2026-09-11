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
import { formatTravelScrapeApplyMoneyResponse } from '@/lib/travel-scrape/apply-engine'
import { persistTravelScrapeApply } from '@/lib/travel-scrape/apply-persist'
import { travelScrapeFixtureById } from '@/lib/travel-scrape/fixtures'
import { resolveTravelScrapeApplyAuth } from '@/lib/travel-scrape/machine-auth'
import { peekTravelScrapeSchema } from '@/lib/travel-scrape/packet'

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
 * Owner/admin session, or staging machine token (travel-scrape-packet-v1):
 *   Authorization: Bearer $TRAVEL_SCRAPE_APPLY_SECRET
 *   or x-qfai-travel-scrape-key: $TRAVEL_SCRAPE_APPLY_SECRET
 * Money/PAID still needs confirm_money / money_confirmed_by. Never writes Costings.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId: runIdParam } = await params
  const admin = createAdminClient()

  let sessionUserId: string | null = null
  let sessionRole: string | null = null
  let sessionName: string | null = null
  if (!req.headers.get('authorization') && !req.headers.get('x-qfai-travel-scrape-key')) {
    const userClient = await createClient()
    const { data: { user } } = await userClient.auth.getUser()
    if (user) {
      const { data: profile } = await admin
        .from('profiles')
        .select('role, full_name')
        .eq('id', user.id)
        .single()
      sessionUserId = user.id
      sessionRole = profile?.role ? String(profile.role) : null
      sessionName = staffDisplayName(profile?.full_name) ?? null
    }
  }

  const auth = resolveTravelScrapeApplyAuth({
    authorizationHeader: req.headers.get('authorization'),
    travelScrapeKeyHeader: req.headers.get('x-qfai-travel-scrape-key'),
    sessionUserId,
    sessionRole,
    sessionName,
    secret: process.env.TRAVEL_SCRAPE_APPLY_SECRET ?? null,
    vercelEnv: process.env.VERCEL_ENV ?? null,
  })
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const run = await resolveRun(admin, runIdParam)
  if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 })

  const url = new URL(req.url)
  const body = await req.json().catch(() => ({})) as {
    packet?: unknown
    fixture_id?: string
    preview?: boolean
    confirm?: boolean
    confirm_money?: boolean
    money_confirmed_by?: string
  }

  let packet: unknown = body.packet
  if (body.fixture_id) {
    const travelFixture = travelScrapeFixtureById(String(body.fixture_id))
    const hotelFixture = hotelReceiptFixtureById(String(body.fixture_id))
    if (travelFixture) packet = travelFixture.packet
    else if (hotelFixture) packet = hotelFixture.packet
    else {
      return NextResponse.json({ error: `Unknown fixture_id ${body.fixture_id}` }, { status: 400 })
    }
  }
  if (packet == null) {
    return NextResponse.json({ error: 'packet or fixture_id is required' }, { status: 400 })
  }

  if (peekTravelScrapeSchema(packet)) {
    return handleTravelScrapeApply({
      reqUrl: url,
      body,
      admin,
      run,
      actorUserId: auth.actor.actorUserId,
      actorName: auth.actor.actorName,
      packet,
    })
  }

  if (auth.actor.kind === 'machine') {
    return NextResponse.json({
      error: 'Machine auth is travel-scrape-packet-v1 only.',
    }, { status: 403 })
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
      actorUserId: auth.actor.actorUserId ?? '',
      actorName: auth.actor.actorName,
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

async function handleTravelScrapeApply(opts: {
  reqUrl: URL
  body: {
    preview?: boolean
    confirm_money?: boolean
    money_confirmed_by?: string
  }
  admin: ReturnType<typeof createAdminClient>
  run: { id: string; code: string; status: string }
  actorUserId: string | null
  actorName: string
  packet: unknown
}) {
  if (!isBookedBookingStatus(opts.run.status)) {
    return NextResponse.json({
      error: opts.run.status === 'proposed'
        ? 'Never attach a travel scrape on a proposed-only run. BOOK the run first so Run Advancing exists.'
        : 'Travel scrape apply is only available on BOOKED runs with an active Advancing workspace.',
      schema_version: 'travel-scrape-packet-v1',
      applied: false,
      writes_cost_fields: false,
    }, { status: 409 })
  }

  const workspace = await loadActiveAdvancingWorkspace(opts.admin, opts.run.id)
  if (!workspace || !isAdvancingWorkspaceActive(workspace)) {
    return NextResponse.json({
      error: 'No active Run Advancing workspace. BOOK the run to copy the cost sheet, then apply here.',
      schema_version: 'travel-scrape-packet-v1',
      applied: false,
      writes_cost_fields: false,
    }, { status: 409 })
  }

  const confirmMoney = opts.reqUrl.searchParams.get('confirm_money') === 'true'
    || opts.body.confirm_money === true
  const moneyConfirmedBy = typeof opts.body.money_confirmed_by === 'string'
    ? opts.body.money_confirmed_by
    : null
  const previewOnly = opts.body.preview === true

  try {
    const result = await persistTravelScrapeApply({
      admin: opts.admin,
      runId: opts.run.id,
      runCode: opts.run.code,
      workspaceId: workspace.id,
      bookingStatus: opts.run.status,
      packet: opts.packet,
      actorUserId: opts.actorUserId,
      actorName: opts.actorName,
      previewOnly,
      confirmMoney,
      moneyConfirmedBy,
    })

    if (!result.preview.ok) {
      const status = /proposed|BOOKED|workspace|production/i.test(result.preview.error ?? '')
        ? 409
        : 422
      return NextResponse.json({
        error: result.preview.error,
        schema_version: 'travel-scrape-packet-v1',
        applied: false,
        preview: result.preview,
        money: formatTravelScrapeApplyMoneyResponse({
          plan: result.preview.money,
          moneyFieldId: result.money_field_id,
        }),
        writes_cost_fields: false,
      }, { status })
    }

    return NextResponse.json({
      schema_version: 'travel-scrape-packet-v1',
      applied: result.applied,
      details: result.preview.details,
      checklist: {
        applied: result.preview.checklist.will_apply,
        ticked_ids: result.ticked_ids,
        ticked_keys: result.ticked_keys,
        source_note: result.preview.checklist.source_note,
        skipped_keys: result.preview.checklist.skipped_keys,
      },
      money: formatTravelScrapeApplyMoneyResponse({
        plan: result.preview.money,
        moneyFieldId: result.money_field_id,
      }),
      travel_blocks: result.preview.next_travel_blocks,
      preview: result.preview,
      writes_cost_fields: false,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Apply failed'
    return NextResponse.json({ error: message, writes_cost_fields: false }, { status: 500 })
  }
}

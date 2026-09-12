import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server-admin'
import { createClient } from '@/lib/supabase/server'
import { staffDisplayName } from '@/lib/cost-entry-source'
import { getSettlementsActor, resolveSettlementsRun } from '@/lib/settlements-access'
import { persistSettlementScrapeApply, pickOccurredShow } from '@/lib/settlement-scrape/apply-persist'
import { settlementScrapeFixtureById } from '@/lib/settlement-scrape/fixtures'
import { peekSettlementScrapeSchema } from '@/lib/settlement-scrape/packet'
import { resolveTravelScrapeApplyAuth } from '@/lib/travel-scrape/machine-auth'

/**
 * POST /api/settlements/[runId]/email-scrape/apply
 * Owner/admin session, or staging machine token (same as travel-scrape):
 *   Authorization: Bearer $TRAVEL_SCRAPE_APPLY_SECRET
 *   or x-qfai-travel-scrape-key: $TRAVEL_SCRAPE_APPLY_SECRET
 * Staging-safe. Never auto-sends. Money/PAID needs confirm_money / money_confirmed_by
 * and still does not mark PAID from a settlement/remittance scrape.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params
  const admin = createAdminClient()

  let sessionUserId: string | null = null
  let sessionRole: string | null = null
  let sessionName: string | null = null
  if (!req.headers.get('authorization') && !req.headers.get('x-qfai-travel-scrape-key')) {
    const actor = await getSettlementsActor()
    if (actor) {
      sessionUserId = actor.userId
      sessionRole = actor.role
      sessionName = actor.fullName
    } else {
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

  const run = await resolveSettlementsRun(admin, runId)
  if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 })
  const { data: runStatusRow } = await admin
    .from('runs')
    .select('status')
    .eq('id', run.id)
    .maybeSingle()
  const bookingStatus = String(runStatusRow?.status ?? '')

  const url = new URL(req.url)
  const body = await req.json().catch(() => ({})) as {
    packet?: unknown
    fixture_id?: string
    preview?: boolean
    confirm?: boolean
    confirm_money?: boolean
    money_confirmed_by?: string
    show_id?: string | null
    send?: boolean
  }

  if (body.send) {
    return NextResponse.json({
      error: 'Settlement email scrape never auto-sends. Operator sends.',
      sent: false,
    }, { status: 400 })
  }

  let packet: unknown = body.packet
  if (body.fixture_id) {
    const fixture = settlementScrapeFixtureById(String(body.fixture_id))
    if (!fixture) {
      return NextResponse.json({ error: `Unknown fixture_id ${body.fixture_id}` }, { status: 400 })
    }
    packet = fixture.packet
  }
  if (packet == null) {
    return NextResponse.json({ error: 'packet or fixture_id is required' }, { status: 400 })
  }
  if (!peekSettlementScrapeSchema(packet) && body.fixture_id == null) {
    const peeked = packet as { schema_version?: unknown }
    if (peeked?.schema_version && peeked.schema_version !== 'settlement-scrape-packet-v1') {
      return NextResponse.json({
        error: 'This route accepts settlement-scrape-packet-v1 only.',
      }, { status: 400 })
    }
  }

  const { data: shows } = await admin
    .from('shows')
    .select('id, show_date, venue_name, run_id')
    .eq('run_id', run.id)

  const show = pickOccurredShow(shows ?? [], body.show_id)
  if (!show) {
    return NextResponse.json({
      error: 'Data not yet available — check back when the show has occurred.',
      applied: false,
      sent: false,
      writes_cost_fields: false,
    }, { status: 409 })
  }

  const confirmMoney = url.searchParams.get('confirm_money') === 'true'
    || body.confirm_money === true
  const moneyConfirmedBy = typeof body.money_confirmed_by === 'string'
    ? body.money_confirmed_by
    : null
  const previewOnly = body.preview === true || body.confirm === false

  try {
    const result = await persistSettlementScrapeApply({
      admin,
      runId: run.id,
      runCode: run.code,
      bookingStatus,
      showId: show.id,
      showDates: (shows ?? []).map(s => s.show_date),
      packet,
      actorUserId: auth.actor.actorUserId,
      actorName: auth.actor.actorName,
      previewOnly,
      confirmMoney,
      moneyConfirmedBy,
    })

    if (!result.preview.ok) {
      const status = /production|proposed|occurred|available/i.test(result.preview.error ?? '')
        ? 409
        : 422
      return NextResponse.json({
        error: result.preview.error,
        schema_version: result.preview.schema_version,
        applied: false,
        sent: false,
        preview: result.preview,
        writes_cost_fields: false,
      }, { status })
    }

    return NextResponse.json({
      schema_version: result.preview.schema_version,
      kind: result.preview.kind,
      applied: result.applied,
      sent: false,
      actual_ids: result.actual_ids,
      remittance_ids: result.remittance_ids,
      shows_tickets_sold: result.shows_tickets_sold,
      source_note: result.preview.source_note,
      writes_paid: false,
      writes_cost_fields: false,
      money_action: result.preview.money_action,
      money_reason: result.preview.money_reason,
      preview: result.preview,
      note: 'Draft ingest only — email not sent. PAID not auto.',
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Apply failed'
    return NextResponse.json({
      error: message,
      sent: false,
      writes_cost_fields: false,
    }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server-admin'
import { getSettlementsActor } from '@/lib/settlements-access'
import {
  isSettlementsSeedTargetAllowed,
  sampleFixtureInventory,
  SETTLEMENTS_SAMPLE_CONFIRM,
  SETTLEMENTS_SAMPLE_CODES,
  SETTLEMENTS_SEED_PROTECTED_CODES,
  STAGING_SUPABASE_PROJECT_REF,
} from '@/lib/settlements-sample-fixtures'
import { SeedTargetError, seedSettlementsSamples } from '@/lib/settlements-sample-seed'

/**
 * Staging-only SAMPLE completed-show seed (SAMP01–SAMP08).
 *
 * GET  — inventory + invoke notes. Does not write.
 * POST — idempotent upsert. Body must include { "confirm": "SAMPLE_ONLY" }.
 *
 * Never touches R01, TRECV1, TCOMP1, R12. Hard-refuses prod Supabase URLs.
 *
 * Invoke on staging (signed in as admin/owner, or SETTLEMENTS_SEED_TOKEN):
 *
 *   curl -sS -X POST "$STAGING/api/admin/seed-settlements-samples" \
 *     -H "Content-Type: application/json" \
 *     -H "Cookie: $STAGING_SESSION_COOKIE" \
 *     -d '{"confirm":"SAMPLE_ONLY"}'
 *
 * Optional header when SETTLEMENTS_SEED_TOKEN is set on the staging env:
 *   -H "x-settlements-seed-token: $SETTLEMENTS_SEED_TOKEN"
 */
export async function GET() {
  const blocked = refuseProd()
  if (blocked) return blocked
  return NextResponse.json({
    ok: true,
    staging_only: true,
    confirm: SETTLEMENTS_SAMPLE_CONFIRM,
    codes: SETTLEMENTS_SAMPLE_CODES,
    protected_codes: SETTLEMENTS_SEED_PROTECTED_CODES,
    inventory: sampleFixtureInventory(),
    invoke: {
      method: 'POST',
      path: '/api/admin/seed-settlements-samples',
      body: { confirm: SETTLEMENTS_SAMPLE_CONFIRM },
      note: 'Idempotent. Staging admin/owner session or x-settlements-seed-token. Never run on prod.',
    },
  })
}

export async function POST(req: NextRequest) {
  const blocked = refuseProd()
  if (blocked) return blocked

  const auth = await authorizeSeed(req)
  if (!auth.ok) return auth.res

  const body = await req.json().catch(() => ({})) as { confirm?: string }
  if (body.confirm !== SETTLEMENTS_SAMPLE_CONFIRM) {
    return NextResponse.json({
      error: `Body must include confirm: "${SETTLEMENTS_SAMPLE_CONFIRM}"`,
    }, { status: 400 })
  }

  try {
    const result = await seedSettlementsSamples({
      admin: createAdminClient(),
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
      actorId: auth.actorId,
    })
    return NextResponse.json({
      ...result,
      inventory: sampleFixtureInventory(),
      note: 'SAMPLE/DEMO only. Re-run safe. Protected staging runs were not touched.',
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Seed failed'
    const status = err instanceof SeedTargetError ? err.status : 500
    return NextResponse.json({ error: message }, { status })
  }
}

function refuseProd(): NextResponse | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  if (isSettlementsSeedTargetAllowed(url)) return null
  return NextResponse.json({
    error: 'SAMPLE seed is staging-only and will not run against production Supabase.',
    staging_ref: STAGING_SUPABASE_PROJECT_REF,
  }, { status: 403 })
}

async function authorizeSeed(req: NextRequest): Promise<
  { ok: true; actorId: string | null } | { ok: false; res: NextResponse }
> {
  const token = process.env.SETTLEMENTS_SEED_TOKEN
  const header = req.headers.get('x-settlements-seed-token')
  if (token && header && header === token) {
    return { ok: true, actorId: null }
  }

  const actor = await getSettlementsActor()
  if (actor) return { ok: true, actorId: actor.userId }

  return {
    ok: false,
    res: NextResponse.json({
      error: 'Unauthorised. Sign in as admin/owner or send x-settlements-seed-token.',
    }, { status: 401 }),
  }
}

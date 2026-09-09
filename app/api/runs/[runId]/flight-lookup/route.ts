import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server-admin'
import { createClient } from '@/lib/supabase/server'
import { canEditWorksheet } from '@/lib/worksheet-fields'
import {
  airportCallFromDep,
  flightLookupEnvFromProcess,
  lookupFlightSchedule,
  resolveFlightTravelBand,
} from '@/lib/flight-lookup'

async function resolveRun(
  supabase: ReturnType<typeof createAdminClient>,
  runIdOrCode: string,
): Promise<{ id: string; code: string; region: string | null } | null> {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(runIdOrCode)) {
    const { data } = await supabase
      .from('runs')
      .select('id, code, region')
      .eq('id', runIdOrCode)
      .maybeSingle()
    return data
  }
  const { data } = await supabase
    .from('runs')
    .select('id, code, region')
    .eq('code', runIdOrCode.toUpperCase())
    .maybeSingle()
  return data
}

/**
 * POST /api/runs/[runId]/flight-lookup
 * Schedule lookup only — never writes travel_blocks, Advancing money, or cost_fields.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId: runIdParam } = await params
  const userClient = await createClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const supabase = createAdminClient()
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || !canEditWorksheet(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const run = await resolveRun(supabase, runIdParam)
  if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 })

  const body = await req.json().catch(() => ({})) as {
    flight_number?: unknown
    date?: unknown
  }
  const flightNumber = typeof body.flight_number === 'string' ? body.flight_number : ''
  const date = typeof body.date === 'string' ? body.date : ''

  const host = req.headers.get('host')
  const result = await lookupFlightSchedule(
    flightNumber,
    date,
    flightLookupEnvFromProcess({ host }),
  )

  const travelBand = resolveFlightTravelBand(run.region)
  const suggestedAirportCall = result.ok
    ? airportCallFromDep(result.schedule.dep_time, travelBand)
    : ''

  return NextResponse.json({
    ok: result.ok,
    error: result.error,
    code: result.code,
    provider: result.provider,
    schedule: result.schedule,
    travel_band: travelBand,
    suggested_airport_call: suggestedAirportCall || null,
    writes_cost_fields: false,
  })
}

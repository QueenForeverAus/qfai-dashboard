import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/server-admin'
import {
  calendarDateInZone,
  includeInOnsaleTracker,
  isTrackerOnSale,
  parseOnsaleFilter,
  resolveOnsaleNow,
  type OnsaleTrackerRecord,
} from '@/lib/onsale-tracker'
import OnsaleTrackerClient, { type OnsaleHistoryItem, type OnsaleShowCard } from './OnsaleTrackerClient'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'On-sale tracker — Queen Forever Tours',
}

type RunJoin = { code: string } | { code: string }[] | null

type ShowRow = {
  id: string
  show_date: string | null
  venue_name: string
  venue_city: string | null
  state_territory: string | null
  harbour_status: string | null
  runs: RunJoin
}

function firstParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

function runCodeOf(runs: RunJoin): string | null {
  if (!runs) return null
  const run = Array.isArray(runs) ? runs[0] : runs
  return run?.code ?? null
}

export default async function OnsaleTrackerPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string | string[]; now?: string | string[] }>
}) {
  const userClient = await createClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || !['owner', 'admin'].includes(profile.role)) {
    redirect('/runs')
  }

  const query = await searchParams
  const clock = resolveOnsaleNow({
    nowParam: firstParam(query.now),
    vercelEnv: process.env.VERCEL_ENV,
    testClockFlag: process.env.ONSALE_TRACKER_TEST_CLOCK,
  })
  const filter = parseOnsaleFilter(firstParam(query.filter))

  const [{ data: shows, error: showsError }, { data: trackers, error: trackerError }] = await Promise.all([
    admin
      .from('shows')
      .select('id, show_date, venue_name, venue_city, state_territory, harbour_status, runs!inner(code)'),
    admin.from('onsale_tracker').select('*'),
  ])

  const loadError = showsError?.message ?? trackerError?.message ?? null
  const trackerByShow = new Map<string, OnsaleTrackerRecord>()
  if (!trackerError) {
    for (const row of (trackers ?? []) as OnsaleTrackerRecord[]) {
      trackerByShow.set(row.show_id, row)
    }
  }

  const today = calendarDateInZone(clock.now)
  const cards: OnsaleShowCard[] = loadError
    ? []
    : ((shows ?? []) as ShowRow[]).flatMap(show => {
      const tracker = trackerByShow.get(show.id) ?? null
      const include = includeInOnsaleTracker({
        showDate: show.show_date,
        harbourStatus: show.harbour_status,
        hasTracker: tracker != null,
        onSale: isTrackerOnSale(tracker, clock.now),
        today,
      })
      if (!include) return []
      const card: OnsaleShowCard = {
        id: show.id,
        showDate: show.show_date,
        venueName: show.venue_name,
        venueCity: show.venue_city,
        stateTerritory: show.state_territory,
        runCode: runCodeOf(show.runs),
        tracker,
      }
      return [card]
    })

  const showIds = cards.map(card => card.id)
  let history: OnsaleHistoryItem[] = []
  let historyErrorMessage: string | null = null
  if (!loadError && showIds.length > 0) {
    const { data: historyRows, error: historyError } = await admin
      .from('onsale_tracker_history')
      .select('id, show_id, field, old_value, new_value, actor, changed_at, source')
      .in('show_id', showIds)
      .order('changed_at', { ascending: false })
      .order('id', { ascending: false })
    if (historyError) {
      history = []
      historyErrorMessage = historyError.message
    } else {
      const actorIds = [...new Set((historyRows ?? []).map(row => row.actor).filter((id): id is string => Boolean(id)))]
      const nameById = new Map<string, string>()
      if (actorIds.length > 0) {
        const { data: profiles } = await admin
          .from('profiles')
          .select('id, full_name, email')
          .in('id', actorIds)
        for (const profileRow of profiles ?? []) {
          const fullName = typeof profileRow.full_name === 'string' ? profileRow.full_name.trim() : ''
          const email = typeof profileRow.email === 'string' ? profileRow.email.trim() : ''
          nameById.set(profileRow.id, fullName || email || 'unknown')
        }
      }
      history = (historyRows ?? []).map(row => ({
        id: String(row.id),
        showId: row.show_id as string,
        field: row.field as string,
        oldValue: (row.old_value as string | null) ?? null,
        newValue: (row.new_value as string | null) ?? null,
        actorLabel: row.actor ? (nameById.get(row.actor) ?? 'unknown') : 'unknown',
        changedAt: row.changed_at as string,
        source: (row.source as string) ?? 'manual',
      }))
    }
  }

  return (
    <OnsaleTrackerClient
      shows={cards}
      history={history}
      nowIso={clock.now.toISOString()}
      testClock={clock.active}
      filter={filter}
      nowParam={clock.active ? firstParam(query.now) : null}
      loadError={loadError ?? historyErrorMessage}
    />
  )
}

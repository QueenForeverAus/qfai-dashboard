import { createAdminClient } from '@/lib/supabase/server-admin'
import { createClient } from '@/lib/supabase/server'
import { syncRunDatesFromShows } from '@/lib/run-dates'
import { normalizeCapacityBands, topBandSeats } from '@/lib/capacity-bands'
import { NextRequest, NextResponse } from 'next/server'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  // Auth check — owner/admin only
  const userClient = await createClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const supabase = createAdminClient()
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || !['owner', 'admin'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()

  // Only allow safe fields to be updated
  const allowed = ['venue_name', 'venue_city', 'state_territory', 'show_date', 'capacity', 'capacity_bands', 'ticket_price', 'ticket_outlook', 'ticket_outlook_level', 'ticket_outlook_status', 'ticket_outlook_as_of', 'ticket_outlook_sources', 'michael_notes', 'venue_address', 'venue_phone', 'venue_contact', 'sets_label', 'production_company', 'production_contact', 'backline_company', 'backline_contact', 'sched_access', 'sched_soundcheck', 'sched_dinner', 'sched_doors', 'sched_show', 'sched_finish', 'travel_access_notes', 'hotel_notes', 'hospitality_merch_notes']
  const updates: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) updates[key] = body[key] === '' ? null : body[key]
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  // Normalize capacity_bands; keep shows.capacity = top band when bands present.
  // Never touch venue_staff from this path.
  if ('capacity_bands' in updates) {
    const bands = normalizeCapacityBands(updates.capacity_bands)
    updates.capacity_bands = bands.length ? bands : null
    const top = topBandSeats(bands, typeof updates.capacity === 'number' ? updates.capacity : null)
    if (top != null) updates.capacity = top
  }

  const { data, error } = await supabase
    .from('shows')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Keep denormalized runs.start_date / end_date in sync with shows.show_date (SoT)
  if (data?.run_id) {
    try {
      await syncRunDatesFromShows(supabase, data.run_id)
    } catch (syncErr) {
      const msg = syncErr instanceof Error ? syncErr.message : 'Failed to sync run dates'
      return NextResponse.json({ error: msg }, { status: 500 })
    }
  }

  return NextResponse.json(data)
}

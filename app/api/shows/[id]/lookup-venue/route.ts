import { createAdminClient } from '@/lib/supabase/server-admin'
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { SHOW_SELECT_COLS, canEditWorksheet } from '@/lib/worksheet-fields'

/**
 * Lookup venue address via OpenStreetMap Nominatim.
 * Only fills venue_address (and never invents phone — Nominatim rarely has it).
 * Does not overwrite non-empty venue_address / venue_phone.
 *
 * Docs: https://nominatim.org/release-docs/latest/api/Search/
 * User-Agent required: QueenForever QFAI
 */
async function nominatimSearch(q: string): Promise<{ display_name?: string } | null> {
  const url = new URL('https://nominatim.openstreetmap.org/search')
  url.searchParams.set('q', q)
  url.searchParams.set('format', 'json')
  url.searchParams.set('limit', '1')
  url.searchParams.set('addressdetails', '0')

  const res = await fetch(url.toString(), {
    headers: {
      'User-Agent': 'QueenForever-QFAI/1.0 (worksheet venue lookup; contact: staging)',
      Accept: 'application/json',
    },
    // Nominatim usage policy: max 1 req/s — fine for on-demand lookup
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) return null
  const data = await res.json()
  if (!Array.isArray(data) || data.length === 0) return null
  return data[0] as { display_name?: string }
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
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

  const { data: show, error: showErr } = await supabase
    .from('shows')
    .select('id, venue_name, venue_city, state_territory, venue_address, venue_phone')
    .eq('id', id)
    .single()

  if (showErr) return NextResponse.json({ error: showErr.message }, { status: 500 })
  if (!show) return NextResponse.json({ error: 'Show not found' }, { status: 404 })

  const hasAddress = !!(show.venue_address && show.venue_address.trim())
  const hasPhone = !!(show.venue_phone && show.venue_phone.trim())

  if (hasAddress && hasPhone) {
    return NextResponse.json({
      show,
      looked_up: false,
      message: 'Address and phone already set — not overwritten',
    })
  }

  const parts = [show.venue_name, show.venue_city, show.state_territory].filter(Boolean)
  if (parts.length < 2) {
    return NextResponse.json({
      show,
      looked_up: false,
      message: 'Could not find — fill manually (need venue name + city)',
    })
  }

  let result: { display_name?: string } | null = null
  try {
    result = await nominatimSearch(parts.join(', '))
    // Fallback: venue + city only
    if (!result?.display_name && show.state_territory) {
      result = await nominatimSearch(`${show.venue_name}, ${show.venue_city}`)
    }
  } catch {
    return NextResponse.json({
      show,
      looked_up: false,
      message: 'Could not find — fill manually (lookup failed)',
    })
  }

  const address = result?.display_name?.trim() || null
  if (!address) {
    return NextResponse.json({
      show,
      looked_up: false,
      message: 'Could not find — fill manually',
    })
  }

  // Flag-don't-guess: only write address if empty; never invent phone
  const updates: Record<string, string> = {}
  if (!hasAddress) updates.venue_address = address

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({
      show,
      looked_up: false,
      message: 'Nothing to update',
    })
  }

  const { data: updated, error: updErr } = await supabase
    .from('shows')
    .update(updates)
    .eq('id', id)
    .select(SHOW_SELECT_COLS)
    .single()

  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

  return NextResponse.json({
    show: updated,
    looked_up: true,
    message: hasPhone
      ? 'Looked up address'
      : 'Looked up address (phone still TBC — Nominatim does not provide phones)',
  })
}

/**
 * Owner/admin upload of the weekly ticket-sales workbook.
 * Replaces snapshot rows for each weekly date in the file. Does not change pace.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getAdminOwnerActor } from '@/lib/admin-access'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/server-admin'
import { replaceTicketSalesSnapshots, snapshotDatesForScope } from '@/lib/ticket-sales-persist'
import { parseTicketSalesWorkbook } from '@/lib/ticket-sales-sheet'
import type { IdentityShow } from '@/lib/show-identity-match'

export const runtime = 'nodejs'
export const maxDuration = 60

type PortalShowRow = {
  id: string
  show_date: string | null
  venue_name: string
  venue_city: string | null
  harbour_status: string | null
  runs: { code: string; status: string } | { code: string; status: string }[] | null
}

function asIdentity(row: PortalShowRow): IdentityShow {
  const run = Array.isArray(row.runs) ? row.runs[0] : row.runs
  return {
    id: row.id,
    show_date: row.show_date,
    venue_name: row.venue_name,
    venue_city: row.venue_city,
    harbour_status: row.harbour_status,
    run_status: run?.status ?? null,
  }
}

export async function POST(req: NextRequest) {
  const userClient = await createClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const actor = await getAdminOwnerActor()
  if (!actor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const form = await req.formData()
  const file = form.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
  }

  let parsed
  try {
    parsed = parseTicketSalesWorkbook(await file.arrayBuffer())
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 422 })
  }

  const scope = typeof form.get('scope') === 'string' ? String(form.get('scope')) : 'all'
  const dates = snapshotDatesForScope(parsed.weekDates, scope)
  const admin = createAdminClient()
  const { data: shows, error: showsError } = await admin
    .from('shows')
    .select('id, show_date, venue_name, venue_city, harbour_status, runs!inner(code, status)')
  if (showsError) return NextResponse.json({ error: showsError.message }, { status: 500 })

  try {
    const snapshots = await replaceTicketSalesSnapshots(admin, {
      parsed,
      dates,
      sourceFile: file.name,
      ingestedBy: actor.userId,
      portalShows: ((shows ?? []) as PortalShowRow[]).map(asIdentity),
    })
    return NextResponse.json({
      sheet: parsed.sheetName,
      source_file: file.name,
      shows_in_sheet: parsed.shows.length,
      snapshots,
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}

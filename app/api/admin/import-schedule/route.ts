import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server-admin'
import { createClient } from '@/lib/supabase/server'
import * as XLSX from 'xlsx'

type SheetShow = {
  show_date: string
  venue_name: string
  venue_city: string
  state_territory: string | null
  capacity: number | null
  harbour_status: string
}

type DBShow = {
  id: string
  show_date: string
  venue_name: string
  venue_city: string
  state_territory: string | null
  capacity: number | null
  run_id: string
  run_code: string
  run_status: string
}

type ShowDiff = {
  show_id: string
  run_code: string
  show_date: string
  venue_city: string
  changes: Record<string, { from: unknown; to: unknown }>
}

type RunStatusChange = {
  run_id: string
  run_code: string
  old_status: string
  new_status: string
}

export type ImportPreview = {
  source_file: string
  sheet_shows: number
  db_shows: number
  updates: ShowDiff[]
  run_status_changes: RunStatusChange[]
  new_in_sheet: SheetShow[]
  removed_from_sheet: DBShow[]
}

// ── Title case helpers ────────────────────────────────────────────────
const LOWER_WORDS = new Set(['and', 'or', 'of', 'the', 'at', 'in', 'a', 'an', 'for', 'to', 'by', 'from'])

function titleCase(str: string): string {
  return str
    .split(' ')
    .map((w, i) => {
      if (!w) return w
      // Don't capitalise after apostrophe — keep existing case for remainder
      const lower = w.toLowerCase()
      if (i > 0 && LOWER_WORDS.has(lower)) return lower
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
    })
    .join(' ')
}

function normVenue(s: string): string {
  const STRIP = ['the', 'centre', 'center', 'arts', 'performing', 'entertainment', 'hall', 'theatre', 'theater', 'and']
  let n = s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ')
  for (const w of STRIP) n = n.replace(new RegExp(`\\b${w}\\b`, 'g'), ' ')
  return n.replace(/\s+/g, ' ').trim()
}

function sameVenue(a: string, b: string): boolean {
  const n1 = normVenue(a)
  const n2 = normVenue(b)
  if (n1 === n2) return true
  const longer = Math.max(n1.length, n2.length)
  if (longer === 0) return false
  if (n1.includes(n2)) return n2.length / longer >= 0.60
  if (n2.includes(n1)) return n1.length / longer >= 0.60
  return false
}

// ── Parse SCHEDULE sheet ────────────────────────────────────────────────
function parseSchedule(buffer: ArrayBuffer): SheetShow[] {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true })
  const sheetName = wb.SheetNames.find(n => n.trim() === 'SCHEDULE')
  if (!sheetName) throw new Error(`No SCHEDULE sheet found. Sheets: ${wb.SheetNames.join(', ')}`)
  const ws = wb.Sheets[sheetName]
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: false })

  const shows: SheetShow[] = []
  let headerIdx = -1

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] as (string | null)[]
    if (row[0] === 'DATE' && row[1] === 'CITY') { headerIdx = i; continue }
    if (headerIdx === -1) continue

    const [dateRaw, cityRaw, venueRaw, capRaw, , statusRaw] = row
    if (!dateRaw || !cityRaw || !venueRaw) continue
    if (typeof venueRaw === 'string' && venueRaw.length > 80) continue

    // Parse date — XLSX returns formatted string with raw:false
    const dateStr = typeof dateRaw === 'string' ? dateRaw.trim() : null
    if (!dateStr) continue

    // Try to parse as AU date (d/m/yyyy or m/d/yyyy) or ISO
    let isoDate: string | null = null
    const dmyMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
    if (dmyMatch) {
      const [, d, m, y] = dmyMatch
      isoDate = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
    } else {
      const parsed = new Date(dateStr)
      if (!isNaN(parsed.getTime())) {
        isoDate = parsed.toISOString().slice(0, 10)
      }
    }
    if (!isoDate) continue

    // City + state
    const cityFull = String(cityRaw).trim()
    let city = cityFull
    let state: string | null = null
    const commaIdx = cityFull.lastIndexOf(', ')
    if (commaIdx !== -1) {
      city = cityFull.slice(0, commaIdx)
      state = cityFull.slice(commaIdx + 2)
    }

    // Capacity
    let capacity: number | null = null
    if (capRaw !== null) {
      const capStr = String(capRaw).trim()
      const m = capStr.match(/^(\d+)/)
      if (m) capacity = parseInt(m[1])
    }

    const harbourStatus = String(statusRaw ?? '').trim().toUpperCase()

    shows.push({
      show_date: isoDate,
      venue_name: titleCase(String(venueRaw).trim()),
      venue_city: titleCase(city),
      state_territory: state,
      capacity,
      harbour_status: harbourStatus,
    })
  }

  return shows
}

// ── Auth guard ──────────────────────────────────────────────────────────
async function checkAdmin(): Promise<{ ok: false; res: NextResponse } | { ok: true }> {
  const userClient = await createClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return { ok: false, res: NextResponse.json({ error: 'Unauthorised' }, { status: 401 }) }
  const supabase = createAdminClient()
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || !['owner', 'admin'].includes(profile.role)) {
    return { ok: false, res: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { ok: true }
}

// ── POST — parse xlsx, return diff preview ──────────────────────────────
export async function POST(req: NextRequest) {
  const auth = await checkAdmin()
  if (!auth.ok) return auth.res

  const form = await req.formData()
  const file = form.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })

  const buffer = await file.arrayBuffer()
  let sheetShows: SheetShow[]
  try {
    sheetShows = parseSchedule(buffer)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 422 })
  }

  const supabase = createAdminClient()
  const { data: dbShows } = await supabase
    .from('shows')
    .select('id, show_date, venue_name, venue_city, state_territory, capacity, run_id, runs!inner(id, code, status)')

  const dbRows: DBShow[] = (dbShows ?? []).map((s: any) => ({
    id: s.id,
    show_date: s.show_date,
    venue_name: s.venue_name,
    venue_city: s.venue_city,
    state_territory: s.state_territory,
    capacity: s.capacity,
    run_id: s.runs.id,
    run_code: s.runs.code,
    run_status: s.runs.status,
  }))

  const dbByDate = new Map(dbRows.map(s => [s.show_date, s]))
  const sheetByDate = new Map(sheetShows.map(s => [s.show_date, s]))

  const updates: ShowDiff[] = []
  const newInSheet: SheetShow[] = []
  const removedFromSheet: DBShow[] = []

  for (const [date, sheet] of sheetByDate) {
    const db = dbByDate.get(date)
    if (!db) { newInSheet.push(sheet); continue }

    const changes: ShowDiff['changes'] = {}

    const shouldUpdateVenue =
      db.venue_name !== sheet.venue_name &&
      (db.venue_name === 'TBC' || sameVenue(db.venue_name, sheet.venue_name))

    if (shouldUpdateVenue) changes.venue_name = { from: db.venue_name, to: sheet.venue_name }
    if (sheet.capacity !== null && db.capacity !== sheet.capacity)
      changes.capacity = { from: db.capacity, to: sheet.capacity }
    if (sheet.state_territory && db.state_territory !== sheet.state_territory)
      changes.state_territory = { from: db.state_territory, to: sheet.state_territory }

    if (Object.keys(changes).length > 0) {
      updates.push({ show_id: db.id, run_code: db.run_code, show_date: date, venue_city: db.venue_city, changes })
    }
  }

  for (const [date, db] of dbByDate) {
    if (!sheetByDate.has(date)) removedFromSheet.push(db)
  }

  // Run status changes
  const runHarbourStatuses = new Map<string, { run_id: string; statuses: string[] }>()
  for (const db of dbRows) {
    const sheet = sheetByDate.get(db.show_date)
    if (!sheet) continue
    if (!runHarbourStatuses.has(db.run_code)) {
      runHarbourStatuses.set(db.run_code, { run_id: db.run_id, statuses: [] })
    }
    runHarbourStatuses.get(db.run_code)!.statuses.push(sheet.harbour_status)
  }

  const runStatusChanges: RunStatusChange[] = []
  const { data: runs } = await supabase.from('runs').select('id, code, status')
  for (const run of runs ?? []) {
    const entry = runHarbourStatuses.get(run.code)
    if (!entry) continue
    const newStatus = entry.statuses.every(s => s === 'CONFIRMED') ? 'confirmed' : 'proposed'
    if (newStatus !== run.status) {
      runStatusChanges.push({ run_id: run.id, run_code: run.code, old_status: run.status, new_status: newStatus })
    }
  }

  const preview: ImportPreview = {
    source_file: file.name,
    sheet_shows: sheetShows.length,
    db_shows: dbRows.length,
    updates,
    run_status_changes: runStatusChanges,
    new_in_sheet: newInSheet,
    removed_from_sheet: removedFromSheet,
  }

  return NextResponse.json(preview)
}

// ── PUT — apply a confirmed preview ────────────────────────────────────
export async function PUT(req: NextRequest) {
  const auth = await checkAdmin()
  if (!auth.ok) return auth.res

  const body: { updates: ShowDiff[]; run_status_changes: RunStatusChange[] } = await req.json()
  const supabase = createAdminClient()

  let showsUpdated = 0
  let runsUpdated = 0

  for (const u of body.updates ?? []) {
    const patch: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(u.changes)) {
      patch[key] = val.to
    }
    patch.updated_at = new Date().toISOString()
    const { error } = await supabase.from('shows').update(patch).eq('id', u.show_id)
    if (!error) showsUpdated++
  }

  for (const r of body.run_status_changes ?? []) {
    const { error } = await supabase.from('runs').update({ status: r.new_status, updated_at: new Date().toISOString() }).eq('id', r.run_id)
    if (!error) runsUpdated++
  }

  return NextResponse.json({ shows_updated: showsUpdated, runs_updated: runsUpdated })
}

/** Shared Worksheet / Advancing show + run field keys and schedule defaults. */

export const SCHEDULE_DEFAULTS = {
  sched_access: '1:00pm',
  sched_soundcheck: '4:00pm',
  sched_dinner: '5:30pm',
  sched_doors: '7:00pm',
  sched_show: '7:30pm',
  sched_finish: '9:50pm',
} as const

export const SETS_DEFAULT = '2 x 60'

/** Editable show columns shared by Worksheet + Advancing */
export const SHOW_WORKSHEET_FIELDS = [
  'venue_address',
  'venue_phone',
  'venue_contact',
  'sets_label',
  'production_company',
  'production_contact',
  'backline_company',
  'backline_contact',
  'sched_access',
  'sched_soundcheck',
  'sched_dinner',
  'sched_doors',
  'sched_show',
  'sched_finish',
  'travel_access_notes',
  'hotel_notes',
  'hospitality_merch_notes',
  'michael_notes',
] as const

export type ShowWorksheetField = (typeof SHOW_WORKSHEET_FIELDS)[number]

export const RUN_WORKSHEET_FIELDS = [
  'flights_notes',
  'vehicles_notes',
  'hotels_overview_notes',
] as const

export type RunWorksheetField = (typeof RUN_WORKSHEET_FIELDS)[number]

export const SHOW_SELECT_COLS = [
  'id',
  'venue_name',
  'venue_city',
  'state_territory',
  'show_date',
  'capacity',
  'show_order',
  'michael_notes',
  ...SHOW_WORKSHEET_FIELDS.filter(f => f !== 'michael_notes'),
].join(', ')

export function displayOrDefault(
  value: string | null | undefined,
  fallback: string,
): string {
  if (value == null || value.trim() === '') return fallback
  return value
}

export function canEditWorksheet(role: string | undefined): boolean {
  return role === 'owner' || role === 'admin' || role === 'production'
}

/** Pick allowed fields from a PATCH body into a Supabase update object. */
export function pickShowWorksheetUpdates(
  fields: Record<string, unknown>,
): Record<string, string | null> {
  const updates: Record<string, string | null> = {}
  for (const key of SHOW_WORKSHEET_FIELDS) {
    if (!(key in fields)) continue
    const raw = fields[key]
    if (raw === null) {
      updates[key] = null
      continue
    }
    if (typeof raw !== 'string') continue
    const trimmed = raw.trim()
    updates[key] = trimmed === '' ? null : trimmed
  }
  return updates
}

export function pickRunWorksheetUpdates(
  fields: Record<string, unknown>,
): Record<string, string | null> {
  const updates: Record<string, string | null> = {}
  for (const key of RUN_WORKSHEET_FIELDS) {
    if (!(key in fields)) continue
    const raw = fields[key]
    if (raw === null) {
      updates[key] = null
      continue
    }
    if (typeof raw !== 'string') continue
    const trimmed = raw.trim()
    updates[key] = trimmed === '' ? null : trimmed
  }
  return updates
}

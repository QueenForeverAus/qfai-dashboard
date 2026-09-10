/**
 * Admin Settings key/value — BOOKED lock, lighting hire default, Advancing SLA.
 * Values live in `portal_settings`. These constants are seed / missing-row fallbacks only.
 * Do not invent other cost figures. Owner split and Harbour commission are parked.
 */

export const PORTAL_SETTING_KEYS = [
  'booked_costing_lock',
  'lighting_hire_default',
  'advancing_sla_aim_weeks',
  'advancing_sla_ping_weeks',
  'advancing_sla_tech_chase_weeks',
] as const

export type PortalSettingKey = (typeof PORTAL_SETTING_KEYS)[number]

export type PortalSettings = {
  booked_costing_lock: boolean
  lighting_hire_default: number
  advancing_sla_aim_weeks: number
  advancing_sla_ping_weeks: number
  advancing_sla_tech_chase_weeks: number
}

/** Product defaults — match current BOOKED freeze ON and $330 lighting hire. */
export const PORTAL_SETTINGS_DEFAULTS: PortalSettings = {
  booked_costing_lock: true,
  lighting_hire_default: 330,
  advancing_sla_aim_weeks: 12,
  advancing_sla_ping_weeks: 10,
  advancing_sla_tech_chase_weeks: 4,
}

export type PortalSettingRow = { key: string; value: unknown }

function asBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value
  if (value === 'true' || value === 1 || value === '1') return true
  if (value === 'false' || value === 0 || value === '0') return false
  return fallback
}

function asInteger(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isInteger(n) ? n : fallback
}

function unwrapJson(value: unknown): unknown {
  if (value && typeof value === 'object' && !Array.isArray(value) && 'value' in (value as object)) {
    return (value as { value: unknown }).value
  }
  return value
}

export function parsePortalSettings(rows: PortalSettingRow[] | null | undefined): PortalSettings {
  const map = new Map<string, unknown>()
  for (const row of rows ?? []) {
    map.set(row.key, unwrapJson(row.value))
  }
  return {
    booked_costing_lock: asBoolean(map.get('booked_costing_lock'), PORTAL_SETTINGS_DEFAULTS.booked_costing_lock),
    lighting_hire_default: asInteger(map.get('lighting_hire_default'), PORTAL_SETTINGS_DEFAULTS.lighting_hire_default),
    advancing_sla_aim_weeks: asInteger(map.get('advancing_sla_aim_weeks'), PORTAL_SETTINGS_DEFAULTS.advancing_sla_aim_weeks),
    advancing_sla_ping_weeks: asInteger(map.get('advancing_sla_ping_weeks'), PORTAL_SETTINGS_DEFAULTS.advancing_sla_ping_weeks),
    advancing_sla_tech_chase_weeks: asInteger(map.get('advancing_sla_tech_chase_weeks'), PORTAL_SETTINGS_DEFAULTS.advancing_sla_tech_chase_weeks),
  }
}

export function pickPortalSettingsPatch(body: unknown): { ok: true; patch: Partial<PortalSettings> } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Invalid settings payload' }
  const raw = body as Record<string, unknown>
  const patch: Partial<PortalSettings> = {}

  if ('booked_costing_lock' in raw) {
    if (typeof raw.booked_costing_lock !== 'boolean') {
      return { ok: false, error: 'BOOKED costing lock must be on or off' }
    }
    patch.booked_costing_lock = raw.booked_costing_lock
  }

  if ('lighting_hire_default' in raw) {
    const n = Number(raw.lighting_hire_default)
    if (!Number.isFinite(n) || n < 0) {
      return { ok: false, error: 'Lighting hire default must be a number 0 or more' }
    }
    patch.lighting_hire_default = n
  }

  for (const key of ['advancing_sla_aim_weeks', 'advancing_sla_ping_weeks', 'advancing_sla_tech_chase_weeks'] as const) {
    if (!(key in raw)) continue
    const n = Number(raw[key])
    if (!Number.isInteger(n) || n < 0) {
      return { ok: false, error: 'SLA weeks must be whole numbers 0 or more' }
    }
    patch[key] = n
  }

  if (Object.keys(patch).length === 0) return { ok: false, error: 'No settings to update' }
  return { ok: true, patch }
}

export function portalSettingsToRows(settings: PortalSettings): Array<{ key: PortalSettingKey; value: boolean | number }> {
  return PORTAL_SETTING_KEYS.map(key => ({ key, value: settings[key] }))
}

export type AdvancingSlaWeeks = {
  aim_weeks: number
  ping_weeks: number
  tech_chase_weeks: number
}

export function advancingSlaFromSettings(settings: PortalSettings): AdvancingSlaWeeks {
  return {
    aim_weeks: settings.advancing_sla_aim_weeks,
    ping_weeks: settings.advancing_sla_ping_weeks,
    tech_chase_weeks: settings.advancing_sla_tech_chase_weeks,
  }
}

export function addCalendarDays(date: string | null | undefined, days: number): string | null {
  const m = String(date ?? '').trim().match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return null
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  dt.setUTCDate(dt.getUTCDate() + days)
  const y = dt.getUTCFullYear()
  const mo = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const d = String(dt.getUTCDate()).padStart(2, '0')
  return `${y}-${mo}-${d}`
}

export function weeksBeforeShow(showDate: string | null | undefined, weeks: number): string | null {
  return addCalendarDays(showDate, -weeks * 7)
}

export function advancingSlaDueDates(
  showDate: string | null | undefined,
  sla: AdvancingSlaWeeks,
): { aimSend: string | null; ping: string | null; techChase: string | null } {
  return {
    aimSend: weeksBeforeShow(showDate, sla.aim_weeks),
    ping: weeksBeforeShow(showDate, sla.ping_weeks),
    techChase: weeksBeforeShow(showDate, sla.tech_chase_weeks),
  }
}

type SettingsClient = {
  from: (table: string) => {
    select: (cols: string) => PromiseLike<{ data: PortalSettingRow[] | null; error: { message: string } | null }>
  }
}

export async function loadPortalSettings(admin: SettingsClient): Promise<PortalSettings> {
  const { data, error } = await admin.from('portal_settings').select('key, value')
  if (error || !data) return { ...PORTAL_SETTINGS_DEFAULTS }
  return parsePortalSettings(data)
}

/**
 * Locked Comms packet: travel-scrape-packet-v1.
 * Live inbox scrape is parked — parse only so Lead/Comms can POST.
 */

export const TRAVEL_SCRAPE_SCHEMA_VERSION = 'travel-scrape-packet-v1' as const

export const TRAVEL_SCRAPE_CATEGORIES = [
  'hotel',
  'flight',
  'car',
  'uber_transfer',
  'ferry',
  'uber_eats',
  'fuel',
  'other_travel',
] as const
export type TravelScrapeCategory = (typeof TRAVEL_SCRAPE_CATEGORIES)[number]

export const TRAVEL_SCRAPE_CONFIDENCE = ['high', 'medium', 'low'] as const
export type TravelScrapeConfidence = (typeof TRAVEL_SCRAPE_CONFIDENCE)[number]

export const TRAVEL_SCRAPE_DETAILS_ACTIONS = ['auto', 'ask', 'watch'] as const
export type TravelScrapeDetailsAction = (typeof TRAVEL_SCRAPE_DETAILS_ACTIONS)[number]

export const TRAVEL_SCRAPE_MONEY_ACTIONS = ['confirm', 'none'] as const
export type TravelScrapeMoneyAction = (typeof TRAVEL_SCRAPE_MONEY_ACTIONS)[number]

export const TRAVEL_SCRAPE_CURRENCIES = ['AUD', 'NZD', 'unknown'] as const
export type TravelScrapeCurrency = (typeof TRAVEL_SCRAPE_CURRENCIES)[number]

export const TRAVEL_SCRAPE_GST = ['inc', 'ex', 'unknown'] as const
export type TravelScrapeGst = (typeof TRAVEL_SCRAPE_GST)[number]

export const TRAVEL_SCRAPE_MONEY_STATUS = ['PAID', 'CONFIRMED'] as const
export type TravelScrapeMoneyStatus = (typeof TRAVEL_SCRAPE_MONEY_STATUS)[number]

export const TRAVEL_SCRAPE_LINE_HINTS = [
  'accom_night',
  'flights',
  'car_hire',
  'ferry',
  'uber',
  'band_meals',
  'fuel',
  'other',
] as const
export type TravelScrapeLineHint = (typeof TRAVEL_SCRAPE_LINE_HINTS)[number]

export const TRAVEL_SCRAPE_TRAVELLER_MATCH = ['profile', 'free_text', 'unknown'] as const
export type TravelScrapeTravellerMatch = (typeof TRAVEL_SCRAPE_TRAVELLER_MATCH)[number]

export const TRAVEL_SCRAPE_BLOCKING_FLAGS = ['run_ambiguous', 'run_unknown'] as const
export type TravelScrapeBlockingFlag = (typeof TRAVEL_SCRAPE_BLOCKING_FLAGS)[number]

export const TRAVEL_WORKSHEET_COLLECTIONS = [
  'hotels',
  'flights',
  'cars',
  'transfers',
  'ferries',
] as const
export type TravelWorksheetCollection = (typeof TRAVEL_WORKSHEET_COLLECTIONS)[number]

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type TravelScrapeEmail = {
  thread_id: string
  message_id: string
  date: string
  subject: string
  from: string
  vendor_domain: string
}

export type TravelScrapeRunMatch = {
  run_id: string | null
  show_ids: string[]
  match_score: number | null
  match_notes: string
  ambiguous_candidates: string[]
}

export type TravelScrapeMoney = {
  amount: number | null
  currency: TravelScrapeCurrency
  gst: TravelScrapeGst
  status_if_applied: TravelScrapeMoneyStatus | null
  advancing_line_hint: TravelScrapeLineHint
}

export type TravelScrapeTraveller = {
  raw_name: string
  profile_user_id: string | null
  match: TravelScrapeTravellerMatch
}

export type TravelScrapeChecklist = {
  items_to_tick: string[]
  source_note: string
  partial_names: boolean
}

export type TravelScrapeSupersedes = {
  prior_conf_id: string | null
  prior_message_id: string | null
}

/** Category worksheet — W1 travel_blocks field names plus hotel `city` for the night line. */
export type TravelScrapeWorksheet = Record<string, unknown>

export type TravelScrapePacket = {
  schema_version: typeof TRAVEL_SCRAPE_SCHEMA_VERSION
  category: TravelScrapeCategory
  confidence: TravelScrapeConfidence
  details_action: TravelScrapeDetailsAction
  money_action: TravelScrapeMoneyAction
  captured_at: string
  email: TravelScrapeEmail
  run_match: TravelScrapeRunMatch
  money: TravelScrapeMoney
  worksheet: TravelScrapeWorksheet
  travellers: TravelScrapeTraveller[]
  checklist: TravelScrapeChecklist
  supersedes: TravelScrapeSupersedes
  flags: string[]
  apply_env: 'staging' | 'production'
}

export type TravelScrapeParseResult =
  | { ok: true; packet: TravelScrapePacket }
  | { ok: false; error: string }

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function readString(row: Record<string, unknown>, key: string): string {
  const raw = row[key]
  return typeof raw === 'string' ? raw.trim() : raw == null ? '' : String(raw).trim()
}

function readOptionalUuid(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return UUID_RE.test(trimmed) ? trimmed : null
}

function readStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map(v => String(v ?? '').trim()).filter(Boolean)
}

function readNumber(value: unknown): number | null {
  if (value == null || value === '') return null
  const n = typeof value === 'number' ? value : Number(String(value).trim())
  return Number.isFinite(n) ? n : null
}

function oneOf<T extends string>(value: string, allowed: readonly T[], fallback: T): T {
  return (allowed as readonly string[]).includes(value) ? value as T : fallback
}

function parseEmail(raw: unknown): TravelScrapeEmail {
  const row = asRecord(raw) ?? {}
  return {
    thread_id: readString(row, 'thread_id'),
    message_id: readString(row, 'message_id'),
    date: readString(row, 'date'),
    subject: readString(row, 'subject'),
    from: readString(row, 'from'),
    vendor_domain: readString(row, 'vendor_domain'),
  }
}

function parseRunMatch(raw: unknown): TravelScrapeRunMatch {
  const row = asRecord(raw) ?? {}
  return {
    run_id: readOptionalUuid(row.run_id),
    show_ids: readStringList(row.show_ids),
    match_score: readNumber(row.match_score),
    match_notes: readString(row, 'match_notes'),
    ambiguous_candidates: readStringList(row.ambiguous_candidates),
  }
}

function parseMoney(raw: unknown): TravelScrapeMoney {
  const row = asRecord(raw) ?? {}
  const currencyRaw = readString(row, 'currency').toUpperCase() || 'unknown'
  const statusRaw = readString(row, 'status_if_applied').toUpperCase()
  return {
    amount: readNumber(row.amount),
    currency: oneOf(currencyRaw === 'UNKNOWN' ? 'unknown' : currencyRaw, TRAVEL_SCRAPE_CURRENCIES, 'unknown'),
    gst: oneOf(readString(row, 'gst').toLowerCase() || 'unknown', TRAVEL_SCRAPE_GST, 'unknown'),
    status_if_applied: (TRAVEL_SCRAPE_MONEY_STATUS as readonly string[]).includes(statusRaw)
      ? statusRaw as TravelScrapeMoneyStatus
      : null,
    advancing_line_hint: oneOf(
      readString(row, 'advancing_line_hint'),
      TRAVEL_SCRAPE_LINE_HINTS,
      'other',
    ),
  }
}

function parseTravellers(raw: unknown): TravelScrapeTraveller[] {
  if (!Array.isArray(raw)) return []
  return raw.map(item => {
    const row = asRecord(item) ?? {}
    return {
      raw_name: readString(row, 'raw_name') || readString(row, 'name'),
      profile_user_id: readOptionalUuid(row.profile_user_id) ?? readOptionalUuid(row.profile_id),
      match: oneOf(readString(row, 'match'), TRAVEL_SCRAPE_TRAVELLER_MATCH, 'unknown'),
    }
  }).filter(row => row.raw_name || row.profile_user_id)
}

function parseChecklist(raw: unknown): TravelScrapeChecklist {
  const row = asRecord(raw) ?? {}
  return {
    items_to_tick: readStringList(row.items_to_tick),
    source_note: readString(row, 'source_note'),
    partial_names: row.partial_names === true || row.partial_names === 'true',
  }
}

function parseSupersedes(raw: unknown): TravelScrapeSupersedes {
  const row = asRecord(raw) ?? {}
  return {
    prior_conf_id: readString(row, 'prior_conf_id') || null,
    prior_message_id: readString(row, 'prior_message_id') || null,
  }
}

export function peekTravelScrapeSchema(input: unknown): boolean {
  const row = typeof input === 'string'
    ? (() => {
        try { return asRecord(JSON.parse(input)) } catch { return null }
      })()
    : asRecord(input)
  return row?.schema_version === TRAVEL_SCRAPE_SCHEMA_VERSION
}

export function parseTravelScrapePacket(input: unknown): TravelScrapeParseResult {
  const row = typeof input === 'string'
    ? (() => {
        try { return asRecord(JSON.parse(input)) } catch { return null }
      })()
    : asRecord(input)

  if (!row) return { ok: false, error: 'Travel scrape packet must be a JSON object.' }

  const schema = readString(row, 'schema_version')
  if (schema !== TRAVEL_SCRAPE_SCHEMA_VERSION) {
    return { ok: false, error: `Unsupported schema_version (expected ${TRAVEL_SCRAPE_SCHEMA_VERSION}).` }
  }

  const category = readString(row, 'category')
  if (!(TRAVEL_SCRAPE_CATEGORIES as readonly string[]).includes(category)) {
    return {
      ok: false,
      error: 'Packet category must be hotel, flight, car, uber_transfer, ferry, uber_eats, fuel, or other_travel.',
    }
  }

  const confidence = readString(row, 'confidence')
  if (!(TRAVEL_SCRAPE_CONFIDENCE as readonly string[]).includes(confidence)) {
    return { ok: false, error: 'Packet confidence must be high, medium, or low.' }
  }

  const detailsAction = readString(row, 'details_action')
  if (!(TRAVEL_SCRAPE_DETAILS_ACTIONS as readonly string[]).includes(detailsAction)) {
    return { ok: false, error: 'Packet details_action must be auto, ask, or watch.' }
  }

  const moneyAction = readString(row, 'money_action')
  if (!(TRAVEL_SCRAPE_MONEY_ACTIONS as readonly string[]).includes(moneyAction)) {
    return { ok: false, error: 'Packet money_action must be confirm or none.' }
  }

  const applyEnvRaw = readString(row, 'apply_env') || 'staging'
  if (applyEnvRaw !== 'staging' && applyEnvRaw !== 'production') {
    return { ok: false, error: 'Packet apply_env must be staging or production.' }
  }

  const capturedAt = readString(row, 'captured_at')
  if (!capturedAt) return { ok: false, error: 'Packet is missing captured_at.' }

  const worksheet = asRecord(row.worksheet) ?? {}

  const packet: TravelScrapePacket = {
    schema_version: TRAVEL_SCRAPE_SCHEMA_VERSION,
    category: category as TravelScrapeCategory,
    confidence: confidence as TravelScrapeConfidence,
    details_action: detailsAction as TravelScrapeDetailsAction,
    money_action: moneyAction as TravelScrapeMoneyAction,
    captured_at: capturedAt,
    email: parseEmail(row.email),
    run_match: parseRunMatch(row.run_match),
    money: parseMoney(row.money),
    worksheet,
    travellers: parseTravellers(row.travellers),
    checklist: parseChecklist(row.checklist),
    supersedes: parseSupersedes(row.supersedes),
    flags: readStringList(row.flags),
    apply_env: applyEnvRaw,
  }

  return { ok: true, packet }
}

export function worksheetCollectionForCategory(
  category: TravelScrapeCategory,
): TravelWorksheetCollection | null {
  switch (category) {
    case 'hotel': return 'hotels'
    case 'flight': return 'flights'
    case 'car': return 'cars'
    case 'uber_transfer': return 'transfers'
    case 'ferry': return 'ferries'
    default: return null
  }
}

export function packetHasBlockingRunFlag(packet: TravelScrapePacket): boolean {
  return packet.flags.some(flag =>
    (TRAVEL_SCRAPE_BLOCKING_FLAGS as readonly string[]).includes(flag),
  )
}

export function readWorksheetString(worksheet: TravelScrapeWorksheet, key: string): string {
  const raw = worksheet[key]
  return typeof raw === 'string' ? raw.trim() : raw == null ? '' : String(raw).trim()
}

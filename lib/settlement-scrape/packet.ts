/**
 * Locked Comms packet: settlement-scrape-packet-v1.
 * Live tours@ inbox scrape stays parked — parse attachments so Lead/Comms can POST.
 * Same ingest shape as travel-scrape-packet-v1 where that is sensible.
 */

export const SETTLEMENT_SCRAPE_SCHEMA_VERSION = 'settlement-scrape-packet-v1' as const

export const SETTLEMENT_SCRAPE_KINDS = ['settlement', 'remittance'] as const
export type SettlementScrapeKind = (typeof SETTLEMENT_SCRAPE_KINDS)[number]

export const SETTLEMENT_SCRAPE_CONFIDENCE = ['high', 'medium', 'low'] as const
export type SettlementScrapeConfidence = (typeof SETTLEMENT_SCRAPE_CONFIDENCE)[number]

export const SETTLEMENT_SCRAPE_MONEY_ACTIONS = ['confirm', 'none'] as const
export type SettlementScrapeMoneyAction = (typeof SETTLEMENT_SCRAPE_MONEY_ACTIONS)[number]

export const SETTLEMENT_SCRAPE_APPLY_ENVS = ['staging', 'production'] as const
export type SettlementScrapeApplyEnv = (typeof SETTLEMENT_SCRAPE_APPLY_ENVS)[number]

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type SettlementScrapeEmail = {
  thread_id: string
  message_id: string
  date: string
  subject: string
  from: string
}

export type SettlementScrapeRunMatch = {
  run_id: string | null
  show_ids: string[]
  match_notes: string
}

export type SettlementScrapeRawLine = {
  description: string
  amount: number
  notes?: string | null
  line_key?: string | null
  line_type?: 'payment' | 'deduction' | 'adjustment' | null
}

export type SettlementScrapeAttachment = {
  filename: string
  mime: string
  extracted_text?: string
  content_base64?: string
  lines?: SettlementScrapeRawLine[]
}

export type SettlementScrapePacket = {
  schema_version: typeof SETTLEMENT_SCRAPE_SCHEMA_VERSION
  kind: SettlementScrapeKind
  confidence: SettlementScrapeConfidence
  money_action: SettlementScrapeMoneyAction
  captured_at: string
  apply_env?: SettlementScrapeApplyEnv
  email: SettlementScrapeEmail
  run_match: SettlementScrapeRunMatch
  attachments: SettlementScrapeAttachment[]
}

export type PacketParseResult =
  | { ok: true; packet: SettlementScrapePacket }
  | { ok: false; error: string }

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function readString(row: Record<string, unknown>, key: string): string {
  const raw = row[key]
  return typeof raw === 'string' ? raw.trim() : ''
}

function readAmount(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return null
  const cleaned = value.replace(/[,$\s]/g, '').trim()
  if (!cleaned) return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

export function peekSettlementScrapeSchema(value: unknown): boolean {
  const row = asRecord(value)
  return row?.schema_version === SETTLEMENT_SCRAPE_SCHEMA_VERSION
}

function parseRawLine(value: unknown): SettlementScrapeRawLine | null {
  const row = asRecord(value)
  if (!row) return null
  const description = readString(row, 'description')
  const amount = readAmount(row.amount)
  if (!description || amount == null) return null
  const lineType = row.line_type
  const typed = lineType === 'payment' || lineType === 'deduction' || lineType === 'adjustment'
    ? lineType
    : null
  return {
    description,
    amount,
    notes: readString(row, 'notes') || null,
    line_key: readString(row, 'line_key') || null,
    line_type: typed,
  }
}

function parseAttachment(value: unknown): SettlementScrapeAttachment | null {
  const row = asRecord(value)
  if (!row) return null
  const filename = readString(row, 'filename') || 'attachment'
  const mime = readString(row, 'mime') || 'application/octet-stream'
  const extracted = readString(row, 'extracted_text')
  const content = readString(row, 'content_base64')
  const lines = Array.isArray(row.lines)
    ? row.lines.map(parseRawLine).filter((l): l is SettlementScrapeRawLine => l != null)
    : undefined
  if (!extracted && !content && !(lines && lines.length)) return null
  return {
    filename,
    mime,
    extracted_text: extracted || undefined,
    content_base64: content || undefined,
    lines: lines?.length ? lines : undefined,
  }
}

export function parseSettlementScrapePacket(value: unknown): PacketParseResult {
  const row = asRecord(value)
  if (!row) return { ok: false, error: 'Settlement scrape packet must be a JSON object.' }
  if (row.schema_version !== SETTLEMENT_SCRAPE_SCHEMA_VERSION) {
    return { ok: false, error: `schema_version must be ${SETTLEMENT_SCRAPE_SCHEMA_VERSION}.` }
  }
  if (!SETTLEMENT_SCRAPE_KINDS.includes(row.kind as SettlementScrapeKind)) {
    return { ok: false, error: 'kind must be settlement or remittance.' }
  }
  if (!SETTLEMENT_SCRAPE_CONFIDENCE.includes(row.confidence as SettlementScrapeConfidence)) {
    return { ok: false, error: 'confidence must be high, medium, or low.' }
  }
  if (!SETTLEMENT_SCRAPE_MONEY_ACTIONS.includes(row.money_action as SettlementScrapeMoneyAction)) {
    return { ok: false, error: 'money_action must be confirm or none.' }
  }
  const capturedAt = readString(row, 'captured_at')
  if (!capturedAt) return { ok: false, error: 'captured_at is required.' }

  const applyEnvRaw = readString(row, 'apply_env').toLowerCase()
  const applyEnv = applyEnvRaw
    ? SETTLEMENT_SCRAPE_APPLY_ENVS.includes(applyEnvRaw as SettlementScrapeApplyEnv)
      ? applyEnvRaw as SettlementScrapeApplyEnv
      : null
    : 'staging'
  if (applyEnv == null) return { ok: false, error: 'apply_env must be staging or production.' }

  const emailRow = asRecord(row.email)
  if (!emailRow) return { ok: false, error: 'email is required.' }
  const email: SettlementScrapeEmail = {
    thread_id: readString(emailRow, 'thread_id'),
    message_id: readString(emailRow, 'message_id'),
    date: readString(emailRow, 'date'),
    subject: readString(emailRow, 'subject'),
    from: readString(emailRow, 'from'),
  }
  if (!email.message_id || !email.subject) {
    return { ok: false, error: 'email.message_id and email.subject are required.' }
  }

  const matchRow = asRecord(row.run_match) ?? {}
  const runId = readString(matchRow, 'run_id')
  if (runId && !UUID_RE.test(runId)) {
    return { ok: false, error: 'run_match.run_id must be a UUID when present.' }
  }
  const showIds = Array.isArray(matchRow.show_ids)
    ? matchRow.show_ids.filter((id): id is string => typeof id === 'string' && UUID_RE.test(id))
    : []

  const attachments = Array.isArray(row.attachments)
    ? row.attachments.map(parseAttachment).filter((a): a is SettlementScrapeAttachment => a != null)
    : []
  if (attachments.length === 0) {
    return { ok: false, error: 'At least one readable attachment (lines, extracted_text, or content_base64) is required.' }
  }

  return {
    ok: true,
    packet: {
      schema_version: SETTLEMENT_SCRAPE_SCHEMA_VERSION,
      kind: row.kind as SettlementScrapeKind,
      confidence: row.confidence as SettlementScrapeConfidence,
      money_action: row.money_action as SettlementScrapeMoneyAction,
      captured_at: capturedAt,
      apply_env: applyEnv,
      email,
      run_match: {
        run_id: runId || null,
        show_ids: showIds,
        match_notes: readString(matchRow, 'match_notes'),
      },
      attachments,
    },
  }
}

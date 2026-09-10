/**
 * Read settlement / remittance email attachments into classifier lines.
 * Prefers structured lines, then extracted text, then spreadsheet bytes.
 * Never invents amounts.
 */

import type { V3RawLine } from '../settlements-v3-buckets.ts'
import type { SettlementScrapeAttachment, SettlementScrapeRawLine } from './packet.ts'

const MONEY_TAIL =
  /(?:\$|AUD|NZD)?\s*(-?[\d,]+(?:\.\d{1,2})?)\s*(?:AUD|NZD)?\s*$/i
const SKIP_LINE =
  /^(description|item|particulars|details|qty|amount|total|page\b|\d+\s*of\s*\d+)/i

export function parseMoneyToken(raw: string): number | null {
  const cleaned = String(raw ?? '').replace(/[,$\s]/g, '').replace(/AUD|NZD/ig, '')
  if (!cleaned || cleaned === '-' || cleaned === '—') return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

export function parseStatementAttachmentText(text: string): V3RawLine[] {
  const out: V3RawLine[] = []
  const seen = new Set<string>()
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const line = raw.replace(/\u00a0/g, ' ').trim()
    if (!line || SKIP_LINE.test(line)) continue
    const tab = line.split(/\t/).map(s => s.trim()).filter(Boolean)
    if (tab.length >= 2) {
      const amount = parseMoneyToken(tab[tab.length - 1]!)
      const description = tab.slice(0, -1).join(' ').trim()
      if (description && amount != null) {
        pushLine(out, seen, { description, amount })
        continue
      }
    }
    const m = line.match(MONEY_TAIL)
    if (m) {
      const amount = parseMoneyToken(m[1] ?? '')
      const description = line.slice(0, m.index).replace(/[.,\s:]+$/, '').trim()
      if (description && amount != null && !SKIP_LINE.test(description)) {
        pushLine(out, seen, { description, amount })
        continue
      }
    }
    const csv = line.split(',').map(s => s.trim()).filter(Boolean)
    if (csv.length >= 2) {
      const last = csv[csv.length - 1]!
      if (/^\$?-?[\d]+(?:\.\d{1,2})?$/.test(last.replace(/,/g, ''))) {
        const amount = parseMoneyToken(last)
        const description = csv.slice(0, -1).join(', ').trim()
        if (description && amount != null && !SKIP_LINE.test(description) && !/^\d+$/.test(description)) {
          pushLine(out, seen, { description, amount })
        }
      }
    }
  }
  return out
}

function pushLine(out: V3RawLine[], seen: Set<string>, line: V3RawLine) {
  const key = `${line.description.toLowerCase()}::${line.amount}`
  if (seen.has(key)) return
  seen.add(key)
  out.push(line)
}

export function parseSpreadsheetBuffer(buf: Buffer): V3RawLine[] {
  const asText = buf.toString('utf8')
  if (asText.includes(',') || asText.includes('\t') || asText.includes('\n')) {
    const fromText = parseStatementAttachmentText(asText)
    if (fromText.length) return fromText
  }
  return []
}

export function asV3Lines(lines: SettlementScrapeRawLine[]): V3RawLine[] {
  return lines.map(l => ({
    description: l.description,
    amount: l.amount,
    notes: l.notes,
    lineKey: l.line_key,
    lineType: l.line_type,
  }))
}

export function linesFromAttachment(att: SettlementScrapeAttachment): V3RawLine[] {
  if (att.lines?.length) return asV3Lines(att.lines)
  if (att.content_base64) {
    const mime = (att.mime || '').toLowerCase()
    const name = (att.filename || '').toLowerCase()
    const tabular = /csv|text\/plain|spreadsheet/.test(mime) || /\.(csv|txt)$/.test(name)
    if (tabular) {
      try {
        const buf = Buffer.from(att.content_base64, 'base64')
        const parsed = parseSpreadsheetBuffer(buf)
        if (parsed.length) return parsed
      } catch {
        // fall through to extracted_text
      }
    }
  }
  if (att.extracted_text) return parseStatementAttachmentText(att.extracted_text)
  return []
}

export function linesFromAttachments(attachments: SettlementScrapeAttachment[]): V3RawLine[] {
  const out: V3RawLine[] = []
  const seen = new Set<string>()
  for (const att of attachments) {
    for (const line of linesFromAttachment(att)) {
      pushLine(out, seen, line)
    }
  }
  return out
}

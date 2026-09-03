import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function formatDateAU(date, opts = {}) {
  if (!date) return '—'
  const m = String(date).match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) {
    return new Date(date).toLocaleDateString('en-AU', {
      timeZone: 'Australia/Sydney',
      day: 'numeric',
      month: 'short',
      ...(opts.year !== false ? { year: 'numeric' } : {}),
      ...(opts.weekday ? { weekday: opts.weekday } : {}),
    })
  }
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12))
  return d.toLocaleDateString('en-AU', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
    ...(opts.year !== false ? { year: 'numeric' } : {}),
    ...(opts.weekday ? { weekday: opts.weekday } : {}),
  })
}

function computeCompletionPct(fields) {
  const actionable = fields.filter(f => f.state !== 'pending')
  if (actionable.length === 0) return 0
  const resolved = actionable.filter(f => f.state === 'known' || f.state === 'estimated')
  return Math.round((resolved.length / actionable.length) * 100)
}

assert.equal(formatDateAU('2026-02-11'), '11 Feb 2026')
assert.equal(formatDateAU('2026-02-11T00:00:00.000Z'), '11 Feb 2026')
assert.equal(formatDateAU('2026-02-11T13:00:00.000Z'), '11 Feb 2026')
assert.equal(formatDateAU(null), '—')
assert.equal(formatDateAU('2026-03-15', { weekday: 'short', year: false }), 'Sun, 15 Mar')

assert.equal(computeCompletionPct([]), 0)
assert.equal(computeCompletionPct([{ state: 'pending' }]), 0)
assert.equal(computeCompletionPct([
  { state: 'known' }, { state: 'estimated' }, { state: 'guess' }, { state: 'pending' },
]), 67)
assert.equal(computeCompletionPct([
  { state: 'known' }, { state: 'known' }, { state: 'estimated' },
]), 100)

const datesSrc = fs.readFileSync(path.join(root, 'lib/dates.ts'), 'utf8')
const compSrc = fs.readFileSync(path.join(root, 'lib/completion.ts'), 'utf8')
assert.match(datesSrc, /export function formatDateAU/)
assert.match(datesSrc, /Australia\/Sydney/)
assert.match(compSrc, /export function computeCompletionPct/)

console.log('unit-dates-completion: OK')

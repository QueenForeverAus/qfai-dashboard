import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function toIsoDateOnly(value) {
  if (value == null) return null
  const m = String(value).match(/^(\d{4}-\d{2}-\d{2})/)
  return m ? m[1] : null
}

function runDateRangeFromShows(shows) {
  const dates = (shows ?? [])
    .map(s => toIsoDateOnly(s?.show_date ?? null))
    .filter(d => d != null)
    .sort()
  if (dates.length === 0) return { start: null, end: null }
  return { start: dates[0], end: dates[dates.length - 1] }
}

assert.deepEqual(runDateRangeFromShows([]), { start: null, end: null })
assert.deepEqual(runDateRangeFromShows(null), { start: null, end: null })
assert.deepEqual(runDateRangeFromShows([{ show_date: null }]), { start: null, end: null })
assert.deepEqual(
  runDateRangeFromShows([{ show_date: '2027-05-15' }, { show_date: '2027-05-14' }]),
  { start: '2027-05-14', end: '2027-05-15' },
)
assert.deepEqual(
  runDateRangeFromShows([{ show_date: '2027-05-14T00:00:00.000Z' }]),
  { start: '2027-05-14', end: '2027-05-14' },
)
assert.deepEqual(
  runDateRangeFromShows([{ show_date: '2027-05-14' }, { show_date: null }, { show_date: '2027-05-16' }]),
  { start: '2027-05-14', end: '2027-05-16' },
)

const src = fs.readFileSync(path.join(root, 'lib/run-dates.ts'), 'utf8')
assert.match(src, /export function runDateRangeFromShows/)
assert.match(src, /export async function syncRunDatesFromShows/)

const patchSrc = fs.readFileSync(path.join(root, 'app/api/shows/[id]/route.ts'), 'utf8')
assert.match(patchSrc, /syncRunDatesFromShows/)

console.log('unit-run-dates: OK')

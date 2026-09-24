/**
 * Weekly Harbour ticket-sales workbook.
 *
 * The Portal export (Queen Forever Ticket Sales 2019–2026) has no tab named
 * "Ticket Sales". The live grid is the year tab (2026): venues across the top
 * in uneven column groups, identity rows down column A, then one row per
 * weekly as-of date.
 *
 * Per venue group the sub-headers are Comp / Current Sales / Total
 * (QPAC adds price bands before Current Sales). Sold = Current Sales.
 * Capacity = ON SALE CAPACITY when that cell is a number, otherwise CAPACITY.
 * There is no Remaining column in this workbook.
 */

import * as XLSX from 'xlsx'
import { ticketSalesRowKey } from './show-identity-match.ts'

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
  apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
  aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10,
  nov: 11, november: 11, dec: 12, december: 12,
}

export type CapacityBasis = 'on_sale' | 'house' | 'missing'

export type TicketSalesWeekPoint = {
  asOf: string
  comps: number | null
  currentSales: number | null
  total: number | null
}

export type ParsedTicketShow = {
  sheetRowKey: string
  venueName: string
  venueCity: string | null
  stateTerritory: string | null
  showDate: string | null
  houseCapacity: number | null
  onSaleCapacity: number | null
  updateSource: string | null
  finalFigure: number | null
  weeks: TicketSalesWeekPoint[]
}

export type ParsedTicketWorkbook = {
  sheetName: string
  shows: ParsedTicketShow[]
  weekDates: string[]
}

export type SnapshotDraftRow = {
  sheetRowKey: string
  venueName: string
  venueCity: string | null
  stateTerritory: string | null
  showDate: string | null
  sold: number | null
  comps: number | null
  totalWithComps: number | null
  houseCapacity: number | null
  onSaleCapacity: number | null
  capacityBasis: CapacityBasis
  displayCapacity: number | null
  pctSold: number | null
  reportedOnAsOf: boolean
  updateSource: string | null
  finalFigure: number | null
}

function cellText(value: unknown): string {
  if (value == null) return ''
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getUTCFullYear()
    const m = String(value.getUTCMonth() + 1).padStart(2, '0')
    const d = String(value.getUTCDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  return String(value).replace(/\s+/g, ' ').trim()
}

function isoFromParts(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1990 || year > 2100) return null
  const dt = new Date(Date.UTC(year, month - 1, day))
  if (dt.getUTCFullYear() !== year || dt.getUTCMonth() !== month - 1 || dt.getUTCDate() !== day) return null
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** Sheet dates: "Thu 29 Jan 2026", "September 18, 2026", "3/10/2026", Excel serial, Date. */
export function parseLooseDate(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return isoFromParts(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate())
  }
  if (typeof value === 'number' && value > 20_000 && value < 80_000) {
    const utc = new Date(Date.UTC(1899, 11, 30) + Math.round(value) * 86_400_000)
    return isoFromParts(utc.getUTCFullYear(), utc.getUTCMonth() + 1, utc.getUTCDate())
  }
  const text = cellText(value)
  if (!text) return null
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10)

  const dmy = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (dmy) return isoFromParts(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]))

  const dMonY = text.match(/(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})/)
  if (dMonY) {
    const month = MONTHS[dMonY[2]!.toLowerCase()]
    if (month) return isoFromParts(Number(dMonY[3]), month, Number(dMonY[1]))
  }

  const monDY = text.match(/([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})/)
  if (monDY) {
    const month = MONTHS[monDY[1]!.toLowerCase()]
    if (month) return isoFromParts(Number(monDY[3]), month, Number(monDY[2]))
  }
  return null
}

export function parseCount(value: unknown): number | null {
  if (value == null || value === '') return null
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value)
  const text = cellText(value).replace(/,/g, '')
  if (!text || text === '—' || text === '-' || text === '–') return null
  if (/%/.test(text)) return null
  const n = Number(text)
  if (!Number.isFinite(n)) return null
  return Math.round(n)
}

export function splitCityState(raw: string | null): { city: string | null; state: string | null } {
  if (!raw) return { city: null, state: null }
  const match = raw.match(/^(.*?)[.,]\s*([A-Za-z]{2,3})$/)
  if (!match) return { city: raw, state: null }
  const city = match[1]!.trim()
  return { city: city || null, state: match[2]!.toUpperCase() }
}

export function capacityChoice(
  onSale: number | null,
  house: number | null,
): { basis: CapacityBasis; display: number | null } {
  if (onSale != null) return { basis: 'on_sale', display: onSale }
  if (house != null) return { basis: 'house', display: house }
  return { basis: 'missing', display: null }
}

export function pctSold(sold: number | null, capacity: number | null): number | null {
  if (sold == null || capacity == null || capacity <= 0) return null
  return Math.round((sold / capacity) * 100)
}

function labelKey(value: unknown): string {
  return cellText(value).replace(/:$/, '').trim().toLowerCase()
}

export function pickTicketSalesSheetName(names: string[]): string | null {
  const exact = names.find(name => name.trim().toLowerCase() === 'ticket sales')
  if (exact) return exact
  const years = names
    .map(name => name.trim())
    .filter(name => /^\d{4}$/.test(name))
    .sort()
  return years.length ? years[years.length - 1]! : null
}

function isPlaceholderVenue(name: string): boolean {
  const venue = name.trim().toUpperCase()
  return !venue || venue === 'TBC' || venue === 'TBA' || venue === 'PLACEHOLDER' || venue.startsWith('RETIRED')
}

export function parseTicketSalesWorkbook(data: ArrayBuffer | Buffer): ParsedTicketWorkbook {
  const wb = XLSX.read(data, { type: data instanceof Buffer ? 'buffer' : 'array', cellDates: true })
  const sheetName = pickTicketSalesSheetName(wb.SheetNames)
  if (!sheetName) {
    throw new Error(`No Ticket Sales or year sheet. Sheets: ${wb.SheetNames.join(', ')}`)
  }
  const ws = wb.Sheets[sheetName]
  if (!ws) throw new Error(`Sheet missing: ${sheetName}`)
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true }) as unknown[][]

  let dateRow = -1
  let subheadRow = -1
  const scanLimit = Math.min(rows.length, 80)
  for (let i = 0; i < scanLimit; i++) {
    const key = labelKey(rows[i]?.[0])
    if (dateRow === -1 && key === 'date') dateRow = i
    const line = (rows[i] ?? []).map(cell => cellText(cell).toLowerCase())
    if (subheadRow === -1 && line.some(cell => cell === 'current sales' || cell === 'total')) subheadRow = i
  }
  if (dateRow === -1) throw new Error(`${sheetName} has no DATE: row`)

  let venueRow = 0
  let venueCells = -1
  for (let i = 0; i < dateRow; i++) {
    const count = (rows[i] ?? []).slice(1).filter(cell => cellText(cell).length > 0).length
    if (count > venueCells) {
      venueCells = count
      venueRow = i
    }
  }

  const header = rows[venueRow] ?? []
  const starts: number[] = []
  for (let c = 1; c < header.length; c++) {
    if (cellText(header[c])) starts.push(c)
  }

  const rowByLabel = new Map<string, number>()
  for (let i = 0; i < (subheadRow === -1 ? dateRow + 20 : subheadRow); i++) {
    const key = labelKey(rows[i]?.[0])
    if (key && !rowByLabel.has(key)) rowByLabel.set(key, i)
  }

  function at(rowIndex: number | undefined, col: number): unknown {
    if (rowIndex == null || rowIndex < 0) return null
    return rows[rowIndex]?.[col] ?? null
  }

  const weekRows: { index: number; asOf: string }[] = []
  const weekStart = (subheadRow === -1 ? dateRow : subheadRow) + 1
  for (let i = weekStart; i < rows.length; i++) {
    const asOf = parseLooseDate(rows[i]?.[0])
    if (asOf) weekRows.push({ index: i, asOf })
  }

  const shows: ParsedTicketShow[] = []
  const usedKeys = new Set<string>()

  for (let s = 0; s < starts.length; s++) {
    const start = starts[s]!
    const end = (starts[s + 1] ?? header.length) - 1
    const venueName = cellText(header[start])
    if (isPlaceholderVenue(venueName)) continue

    const sub = rows[subheadRow] ?? []
    let compsCol: number | null = null
    let salesCol: number | null = null
    let totalCol: number | null = null
    for (let c = start; c <= end; c++) {
      const head = cellText(sub[c]).toLowerCase()
      if (head === 'comp' || head === 'comps') compsCol = c
      else if (head === 'current sales') salesCol = c
      else if (head === 'total') totalCol = c
    }
    if (salesCol == null && totalCol == null && end - start === 2) {
      compsCol = start
      salesCol = start + 1
      totalCol = start + 2
    }

    const showDate = parseLooseDate(at(rowByLabel.get('date'), start))
    const cityRaw = cellText(at(rowByLabel.get('city'), start)) || null
    const { city, state } = splitCityState(cityRaw)
    const houseCapacity = parseCount(at(rowByLabel.get('capacity'), start))
    const onSaleCapacity = parseCount(at(rowByLabel.get('on sale capacity'), start))
    const updateSource = cellText(at(rowByLabel.get('update source'), start)) || null
    const finalFigure = parseCount(at(rowByLabel.get('final figure'), start))

    const weeks: TicketSalesWeekPoint[] = []
    for (const week of weekRows) {
      const line = rows[week.index] ?? []
      const comps = compsCol == null ? null : parseCount(line[compsCol])
      const currentSales = salesCol == null ? null : parseCount(line[salesCol])
      const total = totalCol == null ? null : parseCount(line[totalCol])
      if (comps == null && currentSales == null && total == null) continue
      weeks.push({ asOf: week.asOf, comps, currentSales, total })
    }

    if (!showDate && houseCapacity == null && onSaleCapacity == null && weeks.length === 0) continue

    let sheetRowKey = ticketSalesRowKey(showDate, venueName)
    if (usedKeys.has(sheetRowKey)) sheetRowKey = `${sheetRowKey}|${start}`
    usedKeys.add(sheetRowKey)

    shows.push({
      sheetRowKey,
      venueName,
      venueCity: city,
      stateTerritory: state,
      showDate,
      houseCapacity,
      onSaleCapacity,
      updateSource,
      finalFigure,
      weeks,
    })
  }

  const weekDates = [...new Set(weekRows.map(week => week.asOf))].sort()
  return { sheetName, shows, weekDates }
}

/** One dated snapshot: carry forward the latest weekly figure on or before `asOf`. */
export function snapshotRowsAsOf(shows: ParsedTicketShow[], asOf: string): SnapshotDraftRow[] {
  return shows.map(show => {
    const prior = show.weeks.filter(week => week.asOf <= asOf)
    const latest = prior.length ? prior[prior.length - 1]! : null
    const reported = latest?.asOf === asOf
      && (latest.currentSales != null || (latest.currentSales == null && latest.total != null))
    const sold = latest == null
      ? null
      : (latest.currentSales ?? latest.total)
    const choice = capacityChoice(show.onSaleCapacity, show.houseCapacity)
    return {
      sheetRowKey: show.sheetRowKey,
      venueName: show.venueName,
      venueCity: show.venueCity,
      stateTerritory: show.stateTerritory,
      showDate: show.showDate,
      sold,
      comps: latest?.comps ?? null,
      totalWithComps: latest?.total ?? null,
      houseCapacity: show.houseCapacity,
      onSaleCapacity: show.onSaleCapacity,
      capacityBasis: choice.basis,
      displayCapacity: choice.display,
      pctSold: pctSold(sold, choice.display),
      reportedOnAsOf: Boolean(reported && sold != null),
      updateSource: show.updateSource,
      finalFigure: show.finalFigure,
    }
  })
}

export function latestSnapshotDates(weekDates: string[], count: number): string[] {
  return [...weekDates].sort().slice(-count)
}

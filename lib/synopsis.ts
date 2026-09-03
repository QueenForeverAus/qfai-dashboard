import { formatDateAU } from '@/lib/dates'

type Show = {
  show_order: number
  venue_city: string
  state_territory: string | null
  show_date: string | null
}

type CostField = {
  field_key: string
  value: number | null
  entries: unknown
}

function fmtDay(dateStr: string, offsetDays = 0): string {
  const m = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m && offsetDays === 0) {
    return formatDateAU(dateStr, { weekday: 'long', year: false })
  }
  const base = m
    ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12))
    : new Date(dateStr)
  base.setUTCDate(base.getUTCDate() + offsetDays)
  const iso = base.toISOString().slice(0, 10)
  return formatDateAU(iso, { weekday: 'long', year: false })
}

function entries(f: CostField): Array<{ description?: string }> {
  return Array.isArray(f.entries) ? (f.entries as Array<{ description?: string }>) : []
}

export function buildSynopsis(
  shows: Show[],
  costFields: CostField[],
): string {
  const numShows = shows.length
  if (numShows === 0) return 'No shows configured yet — add show details to generate a synopsis.'

  const sorted = [...shows].sort((a, b) => (a.show_order ?? 0) - (b.show_order ?? 0))

  const venueDescs = sorted.map(s => {
    const date = s.show_date ? fmtDay(s.show_date) : null
    return date ? `${s.venue_city} (${date})` : s.venue_city
  })
  const venueList =
    venueDescs.length > 2
      ? venueDescs.slice(0, -1).join(', ') + ' and ' + venueDescs.slice(-1)[0]
      : venueDescs.join(' and ')

  const firstState = sorted[0]?.state_territory ?? null
  const allSameState = sorted.every(s => s.state_territory === firstState)
  const regionDesc = allSameState && firstState ? ` in ${firstState}` : ''

  const countWords = ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight']
  const countWord = countWords[numShows - 1] ?? `${numShows}`
  const showWord = numShows === 1 ? 'show' : 'shows'

  const field = (key: string) => costFields.find(f => f.field_key === key)

  const hasFlights    = !!(field('flights')?.value)
  const hasBackline   = !!field('backline_hire')
  const hasBradDriver = !!(field('brad_driver_fee')?.value)
  const hasCrewTDay   = !!(field('crew_travel_day')?.value)
  const gtField       = field('ground_transport')
  const hasKia        = !!gtField && entries(gtField).some(e => /kia/i.test(e.description ?? ''))
  const hasVan        = !!gtField && entries(gtField).some(e => /van hire/i.test(e.description ?? ''))
  const accomEntries  = field('accommodation')
  const accomNights   = Array.isArray(accomEntries?.entries) ? (accomEntries!.entries as unknown[]).length : 0

  const parts: string[] = []

  // Opening line
  parts.push(`${countWord} ${showWord}${regionDesc} — ${venueList}.`)

  // Travel & arrival
  if (hasFlights) {
    const firstDate = sorted[0]?.show_date
    const lastDate  = sorted[sorted.length - 1]?.show_date

    let arrivalNote = ''
    if (hasCrewTDay && firstDate) {
      arrivalNote = ` Fly in ${fmtDay(firstDate, -1)} — non-performance travel day; crew travel day fees apply for Adam and Michael.`
    } else if (hasCrewTDay) {
      arrivalNote = ' Fly in the day before the first show — non-performance travel day (Adam and Michael).'
    }

    let returnNote = ''
    if (lastDate) {
      returnNote = ` Return to Melbourne ${fmtDay(lastDate, 1)}.`
    }

    const flyPax = hasVan && hasBradDriver ? 6 : 7
    parts.push(`Band and crew fly (${flyPax} pax).${arrivalNote}${returnNote}`)
  } else {
    const driverNote = hasBradDriver
      ? ' Brad drives the van from Melbourne.'
      : ' Self-drive from Melbourne.'
    parts.push(driverNote.trim())
    if (hasVan && hasBradDriver) {
      parts.push('Production gear travels in the van.')
    }
  }

  // Local transport
  const transportLines: string[] = []
  if (hasKia) transportLines.push('Kia Carnival hired for local transport between venues')
  if (hasVan && hasFlights) transportLines.push('hired van driven from Melbourne with band gear')
  if (transportLines.length) {
    const joined = transportLines[0].charAt(0).toUpperCase() + transportLines[0].slice(1) +
      (transportLines.length > 1 ? ' and ' + transportLines.slice(1).join(' and ') : '')
    parts.push(joined + '.')
  }

  // Backline
  if (hasBackline) {
    parts.push('Group 3 run — backline hired locally (drum kit, keys, guitar amps). Own gear stays in Melbourne.')
  }

  // Accommodation
  if (accomNights > 0) {
    parts.push(`${accomNights} night${accomNights !== 1 ? 's' : ''} accommodation (7 rooms).`)
  }

  return parts.join(' ')
}

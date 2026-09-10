/**
 * Tour seasons — grouping / assignment.
 * Date ranges are SoT in Admin Settings (`tours` table). Do not hardcode year bounds.
 */

export type TourRow = {
  id: string
  name: string
  date_from: string | null
  date_to: string | null
  sort_order: number
  created_at?: string
  updated_at?: string
}

export const ALL_SHOWS_TAB = 'all'
export const ALL_SHOWS_LABEL = 'ALL SHOWS'
export const UNASSIGNED_TOUR_HEADING = 'Unassigned'
export const ADMIN_SETTINGS_HREF = '/admin-settings'
export const ADMIN_SETTINGS_NAV_LABEL = 'Settings'

export type TourShowLike = {
  show_date?: string | null
}

export type TourRunLike = {
  id?: string
  shows?: TourShowLike[] | null
}

export function isCompleteTour(tour: Pick<TourRow, 'date_from' | 'date_to'>): boolean {
  return Boolean(tour.date_from && tour.date_to)
}

/** Calendar day only (YYYY-MM-DD). Rejects timestamps we cannot bucket. */
export function tourCalendarDate(value: string | null | undefined): string | null {
  if (!value) return null
  const m = String(value).trim().match(/^(\d{4}-\d{2}-\d{2})/)
  return m ? m[1] : null
}

export function compareToursForMatch(a: TourRow, b: TourRow): number {
  if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order
  const af = a.date_from ?? ''
  const bf = b.date_from ?? ''
  if (af !== bf) return af < bf ? -1 : 1
  return a.name.localeCompare(b.name)
}

/** Complete tours only, in assignment / tab order. */
export function visibleTours(tours: TourRow[] | null | undefined): TourRow[] {
  return (tours ?? []).filter(isCompleteTour).sort(compareToursForMatch)
}

export function dateInTourRange(date: string, tour: Pick<TourRow, 'date_from' | 'date_to'>): boolean {
  if (!isCompleteTour(tour)) return false
  return date >= tour.date_from! && date <= tour.date_to!
}

/** First complete matching Tour: sort_order, then date_from, then name. */
export function assignShowDateToTour(
  showDate: string | null | undefined,
  tours: TourRow[] | null | undefined,
): TourRow | null {
  const date = tourCalendarDate(showDate)
  if (!date) return null
  for (const tour of visibleTours(tours)) {
    if (dateInTourRange(date, tour)) return tour
  }
  return null
}

export function matchingToursForRun(
  run: TourRunLike,
  tours: TourRow[] | null | undefined,
): TourRow[] {
  const matched = new Map<string, TourRow>()
  for (const show of run.shows ?? []) {
    const tour = assignShowDateToTour(show.show_date, tours)
    if (tour) matched.set(tour.id, tour)
  }
  return [...matched.values()].sort(compareToursForMatch)
}

export function runMatchesTour(
  run: TourRunLike,
  tourId: string,
  tours: TourRow[] | null | undefined,
): boolean {
  return matchingToursForRun(run, tours).some(t => t.id === tourId)
}

export type TourRunGroup<T extends TourRunLike> = {
  tour: TourRow | null
  heading: string | null
  runs: T[]
}

/**
 * Group runs under complete Tour headings (multi-tour runs repeat honestly).
 * Unassigned last. If no complete Tours exist, return one flat group (no heading).
 */
export function groupRunsByTour<T extends TourRunLike>(
  runs: T[],
  tours: TourRow[] | null | undefined,
): TourRunGroup<T>[] {
  const visible = visibleTours(tours)
  if (visible.length === 0) {
    return [{ tour: null, heading: null, runs }]
  }

  const groups = visible.map(tour => ({
    tour,
    heading: tour.name,
    runs: [] as T[],
  }))
  const byId = new Map(groups.map(g => [g.tour.id, g]))
  const unassigned: T[] = []

  for (const run of runs) {
    const matched = matchingToursForRun(run, tours)
    if (matched.length === 0) {
      unassigned.push(run)
      continue
    }
    for (const tour of matched) {
      byId.get(tour.id)?.runs.push(run)
    }
  }

  const result: TourRunGroup<T>[] = groups.filter(g => g.runs.length > 0)
  if (unassigned.length > 0) {
    result.push({ tour: null, heading: UNASSIGNED_TOUR_HEADING, runs: unassigned })
  }
  return result
}

export function toursOverlap(
  a: Pick<TourRow, 'date_from' | 'date_to'>,
  b: Pick<TourRow, 'date_from' | 'date_to'>,
): boolean {
  if (!isCompleteTour(a) || !isCompleteTour(b)) return false
  return a.date_from! <= b.date_to! && b.date_from! <= a.date_to!
}

export type TourOverlapPair = { a: TourRow; b: TourRow }

export function findTourOverlaps(tours: TourRow[] | null | undefined): TourOverlapPair[] {
  const complete = (tours ?? []).filter(isCompleteTour)
  const pairs: TourOverlapPair[] = []
  for (let i = 0; i < complete.length; i++) {
    for (let j = i + 1; j < complete.length; j++) {
      if (toursOverlap(complete[i]!, complete[j]!)) {
        pairs.push({ a: complete[i]!, b: complete[j]! })
      }
    }
  }
  return pairs
}

export function emptyTourDates(from: string | null | undefined, to: string | null | undefined): {
  date_from: string | null
  date_to: string | null
} {
  const date_from = tourCalendarDate(from)
  const date_to = tourCalendarDate(to)
  return { date_from, date_to }
}

export function tourRangeError(
  date_from: string | null | undefined,
  date_to: string | null | undefined,
): string | null {
  const from = tourCalendarDate(date_from)
  const to = tourCalendarDate(date_to)
  if (from && to && to < from) return 'End date must be on or after the start date.'
  return null
}

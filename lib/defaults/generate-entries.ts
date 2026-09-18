import { formatDateShortAU } from '../dates.ts'
import { LIGHTING_HIRE_LINE_LABEL } from '../cost-fields.ts'
import { KEYBOARD_STAND_HIRE_LABEL } from '../group-type.ts'
import { LIGHTING_HIRE_PER_RUN, type RunDefault } from './run-defaults.ts'

export type SeedEntry = {
  id: string
  description: string
  notes: string
  amount: number
  gst_included: boolean
  confirmed: boolean
  /** Stable identity for Factors refresh / hard-delete tombstones. */
  seed_key?: string | null
  rate?: number | null
  rate_unit?: 'per_payer' | 'pct_gross' | null
  inside_kind?: 'booking_fee' | 'cc_fee' | 'ticketing_inside' | 'comp_tickets' | 'custom' | null
}

/** Deterministic seed identity so a deleted line is not recreated on refresh. */
export function generatedEntrySeedKey(fieldKey: string, description: string): string {
  const desc = String(description ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
  return `${fieldKey}:${desc}`
}

function withSeedKeys(fieldKey: string, entries: SeedEntry[]): SeedEntry[] {
  return entries.map(entry => ({
    ...entry,
    seed_key: entry.seed_key ?? generatedEntrySeedKey(fieldKey, entry.description),
  }))
}

type Show = {
  show_order: number
  venue_city: string
  show_date: string | null
}

export type FactorOverrides = {
  accom_per_night?: number
  per_diem_per_person_per_day?: number
  food_basics_per_show?: number
  lighting_hire_per_run?: number
  backline_hire_per_run?: number
  crew_travel_day_adam?: number
  crew_travel_day_michael?: number
  crew_fee_adam_sound?: number
  crew_fee_michael_lighting?: number
  crew_fee_michael_pm?: number
  crew_fee_darryn?: number
  crew_fee_danny?: number
  music_rights_pct?: number
  daniel_champagne_per_ticket?: number
}

const CREW_BREAKDOWN = [
  { name: 'Adam Dahl — FOH / Sound',            rate: 600, gst: true,  factorKey: 'crew_fee_adam_sound' as const },
  { name: 'Michael Richardson — Lighting',      rate: 600, gst: true,  factorKey: 'crew_fee_michael_lighting' as const },
  { name: 'Michael Richardson — Production Mgr', rate: 250, gst: true,  factorKey: 'crew_fee_michael_pm' as const },
  { name: 'Darryn McLaughlin — Bass',           rate: 600, gst: false, factorKey: 'crew_fee_darryn' as const },
  { name: 'Danny Oakhill — Keys',               rate: 600, gst: false, factorKey: 'crew_fee_danny' as const },
]


/** Append Source: Factors to blurbs (idempotent). */
function withFactorsSource(notes: string): string {
  const n = (notes ?? '').trim()
  if (!n) return 'Source: Factors'
  if (/Source:\s*Factors/i.test(n)) return n
  return `${n} — Source: Factors`
}

function uid() {
  return typeof crypto !== 'undefined'
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2)
}

function fmtDate(d: string | null) {
  if (!d) return ''
  return formatDateShortAU(d)
}

export function generateEntries(
  fieldKey: string,
  fieldState: string,
  defaults: RunDefault | null,
  shows: Show[],
  factors?: FactorOverrides,
): SeedEntry[] {
  return withSeedKeys(fieldKey, generateEntriesUnseeded(fieldKey, fieldState, defaults, shows, factors))
}

function generateEntriesUnseeded(
  fieldKey: string,
  fieldState: string,
  defaults: RunDefault | null,
  shows: Show[],
  factors?: FactorOverrides,
): SeedEntry[] {
  const numShows = shows.length

  switch (fieldKey) {
    case 'crew_fees_total':
      return CREW_BREAKDOWN.map(c => {
        const rate = factors?.[c.factorKey] ?? c.rate
        return {
          id: uid(),
          description: c.name,
          notes: `$${rate.toLocaleString()}/show × ${numShows} show${numShows !== 1 ? 's' : ''}`,
          amount: rate * numShows,
          gst_included: c.gst,
          confirmed: true,
        }
      })

    case 'accommodation': {
      if (!defaults) return []
      const nights = defaults.accommodationNights
      const perNight = factors?.accom_per_night ?? Math.round(defaults.accommodation.value / nights)
      const travelNights = Math.max(0, nights - shows.length)
      const confirmed = defaults.accommodation.state === 'known'
      const entries: SeedEntry[] = []

      for (let i = 0; i < travelNights; i++) {
        const city = shows[0]?.venue_city ?? 'TBC'
        entries.push({
          id: uid(),
          description: `${city} — Pre-show night`,
          notes: withFactorsSource('7 rooms'),
          amount: perNight,
          gst_included: true,
          confirmed,
        })
      }
      shows.forEach((show, i) => {
        entries.push({
          id: uid(),
          description: `${show.venue_city} — Night ${travelNights + i + 1}`,
          notes: withFactorsSource(`${fmtDate(show.show_date)} — 7 rooms`),
          amount: perNight,
          gst_included: true,
          confirmed,
        })
      })
      return entries
    }

    case 'per_diems': {
      if (!defaults) return []
      const days = defaults.perDiemDays
      const dailyRate = factors?.per_diem_per_person_per_day ?? 40
      const perPerson = dailyRate * days
      const confirmed = defaults.perDiems.state === 'known'
      return [
        { id: uid(), description: 'Darryn McLaughlin', notes: withFactorsSource(`$${dailyRate}/day × ${days} day${days !== 1 ? 's' : ''}`), amount: perPerson, gst_included: false, confirmed },
        { id: uid(), description: 'Danny Oakhill',     notes: withFactorsSource(`$${dailyRate}/day × ${days} day${days !== 1 ? 's' : ''}`), amount: perPerson, gst_included: false, confirmed },
      ]
    }

    case 'brad_driver_fee': {
      if (!defaults?.bradDriverFee) return []
      return [{
        id: uid(),
        description: 'Brad Hodgkinson — weekday off work',
        notes: '$400 fixed agreed rate',
        amount: defaults.bradDriverFee.value,
        gst_included: false,
        confirmed: defaults.bradDriverFee.state === 'known',
      }]
    }

    case 'crew_travel_day': {
      if (!defaults?.crewTravelDay) return []
      const confirmed = defaults.crewTravelDay.state === 'known'
      if (defaults.crewTravelDayItems?.length && !factors?.crew_travel_day_adam && !factors?.crew_travel_day_michael) {
        return defaults.crewTravelDayItems.map(item => ({
          id: uid(), description: item.description, notes: withFactorsSource(item.notes),
          amount: item.amount, gst_included: true, confirmed,
        }))
      }
      const adamRate = factors?.crew_travel_day_adam ?? Math.round(defaults.crewTravelDay.value / 2)
      const michaelRate = factors?.crew_travel_day_michael ?? Math.round(defaults.crewTravelDay.value / 2)
      return [
        { id: uid(), description: 'Adam Dahl',          notes: withFactorsSource('Non-performance travel day'), amount: adamRate, gst_included: true, confirmed },
        { id: uid(), description: 'Michael Richardson', notes: withFactorsSource('Non-performance travel day'), amount: michaelRate, gst_included: true, confirmed },
      ]
    }

    case 'flights': {
      if (!defaults?.flights) return []
      return [{
        id: uid(),
        description: 'Band + crew flights (7 pax)',
        notes: defaults.flights.source.split('.')[0],
        amount: defaults.flights.value,
        gst_included: true,
        confirmed: defaults.flights.state === 'known',
      }]
    }

    case 'ground_transport': {
      if (!defaults) return []
      const confirmed = defaults.groundTransport.state === 'known'
      if (defaults.groundTransportItems?.length) {
        return defaults.groundTransportItems.map(item => ({
          id: uid(), description: item.description, notes: withFactorsSource(item.notes),
          amount: item.amount, gst_included: true, confirmed,
        }))
      }
      return [{
        id: uid(),
        description: 'Ground transport (total)',
        notes: defaults.groundTransport.source.split('.')[0],
        amount: defaults.groundTransport.value,
        gst_included: true,
        confirmed,
      }]
    }

    case 'lighting_hire': {
      const rate = factors?.lighting_hire_per_run ?? LIGHTING_HIRE_PER_RUN
      const noStanding = rate === 0
      return [{
        id: uid(),
        description: LIGHTING_HIRE_LINE_LABEL,
        notes: noStanding
          ? 'No standing lighting hire for this group — Michael confirms if local hire is needed'
          : withFactorsSource('Michael Richardson standard per-run rate'),
        amount: rate,
        gst_included: true,
        confirmed: false,
      }]
    }

    case 'food_basics': {
      const rate = factors?.food_basics_per_show ?? 225
      return shows.map((show, i) => ({
        id: uid(),
        description: `${show.venue_city} — Show ${i + 1}`,
        notes: withFactorsSource('Catering + drinks rider'),
        amount: rate,
        gst_included: true,
        confirmed: false,
      }))
    }

    case 'backline_hire': {
      if (!defaults?.backlineHire && !defaults?.keyboardHire) return []
      const entries: SeedEntry[] = []
      if (defaults?.backlineHire) {
        const rate = factors?.backline_hire_per_run ?? defaults.backlineHire.value
        const ownKeyboard = !defaults.keyboardHire
        entries.push({
          id: uid(),
          description: 'Backline hire (local)',
          notes: withFactorsSource(
            ownKeyboard
              ? 'Local hire — drum kit, guitar amps. Own keyboard travels (no KB hire seed).'
              : 'Local hire — drum kit, guitar amps. Keyboard + stand is a separate G4 seed.',
          ),
          amount: rate,
          gst_included: true,
          confirmed: defaults.backlineHire.state === 'known',
        })
      }
      if (defaults?.keyboardHire) {
        entries.push({
          id: uid(),
          description: KEYBOARD_STAND_HIRE_LABEL,
          notes: withFactorsSource(defaults.keyboardHire.source),
          amount: defaults.keyboardHire.value,
          gst_included: true,
          confirmed: defaults.keyboardHire.state === 'known',
        })
      }
      return entries
    }

    case 'fb_ads': {
      if (!defaults) return []
      const confirmed = defaults.fbAds.state === 'known'
      return shows.map((show, i) => {
        const perVenue = (defaults.fbAdsItems as Array<{venueCity: string; amount: number; notes: string}> | undefined)
          ?.find(item => show.venue_city?.toLowerCase().includes(item.venueCity.toLowerCase()) || item.venueCity.toLowerCase().includes(show.venue_city?.toLowerCase()))
        const amount = perVenue ? perVenue.amount : Math.round(defaults.fbAds.value / numShows)
        const notes = perVenue ? `Meta/Facebook — ${perVenue.notes}` : `Meta/Facebook — Show ${i + 1}`
        return {
          id: uid(),
          description: `${show.venue_city} — Digital Ads`,
          notes,
          amount,
          gst_included: true,
          confirmed,
        }
      })
    }

    default:
      return []
  }
}

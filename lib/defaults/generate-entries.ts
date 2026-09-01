import type { RunDefault } from './run-defaults'

export type SeedEntry = {
  id: string
  description: string
  notes: string
  amount: number
  gst_included: boolean
  confirmed: boolean
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
}

const CREW_BREAKDOWN = [
  { name: 'Adam Dahl — FOH / Sound',           rate: 600, gst: true  },
  { name: 'Michael Richardson — Lighting',      rate: 600, gst: true  },
  { name: 'Michael Richardson — Production Mgr', rate: 250, gst: true },
  { name: 'Darryn McLaughlin — Bass',           rate: 600, gst: false },
  { name: 'Danny Oakhill — Keys',               rate: 600, gst: false },
]

function uid() {
  return typeof crypto !== 'undefined'
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2)
}

function fmtDate(d: string | null) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })
}

export function generateEntries(
  fieldKey: string,
  fieldState: string,
  defaults: RunDefault | null,
  shows: Show[],
  factors?: FactorOverrides,
): SeedEntry[] {
  const numShows = shows.length

  switch (fieldKey) {
    case 'crew_fees_total':
      return CREW_BREAKDOWN.map(c => ({
        id: uid(),
        description: c.name,
        notes: `$${c.rate.toLocaleString()}/show × ${numShows} show${numShows !== 1 ? 's' : ''}`,
        amount: c.rate * numShows,
        gst_included: c.gst,
        confirmed: true,
      }))

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
          notes: '7 rooms',
          amount: perNight,
          gst_included: true,
          confirmed,
        })
      }
      shows.forEach((show, i) => {
        entries.push({
          id: uid(),
          description: `${show.venue_city} — Night ${travelNights + i + 1}`,
          notes: `${fmtDate(show.show_date)} — 7 rooms`,
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
        { id: uid(), description: 'Darryn McLaughlin', notes: `$${dailyRate}/day × ${days} day${days !== 1 ? 's' : ''}`, amount: perPerson, gst_included: false, confirmed },
        { id: uid(), description: 'Danny Oakhill',     notes: `$${dailyRate}/day × ${days} day${days !== 1 ? 's' : ''}`, amount: perPerson, gst_included: false, confirmed },
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
          id: uid(), description: item.description, notes: item.notes,
          amount: item.amount, gst_included: true, confirmed,
        }))
      }
      const adamRate = factors?.crew_travel_day_adam ?? Math.round(defaults.crewTravelDay.value / 2)
      const michaelRate = factors?.crew_travel_day_michael ?? Math.round(defaults.crewTravelDay.value / 2)
      return [
        { id: uid(), description: 'Adam Dahl',          notes: 'Non-performance travel day', amount: adamRate, gst_included: true, confirmed },
        { id: uid(), description: 'Michael Richardson', notes: 'Non-performance travel day', amount: michaelRate, gst_included: true, confirmed },
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
          id: uid(), description: item.description, notes: item.notes,
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
      const rate = factors?.lighting_hire_per_run ?? 330
      return [{
        id: uid(),
        description: 'Lighting equipment hire — full run',
        notes: 'Michael Richardson standard per-run rate',
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
        notes: 'Catering + drinks rider',
        amount: rate,
        gst_included: true,
        confirmed: false,
      }))
    }

    case 'backline_hire': {
      if (!defaults?.backlineHire) return []
      const rate = factors?.backline_hire_per_run ?? defaults.backlineHire.value
      return [{
        id: uid(),
        description: 'Backline hire (local)',
        notes: 'Group 3 run — own gear cannot be freighted; drum kit, keys, guitar amps hired locally',
        amount: rate,
        gst_included: true,
        confirmed: defaults.backlineHire.state === 'known',
      }]
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

export type RunStatus = 'CONFIRMED' | 'HELD' | '2P' | 'EOI'
export type Region = 'Group 1' | 'Group 2' | 'Group 3'

export interface ShowDeal {
  venue: string
  date: string
  status: RunStatus
  capacity: number
  nettPrice: number
  bookingFee: number
  ccPct: number
  apraPct: number
  venueHireFlat: number
  venueHirePct: number // % of net BO if greater than flat
  onCosts: number
}

export interface Run {
  id: string
  name: string
  region: Region
  shows: ShowDeal[]
  fixedCosts: Record<string, number>
  harbourPct: number
  notes?: string[]
  warnings?: string[]
}

export function calcRun(run: Run, sellPcts: number[]) {
  const results = sellPcts.map((pct, i) => {
    const show = run.shows[i]
    const tickets = Math.floor(show.capacity * pct)
    const gross = tickets * (show.nettPrice + show.bookingFee)
    const nettBO = tickets * show.nettPrice
    const actualHire = Math.max(show.venueHireFlat, show.venueHirePct * nettBO)
    const ccFee = show.ccPct * gross
    const apra = show.apraPct * gross
    const harbour = run.harbourPct * nettBO
    const showNet = nettBO - ccFee - apra - actualHire - show.onCosts - harbour
    return { tickets, gross, nettBO, showNet }
  })

  const totalTickets = results.reduce((s, r) => s + r.tickets, 0)
  const venueNet = results.reduce((s, r) => s + r.showNet, 0)
  const social = totalTickets * 1.10
  const fixedTotal = Object.values(run.fixedCosts).reduce((s, v) => s + v, 0)
  const preReserve = venueNet - fixedTotal - social
  // GST quarantine: 1/11 of GST-inclusive profit (~9.09%)
  const gstQuarantine = preReserve > 0 ? preReserve / 11 : 0
  const postGST = preReserve - gstQuarantine
  const ownerReserve = postGST > 0 ? postGST * 0.20 : 0
  const distributable = postGST - ownerReserve
  const gareth = distributable * 0.40

  return { totalTickets, venueNet, fixedTotal, social, preReserve, distributable, gareth }
}

export function breakeven(run: Run): number | null {
  // Binary search for the combined sell-through that breaks even
  // Assumes all shows have the same sell-through %
  for (let p = 1; p <= 100; p++) {
    const pct = p / 100
    const result = calcRun(run, run.shows.map(() => pct))
    if (result.preReserve >= 0) return pct  // breakeven is pre-reserve, not post-GST
  }
  return null
}

export const RUNS: Run[] = [
  {
    id: 'R01', name: 'Broken Hill · Renmark · Adelaide', region: 'Group 2',
    shows: [
      { venue: 'Broken Hill Civic Centre', date: 'Wed 11 Feb', status: 'CONFIRMED', capacity: 300, nettPrice: 75, bookingFee: 5, ccPct: 0.01, apraPct: 0.02, venueHireFlat: 800, venueHirePct: 0, onCosts: 1200 },
      { venue: 'Chaffey Theatre Renmark', date: 'Thu 12 Feb', status: 'CONFIRMED', capacity: 476, nettPrice: 75, bookingFee: 5, ccPct: 0.01, apraPct: 0.02, venueHireFlat: 1500, venueHirePct: 0, onCosts: 2000 },
      { venue: 'Thebarton Theatre Adelaide', date: 'Sat 13 Feb', status: 'CONFIRMED', capacity: 2500, nettPrice: 75, bookingFee: 7.50, ccPct: 0.015, apraPct: 0.02, venueHireFlat: 18000, venueHirePct: 0, onCosts: 15200 },
    ],
    fixedCosts: { fb_ads: 12000, flights: 3000, accom: 4200, food: 675, van: 1250, fuel_van: 800, car_hire: 600, driver: 400, sound: 1800, lights: 1800, pm: 750, lighting_hire: 330, bass: 1800, keys: 1800 },
    harbourPct: 0.10,
    warnings: ['Adelaide on-costs ($15,200) unconfirmed — awaiting Michael']
  },
  {
    id: 'R02', name: 'Taree · Wyong', region: 'Group 2',
    shows: [
      { venue: 'Manning Entertainment Centre Taree', date: 'Thu 26 Feb', status: 'CONFIRMED', capacity: 528, nettPrice: 75, bookingFee: 5.50, ccPct: 0.01, apraPct: 0.02, venueHireFlat: 2200, venueHirePct: 0, onCosts: 3500 },
      { venue: 'The Wyong Theatre', date: 'Fri 27 Feb', status: 'CONFIRMED', capacity: 470, nettPrice: 75, bookingFee: 5, ccPct: 0.01, apraPct: 0.02, venueHireFlat: 2000, venueHirePct: 0, onCosts: 2800 },
    ],
    fixedCosts: { fb_ads: 7000, flights: 2000, accom: 2800, food: 450, van: 1250, fuel_van: 400, car_hire: 400, driver: 400, sound: 1200, lights: 1200, pm: 500, lighting_hire: 330, bass: 1200, keys: 1200 },
    harbourPct: 0.10,
  },
  {
    id: 'R03', name: 'Springwood · Thirroul', region: 'Group 2',
    shows: [
      { venue: 'Springwood Cultural Centre', date: 'Thu 12 Mar', status: 'CONFIRMED', capacity: 430, nettPrice: 75, bookingFee: 5, ccPct: 0.01, apraPct: 0.02, venueHireFlat: 1800, venueHirePct: 0, onCosts: 2500 },
      { venue: 'Anita\'s Theatre Thirroul', date: 'Fri 13 Mar', status: 'CONFIRMED', capacity: 650, nettPrice: 75, bookingFee: 6, ccPct: 0.01, apraPct: 0.02, venueHireFlat: 2500, venueHirePct: 0, onCosts: 3200 },
    ],
    fixedCosts: { fb_ads: 7000, flights: 2000, accom: 2800, food: 450, van: 1250, fuel_van: 380, car_hire: 400, driver: 400, sound: 1200, lights: 1200, pm: 500, lighting_hire: 330, bass: 1200, keys: 1200 },
    harbourPct: 0.10,
  },
  {
    id: 'R04', name: 'Penrith · Bathurst', region: 'Group 2',
    shows: [
      { venue: 'Penrith Civic Theatre', date: 'Thu 19 Mar', status: 'CONFIRMED', capacity: 484, nettPrice: 75, bookingFee: 5.50, ccPct: 0.01, apraPct: 0.02, venueHireFlat: 2000, venueHirePct: 0, onCosts: 3000 },
      { venue: 'Bathurst Memorial Entertainment Centre', date: 'Fri 20 Mar', status: 'CONFIRMED', capacity: 600, nettPrice: 75, bookingFee: 5.50, ccPct: 0.01, apraPct: 0.02, venueHireFlat: 2200, venueHirePct: 0, onCosts: 3500 },
    ],
    fixedCosts: { fb_ads: 7000, flights: 2000, accom: 2800, food: 450, van: 1250, fuel_van: 420, car_hire: 400, driver: 400, sound: 1200, lights: 1200, pm: 500, lighting_hire: 330, bass: 1200, keys: 1200 },
    harbourPct: 0.10,
  },
  {
    id: 'R05', name: 'Bunbury · Mandurah · Perth', region: 'Group 3',
    shows: [
      { venue: 'Bunbury Regional Entertainment Centre', date: 'Tue 1 Apr', status: 'CONFIRMED', capacity: 1200, nettPrice: 75, bookingFee: 7, ccPct: 0.015, apraPct: 0.02, venueHireFlat: 6000, venueHirePct: 0, onCosts: 8000 },
      { venue: 'Mandurah Performing Arts Centre', date: 'Wed 2 Apr', status: 'CONFIRMED', capacity: 843, nettPrice: 75, bookingFee: 6, ccPct: 0.01, apraPct: 0.02, venueHireFlat: 4500, venueHirePct: 0, onCosts: 6000 },
      { venue: 'Riverside Theatre Perth', date: 'Thu 3 Apr', status: 'CONFIRMED', capacity: 1200, nettPrice: 75, bookingFee: 7, ccPct: 0.015, apraPct: 0.02, venueHireFlat: 7000, venueHirePct: 0, onCosts: 9000 },
    ],
    fixedCosts: { fb_ads: 15000, flights: 5000, accom: 5600, food: 675, van: 0, backline: 4000, car_hire: 900, sound: 1800, lights: 1800, pm: 750, bass: 1800, keys: 1800 },
    harbourPct: 0.10,
    notes: ['WA: fly in day before. Backline hire replaces van.']
  },
  {
    id: 'R06', name: 'Ararat', region: 'Group 1',
    shows: [
      { venue: 'Ararat Town Hall', date: 'Thu 10 Apr', status: 'CONFIRMED', capacity: 420, nettPrice: 75, bookingFee: 4.50, ccPct: 0.01, apraPct: 0.02, venueHireFlat: 1400, venueHirePct: 0, onCosts: 2000 },
    ],
    fixedCosts: { fb_ads: 2500, accom: 1400, food: 225, fuel_brad: 80, fuel_cars: 120, sound: 600, lights: 600, pm: 250, lighting_hire: 330, bass: 600, keys: 600 },
    harbourPct: 0.10,
  },
  {
    id: 'R07', name: 'Dubbo · Narrabri', region: 'Group 2',
    shows: [
      { venue: 'Western Plains Cultural Centre Dubbo', date: 'Thu 16 Apr', status: 'CONFIRMED', capacity: 500, nettPrice: 75, bookingFee: 5.50, ccPct: 0.01, apraPct: 0.02, venueHireFlat: 2000, venueHirePct: 0, onCosts: 3000 },
      { venue: 'Narrabri Shire Council Civic Hall', date: 'Fri 17 Apr', status: 'CONFIRMED', capacity: 350, nettPrice: 75, bookingFee: 5, ccPct: 0.01, apraPct: 0.02, venueHireFlat: 1200, venueHirePct: 0, onCosts: 1800 },
    ],
    fixedCosts: { fb_ads: 6000, flights: 2000, accom: 2800, food: 450, van: 1250, fuel_van: 600, car_hire: 400, driver: 400, sound: 1200, lights: 1200, pm: 500, lighting_hire: 330, bass: 1200, keys: 1200 },
    harbourPct: 0.10,
  },
  {
    id: 'R08', name: 'Albury', region: 'Group 1',
    shows: [
      { venue: 'Albury Entertainment Centre', date: 'Thu 24 Apr', status: 'CONFIRMED', capacity: 800, nettPrice: 75, bookingFee: 6, ccPct: 0.01, apraPct: 0.02, venueHireFlat: 3500, venueHirePct: 0, onCosts: 4500 },
    ],
    fixedCosts: { fb_ads: 3500, accom: 1400, food: 225, fuel_brad: 130, fuel_cars: 200, sound: 600, lights: 600, pm: 250, lighting_hire: 330, bass: 600, keys: 600 },
    harbourPct: 0.10,
  },
  {
    id: 'R09', name: 'Sydney State Theatre', region: 'Group 2',
    shows: [
      { venue: 'State Theatre Sydney', date: 'Thu 20 Nov', status: 'CONFIRMED', capacity: 2052, nettPrice: 85, bookingFee: 10, ccPct: 0.015, apraPct: 0.02, venueHireFlat: 25000, venueHirePct: 0, onCosts: 28000 },
    ],
    fixedCosts: { fb_ads: 8000, flights: 2000, accom: 1400, food: 225, sound: 600, lights: 600, pm: 250, bass: 600, keys: 600 },
    harbourPct: 0.10,
    warnings: ['Flagship venue — high cost base. Near-sellout required to be profitable.']
  },
  {
    id: 'R10', name: 'Newcastle · Picton', region: 'Group 2',
    shows: [
      { venue: 'Newcastle Civic Theatre', date: 'Fri 30 Apr', status: '2P', capacity: 1474, nettPrice: 75, bookingFee: 7.50, ccPct: 0.012, apraPct: 0.02, venueHireFlat: 5785, venueHirePct: 0, onCosts: 9062 },
      { venue: 'Wollondilly PAC Picton', date: 'Sat 1 May', status: 'HELD', capacity: 351, nettPrice: 75, bookingFee: 5.20, ccPct: 0.008, apraPct: 0.02, venueHireFlat: 1200, venueHirePct: 0, onCosts: 1460 },
    ],
    fixedCosts: { fb_ads: 7500, flights: 2000, accom: 2800, food: 450, van: 1250, fuel_van: 426, car_hire: 400, car_fuel: 56, driver: 400, sound: 1200, lights: 1200, pm: 500, lighting_hire: 330, bass: 1200, keys: 1200 },
    harbourPct: 0.10,
    warnings: ['Newcastle 2P — two acts ahead', 'Newcastle on-cost data discrepancy: 2023 history $9k vs 2026 "Newcastle Theatre" ~$19k unresolved'],
  },
  {
    id: 'R11', name: 'Bega · Canberra', region: 'Group 2',
    shows: [
      { venue: 'Bega Valley Civic Centre', date: 'Fri 7 May', status: 'HELD', capacity: 450, nettPrice: 75, bookingFee: 0, ccPct: 0.01, apraPct: 0.02, venueHireFlat: 1100, venueHirePct: 0, onCosts: 2371 },
      { venue: 'Canberra Theatre', date: 'Sat 8 May', status: 'EOI', capacity: 1239, nettPrice: 85.49, bookingFee: 10.84, ccPct: 0.01, apraPct: 0.02, venueHireFlat: 6699, venueHirePct: 0, onCosts: 14559 },
    ],
    fixedCosts: { fb_ads: 8500, flights: 2000, accom: 2800, food: 450, van: 1250, fuel_van: 326, car_hire: 400, car_fuel: 98, driver: 400, sound: 1200, lights: 1200, pm: 500, lighting_hire: 330, bass: 1200, keys: 1200 },
    harbourPct: 0.10,
    warnings: ['Canberra EOI — Harbour has not approached venue. Run does not exist yet.', 'Bega alone cannot justify Group 2 costs'],
  },
  {
    id: 'R12', name: 'Goulburn · Chatswood', region: 'Group 2',
    shows: [
      { venue: 'Goulburn Performing Arts Centre', date: 'Fri 14 May', status: 'HELD', capacity: 403, nettPrice: 75, bookingFee: 3.30, ccPct: 0.01, apraPct: 0.02, venueHireFlat: 1650, venueHirePct: 0, onCosts: 6410 },
      { venue: 'The Concourse Chatswood', date: 'Sat 15 May', status: '2P', capacity: 1000, nettPrice: 75, bookingFee: 8.95, ccPct: 0.01, apraPct: 0.02, venueHireFlat: 6600, venueHirePct: 0, onCosts: 4534 },
    ],
    fixedCosts: { fb_ads: 6000, flights: 2000, accom: 2800, food: 450, van: 1250, fuel_van: 364, car_hire: 400, car_fuel: 84, driver: 400, sound: 1200, lights: 1200, pm: 500, lighting_hire: 330, bass: 1200, keys: 1200 },
    harbourPct: 0.10,
    warnings: ['CRITICAL: Chatswood 2024 sell-through was 32% — lost $3,051 on that show', 'Chatswood still 2P — two acts ahead'],
  },
  {
    id: 'R13', name: 'Hobart · Launceston', region: 'Group 2',
    shows: [
      { venue: 'Wrest Point Showroom Hobart', date: 'Fri 4 Jun', status: 'HELD', capacity: 348, nettPrice: 75, bookingFee: 6.65, ccPct: 0.01, apraPct: 0.02, venueHireFlat: 2200, venueHirePct: 0, onCosts: 6334 },
      { venue: 'Albert Hall Launceston', date: 'Sat 5 Jun', status: 'HELD', capacity: 950, nettPrice: 75, bookingFee: 3.85, ccPct: 0.016, apraPct: 0.02, venueHireFlat: 1500, venueHirePct: 0, onCosts: 2508 },
    ],
    fixedCosts: { fb_ads: 6000, flights: 2000, accom: 2800, food: 450, van: 800, ferry: 1500, fuel_van: 153, car_hire: 400, car_fuel: 48, driver: 800, driver_accom: 300, sound: 1200, lights: 1200, pm: 500, lighting_hire: 330, bass: 1200, keys: 1200 },
    harbourPct: 0.10,
    notes: ['First Tasmania run. Van via Spirit of Tasmania ferry.', 'Urban Music production quote is ~12 months old — refresh before confirming.'],
  },
  {
    id: 'R14', name: 'Hamilton · Geelong', region: 'Group 1',
    shows: [
      { venue: 'Hamilton Performing Arts Centre', date: 'Fri 10 Sep', status: 'HELD', capacity: 452, nettPrice: 75, bookingFee: 6.50, ccPct: 0.03, apraPct: 0.02, venueHireFlat: 1400, venueHirePct: 0.15, onCosts: 1718 },
      { venue: 'Geelong Arts Centre Playhouse', date: 'Sat 11 Sep', status: '2P', capacity: 764, nettPrice: 75, bookingFee: 4.80, ccPct: 0.01, apraPct: 0.02, venueHireFlat: 4685, venueHirePct: 0, onCosts: 2899 },
    ],
    fixedCosts: { fb_ads: 6000, accom: 2800, food: 450, fuel_brad: 165, fuel_cars: 220, sound: 1200, lights: 1200, pm: 500, lighting_hire: 330, bass: 1200, keys: 1200 },
    harbourPct: 0.10,
    notes: ['Group 1 self-drive — no flights, no van hire. Lowest cost run in this batch.'],
  },
]

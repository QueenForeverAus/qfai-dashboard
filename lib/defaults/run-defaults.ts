// Hardcoded defaults for confirmed runs. Ticket prices MUST come from the latest Harbour
// schedule (e.g. Draft 22) — nett adult price — not a flat regional assumption.
// Other cost seeds still derived from Gig Costings / historical venue data.

export type StaffLineItem = {
  role: string
  rate: number    // $/hr for true hourly items; full amount when hours=1, headcount=1 (lump sum)
  hours: number
  headcount: number
  source?: string // e.g. 'Historical 2024 remittance', 'Harbour quote Draft 22', 'Michael Richardson estimate Jul 2026', 'Educated guess'
}

export type ShowDefault = {
  showOrder: number
  venueName: string
  venueCity: string
  state: string
  showDate: string
  capacity: number
  ticketPrice: number
  venueHire: { value: number; state: string; source: string }
  venueStaff: { value: number; state: string; source: string }
  venueStaffItems: StaffLineItem[]
}

export type RunDefault = {
  flights: { value: number; state: string; source: string } | null
  accommodation: { value: number; state: string; source: string }
  accommodationNights: number
  groundTransport: { value: number; state: string; source: string }
  groundTransportItems?: { description: string; notes: string; amount: number }[]
  backlineHire?: { value: number; state: string; source: string }
  bradDriverFee: { value: number; state: string; source: string } | null
  crewTravelDay: { value: number; state: string; source: string } | null
  crewTravelDayItems?: { description: string; notes: string; amount: number }[]
  perDiems: { value: number; state: string; source: string }
  perDiemDays: number
  fbAds: { value: number; state: string; source: string }
  fbAdsItems?: { venueCity: string; amount: number; notes: string }[]
  shows: ShowDefault[]
}

export const RUN_DEFAULTS: Record<string, RunDefault> = {
  R01: {
    flights: { value: 2500, state: 'estimated', source: 'Planning estimate — SA bracket. 🔴 Likely low for BHQ multi-city MEL→BHQ→ADL→MEL routing. Gareth to price actual fares.' },
    accommodation: { value: 4200, state: 'estimated', source: '$1,400/show-night × 3 (Thu–Sat). ⚠ Excludes Brad solo Wed night Broken Hill (~$150–200). +$1,400 if Sun return falls Mon.' },
    accommodationNights: 3,
    groundTransport: { value: 2448, state: 'estimated', source: 'Van hire (Group 2, MEL) $1,250 + van fuel (~2,100 km) ~$441 + Kia Carnival $400 + local fuel ~$357.' },
    groundTransportItems: [
      { description: 'Van hire — Melbourne (Group 2)', notes: 'Standard MEL depot rate', amount: 1250 },
      { description: 'Van fuel', notes: '~2,100 km return', amount: 441 },
      { description: 'Kia Carnival hire', notes: '2 days × $200', amount: 400 },
      { description: 'Local fuel', notes: 'Between shows', amount: 357 },
    ],
    bradDriverFee: { value: 400, state: 'known', source: 'Brad Hodgkinson — $400/weekday (Wed 10 Feb off work). Fixed agreed rate.' },
    crewTravelDay: null,
    perDiems: { value: 240, state: 'known', source: '$40/day × 2 people (Darryn + Danny) × 3 days (Thu–Sat).' },
    perDiemDays: 3,
    fbAds: { value: 10000, state: 'estimated', source: 'Per-venue tiered by capacity.' },
    fbAdsItems: [
      { venueCity: 'Broken Hill', amount: 2500, notes: 'Cap 548 → $2,500 bracket' },
      { venueCity: 'Renmark',     amount: 2500, notes: 'Cap ~400 → $2,500 bracket' },
      { venueCity: 'Adelaide',    amount: 5000, notes: 'Thebarton cap 1,892 → $5,000 bracket' },
    ],
    shows: [
      {
        showOrder: 1, venueName: 'Broken Hill Civic Centre', venueCity: 'Broken Hill', state: 'NSW', showDate: '2027-02-11',
        capacity: 548, ticketPrice: 75,
        venueHire: { value: 1425, state: 'known', source: '$1,425 flat (8 hrs). Source: Draft 22 Schedule. ✅ Matches 2024 historical actual exactly. ⚠ 9-hr show day may need +1 hr (rate not quoted).' },
        venueStaff: { value: 4425, state: 'estimated', source: 'Historical 2024 actual (394 tix): evening surcharge $519, ushers (5) $1,600, ticket scanners $480, followspot $280+$90, box office $240+$114, additional tech $750, isolation fire $353.' },
        venueStaffItems: [
          { role: 'Evening Surcharge', rate: 519, hours: 1, headcount: 1, source: 'Historical 2024 remittance (lump sum — 394 tix)' },
          { role: 'Ushers', rate: 320, hours: 1, headcount: 5, source: 'Historical 2024 remittance — $1,600 total / 5 staff' },
          { role: 'Ticket Scanners', rate: 480, hours: 1, headcount: 1, source: 'Historical 2024 remittance (lump sum)' },
          { role: 'Followspot Op', rate: 370, hours: 1, headcount: 1, source: 'Historical 2024 remittance — $280 + $90 penalty' },
          { role: 'Box Office', rate: 354, hours: 1, headcount: 1, source: 'Historical 2024 remittance — $240 + $114 loading' },
          { role: 'Additional Tech', rate: 750, hours: 1, headcount: 1, source: 'Historical 2024 remittance (lump sum)' },
          { role: 'Isolation / Fire', rate: 353, hours: 1, headcount: 1, source: 'Historical 2024 remittance (lump sum)' },
        ],
      },
      {
        showOrder: 2, venueName: 'Chaffey Theatre', venueCity: 'Renmark', state: 'SA', showDate: '2027-02-12',
        capacity: 490, ticketPrice: 75,
        venueHire: { value: 3450, state: 'estimated', source: 'MAX($1,980 flat, 12.5% NBO). At 75% ST (368 tix): 12.5% × $27,600 NBO = $3,450. ⚠ 2024 historical billed $2,750 (higher than old flat — deal structure changed). Flag discrepancy with Harbour.' },
        venueStaff: { value: 924, state: 'estimated', source: '⚠ Hire fee INCLUDES: House Manager (4h), Theatre Attendants (4h), Duty Technician (6h), standard lighting/sound rig, cleaning, data projector, hazers. On-costs = ADDITIONAL charges only (package overruns, extras beyond hire). 2024 historical actual: $923.34 at 157 tix (FOH Manager Overtime $27.50 + Additional Tech Staff $756.25 + Energy $139.59). 2027 may differ — Michael to confirm.' },
        venueStaffItems: [
          { role: 'FOH Manager Overtime (beyond 4h included)', rate: 27.50, hours: 1, headcount: 1, source: 'Historical 2024 remittance (157 tix) — lump sum. House Manager ran over included 4h. Likely similar or higher at larger shows.' },
          { role: 'Additional Tech Staff (beyond 6h Duty Technician included)', rate: 756.25, hours: 1, headcount: 1, source: 'Historical 2024 remittance (157 tix) — lump sum. QF bump-in typically exceeds the included 6h. Michael to verify hours needed vs included allowance for 2027.' },
          { role: 'Electricity (separate charge)', rate: 139.59, hours: 1, headcount: 1, source: 'Historical 2024 remittance (157 tix) — billed separately from hire. May vary by show length/equipment. Confirm if still charged in 2027 or now included.' },
        ],
      },
      {
        showOrder: 3, venueName: 'Thebarton Theatre', venueCity: 'Adelaide', state: 'SA', showDate: '2027-02-13',
        capacity: 1892, ticketPrice: 100.02,
        venueHire: { value: 11000, state: 'known', source: '$11,000 flat ($3,300 deposit + $7,700 settlement). Source: Draft 22 Schedule. ✅ Matches 2026 historical actual.' },
        venueStaff: { value: 23355, state: 'estimated', source: '⚠ RATE CARD ESTIMATE at 75% ST (~1,419 tix). Source: Harbour rate card (Inhouse S&L $8,250 flat; FOH/Support/Ticket/Fire $66/hr; Security $70.40/hr; Security Supervisor $72.60/hr; Staff Manager $71.50/hr; Cleaning $880; Electricity $880). Historical 2026 actual was $17,812 at only 35% house (663 tix) — more FOH, security & ushers at higher sell-through. AV Production (from 2026: $5,500) not in rate card — may be separately quoted; confirm with Michael.' },
        venueStaffItems: [
          { role: 'In-house Sound & Lighting (package)', rate: 8250, hours: 1, headcount: 1, source: 'Harbour rate card — flat package fee. 2026 historical showed $5,500 S&L + $5,500 AV Production separately; 2027 rate may bundle differently. Confirm with Michael.' },
          { role: 'FOH Staff / Ushers', rate: 66, hours: 4, headcount: 18, source: 'Harbour rate card $66/hr — headcount estimated at 18 for ~1,419 tix (75% ST). 2026 actual used ~13 at 663 tix. Michael to adjust.' },
          { role: 'Support Event Staff', rate: 66, hours: 4, headcount: 5, source: 'Harbour rate card $66/hr — estimated 5 support staff for a 1,892-cap venue at 75% ST.' },
          { role: 'Ticket Seller', rate: 66, hours: 3, headcount: 4, source: 'Harbour rate card $66/hr — estimated 4 ticket sellers × 3h (doors period). Michael to adjust.' },
          { role: 'Fire Warden', rate: 66, hours: 5, headcount: 2, source: 'Harbour rate card $66/hr — 2 wardens required. 2026 actual: $264 total (matches ~2 × $66 × 2h).' },
          { role: 'Security', rate: 70.40, hours: 5, headcount: 8, source: 'Harbour rate card $70.40/hr — estimated 8 guards for 1,419 tix. 2026 used ~3 guards at 663 tix. Scale up for higher house.' },
          { role: 'Security Supervisor', rate: 72.60, hours: 5, headcount: 1, source: 'Harbour rate card $72.60/hr (required when 4–10 security). Required at any meaningful house size.' },
          { role: 'Staff Manager', rate: 71.50, hours: 5, headcount: 1, source: 'Harbour rate card $71.50/hr' },
          { role: 'Cleaning (flat)', rate: 880, hours: 1, headcount: 1, source: 'Harbour rate card — flat fee. Matches 2026 historical exactly.' },
          { role: 'Electricity (flat)', rate: 880, hours: 1, headcount: 1, source: 'Harbour rate card — flat fee. Matches 2026 historical exactly.' },
        ],
      },
    ],
  },

  R02: {
    flights: { value: 2000, state: 'estimated', source: 'Planning estimate — Sydney/Central NSW bracket. Thu fly-in assumed (SYD→Taree = 3.5 hrs, over same-day rule). Price PQQ/TRO alternative too.' },
    accommodation: { value: 4200, state: 'estimated', source: '$1,400/night × 3 (includes Thu pre-show night 25 Feb + Fri + Sat). 7 rooms.' },
    accommodationNights: 3,
    groundTransport: { value: 2447, state: 'estimated', source: 'Van hire (Group 2, MEL) $1,250 + van fuel (2,280 km return) $477 + Kia Carnival hire $600 ($200/day × 3) + local car fuel $120.' },
    groundTransportItems: [
      { description: 'Van hire — Melbourne (Group 2)', notes: 'Standard MEL depot rate', amount: 1250 },
      { description: 'Van fuel', notes: '2,280 km return', amount: 477 },
      { description: 'Kia Carnival hire', notes: '3 days × $200', amount: 600 },
      { description: 'Local fuel', notes: 'Between shows', amount: 120 },
    ],
    bradDriverFee: { value: 400, state: 'known', source: 'Brad Hodgkinson — $400/weekday (Thu 25 Feb off work). Fixed agreed rate.' },
    crewTravelDay: { value: 500, state: 'estimated', source: 'Adam Dahl + Michael Richardson $250 each for non-performance Thursday fly-in. ⚠ If Sun return after midday, add ~$500 more.' },
    crewTravelDayItems: [
      { description: 'Adam Dahl', notes: 'Non-performance Thursday fly-in', amount: 250 },
      { description: 'Michael Richardson', notes: 'Non-performance Thursday fly-in', amount: 250 },
    ],
    perDiems: { value: 240, state: 'known', source: '$40/day × 2 people (Darryn + Danny) × 3 days (Thu–Sat).' },
    perDiemDays: 3,
    fbAds: { value: 5000, state: 'estimated', source: '$2,500/venue × 2 venues (500 cap each). Payee: Meta/Facebook.' },
    fbAdsItems: [
      { venueCity: 'Taree', amount: 2500, notes: 'Cap 500 → $2,500 bracket' },
      { venueCity: 'Wyong', amount: 2500, notes: 'Cap 500 → $2,500 bracket' },
    ],
    shows: [
      {
        showOrder: 1, venueName: 'Manning Entertainment Centre', venueCity: 'Taree', state: 'NSW', showDate: '2027-02-26',
        capacity: 500, ticketPrice: 75,
        venueHire: { value: 3300, state: 'estimated', source: 'MAX($1,400 flat, 11% GBO). At 75% ST (375 tix): 11% × $80 gross × 375 = $3,300. Source: Draft 22. ⚠ 2024 historical was $2,660 (10% NBO on 372 tix) — flag discrepancy.' },
        venueStaff: { value: 2837, state: 'estimated', source: 'Historical 2024 actual (372 tix): venue marketing $660, tech staff $1,444, followspot op $223, FOH mgr $309, catering $200.' },
        venueStaffItems: [
          { role: 'Venue Marketing', rate: 660, hours: 1, headcount: 1, source: 'Historical 2024 remittance (372 tix) — lump sum' },
          { role: 'Tech Staff', rate: 1444, hours: 1, headcount: 1, source: 'Historical 2024 remittance (372 tix) — lump sum' },
          { role: 'Followspot Op', rate: 223, hours: 1, headcount: 1, source: 'Historical 2024 remittance (372 tix) — lump sum' },
          { role: 'FOH Manager', rate: 309, hours: 1, headcount: 1, source: 'Historical 2024 remittance (372 tix) — lump sum' },
          { role: 'Catering', rate: 200, hours: 1, headcount: 1, source: 'Historical 2024 remittance (372 tix) — lump sum' },
        ],
      },
      {
        showOrder: 2, venueName: 'Art House', venueCity: 'Wyong', state: 'NSW', showDate: '2027-02-27',
        capacity: 500, ticketPrice: 75,
        venueHire: { value: 3630, state: 'estimated', source: '⚠ $3,630 flat (5 hr quote only) — LIKELY UNDERSTATED. Historical: $4,709 (2024), $5,555 (2026). Full show day (~9 hrs) ≈ +$1,540 extra. Recommend budgeting ~$5,200 pending Harbour confirmation.' },
        venueStaff: { value: 4744, state: 'estimated', source: 'Historical 2026 actual (477 tix): audio/lighting techs $1,595, ushers $485, FOH/function staff $526, projector $550, hazer/megadeck/followspot $704, solo EDM $517, rider $273, LPA fee.' },
        venueStaffItems: [
          { role: 'Audio / Lighting Techs', rate: 1595, hours: 1, headcount: 1, source: 'Historical 2026 remittance (477 tix) — lump sum' },
          { role: 'Ushers', rate: 485, hours: 1, headcount: 1, source: 'Historical 2026 remittance (477 tix) — lump sum' },
          { role: 'FOH / Function Staff', rate: 526, hours: 1, headcount: 1, source: 'Historical 2026 remittance (477 tix) — lump sum' },
          { role: 'Projector Hire', rate: 550, hours: 1, headcount: 1, source: 'Historical 2026 remittance (477 tix) — lump sum' },
          { role: 'Hazer / Megadeck / Followspot', rate: 704, hours: 1, headcount: 1, source: 'Historical 2026 remittance (477 tix) — lump sum' },
          { role: 'Solo EDM', rate: 517, hours: 1, headcount: 1, source: 'Historical 2026 remittance (477 tix) — lump sum' },
          { role: 'Rider', rate: 273, hours: 1, headcount: 1, source: 'Historical 2026 remittance (477 tix) — lump sum' },
          { role: 'LPA Fee', rate: 94, hours: 1, headcount: 1, source: 'Historical 2026 remittance (477 tix) — lump sum' },
        ],
      },
    ],
  },

  R03: {
    flights: { value: 2000, state: 'estimated', source: 'Planning estimate — Sydney/Central NSW bracket. Fri fly-in (show day — tight for 1 pm crew call at Springwood).' },
    accommodation: { value: 2800, state: 'estimated', source: '$1,400/night × 2 (Fri + Sat). ⚠ +$1,400 if Thursday pre-show fly-in chosen.' },
    accommodationNights: 2,
    groundTransport: { value: 2082, state: 'estimated', source: 'Van hire (Group 2, MEL) $1,250 + van fuel (~1,840 km) $383 + Kia Carnival $400 ($200/day × 2) + local car fuel $49.' },
    groundTransportItems: [
      { description: 'Van hire — Melbourne (Group 2)', notes: 'Standard MEL depot rate', amount: 1250 },
      { description: 'Van fuel', notes: '~1,840 km return', amount: 383 },
      { description: 'Kia Carnival hire', notes: '2 days × $200', amount: 400 },
      { description: 'Local fuel', notes: 'Between shows', amount: 49 },
    ],
    bradDriverFee: { value: 400, state: 'known', source: 'Brad Hodgkinson — $400/weekday (Thu 11 Mar off work). Fixed agreed rate.' },
    crewTravelDay: null,
    perDiems: { value: 160, state: 'known', source: '$40/day × 2 people (Darryn + Danny) × 2 days (Fri + Sat). ⚠ +$80 if Thursday fly-in added.' },
    perDiemDays: 2,
    fbAds: { value: 5000, state: 'estimated', source: '$2,500/venue × 2 venues. Payee: Meta/Facebook.' },
    fbAdsItems: [
      { venueCity: 'Springwood', amount: 2500, notes: 'Cap 420 → $2,500 bracket' },
      { venueCity: 'Thirroul', amount: 2500, notes: 'Cap 820 → $2,500 bracket' },
    ],
    shows: [
      {
        showOrder: 1, venueName: 'Blue Mountains Theatre', venueCity: 'Springwood', state: 'NSW', showDate: '2027-03-12',
        capacity: 420, ticketPrice: 75,
        venueHire: { value: 2900, state: 'known', source: '$2,900 flat. Source: Draft 22 Schedule. ✅ Matches 2023 historical actual exactly.' },
        venueStaff: { value: 3285, state: 'estimated', source: 'Historical 2023 actual (375 tix): tech staff $1,798, bump-out $945, FOH staff $380, LPA fee $82, foyer poster $58, hazer $22. Note: 2023 data, may have risen modestly.' },
        venueStaffItems: [
          { role: 'Tech Staff', rate: 1798, hours: 1, headcount: 1, source: 'Historical 2023 remittance (375 tix) — lump sum' },
          { role: 'Bump-out', rate: 945, hours: 1, headcount: 1, source: 'Historical 2023 remittance (375 tix) — lump sum' },
          { role: 'FOH Staff', rate: 380, hours: 1, headcount: 1, source: 'Historical 2023 remittance (375 tix) — lump sum' },
          { role: 'LPA Fee', rate: 82, hours: 1, headcount: 1, source: 'Historical 2023 remittance (375 tix) — lump sum' },
          { role: 'Foyer Poster', rate: 58, hours: 1, headcount: 1, source: 'Historical 2023 remittance (375 tix) — lump sum' },
          { role: 'Hazer', rate: 22, hours: 1, headcount: 1, source: 'Historical 2023 remittance (375 tix) — lump sum' },
        ],
      },
      {
        showOrder: 2, venueName: "Anita's Theatre", venueCity: 'Thirroul', state: 'NSW', showDate: '2027-03-13',
        capacity: 820, ticketPrice: 75,
        venueHire: { value: 4612, state: 'estimated', source: 'MAX($2,750 flat, 10% NBO). At 75% ST (615 tix): 10% × $75 × 615 = $4,612. ✅ Consistent with 2026 actual ($3,897 = 10% of $38,961 NBO at 587 tix).' },
        venueStaff: { value: 10608, state: 'estimated', source: '🔴 Historical 2026 actual (587 tix): standard production $3,730, vision extras $2,155, production extras $971, FOH & box office $1,073, security $851, tech mgr $550, cleaning $501, riser $299, utilities $173, LPA $129, hospitality $177. SCHEDULE quote (~$6,467) omits vision/production extras — use historical figure.' },
        venueStaffItems: [
          { role: 'Standard Production', rate: 3730, hours: 1, headcount: 1, source: 'Historical 2026 remittance (587 tix) — lump sum' },
          { role: 'Vision Extras', rate: 2155, hours: 1, headcount: 1, source: 'Historical 2026 remittance — not in Harbour quote; use actual figure' },
          { role: 'Production Extras', rate: 971, hours: 1, headcount: 1, source: 'Historical 2026 remittance — not in Harbour quote; use actual figure' },
          { role: 'FOH & Box Office', rate: 1073, hours: 1, headcount: 1, source: 'Historical 2026 remittance (lump sum)' },
          { role: 'Security', rate: 851, hours: 1, headcount: 1, source: 'Historical 2026 remittance (lump sum)' },
          { role: 'Tech Manager', rate: 550, hours: 1, headcount: 1, source: 'Historical 2026 remittance (lump sum)' },
          { role: 'Cleaning', rate: 501, hours: 1, headcount: 1, source: 'Historical 2026 remittance (lump sum)' },
          { role: 'Riser', rate: 299, hours: 1, headcount: 1, source: 'Historical 2026 remittance (lump sum)' },
          { role: 'Utilities', rate: 173, hours: 1, headcount: 1, source: 'Historical 2026 remittance (lump sum)' },
          { role: 'LPA', rate: 129, hours: 1, headcount: 1, source: 'Historical 2026 remittance (lump sum)' },
          { role: 'Hospitality', rate: 177, hours: 1, headcount: 1, source: 'Historical 2026 remittance (lump sum)' },
        ],
      },
    ],
  },

  R04: {
    flights: { value: 2000, state: 'estimated', source: 'Planning estimate — Sydney/Central NSW bracket. Fri fly-in (show day — tight for 1 pm crew call at Penrith).' },
    accommodation: { value: 2800, state: 'estimated', source: '$1,400/night × 2 (Fri + Sat). ⚠ +$1,400 if Thursday pre-show fly-in chosen.' },
    accommodationNights: 2,
    groundTransport: { value: 2116, state: 'estimated', source: 'Van hire (Group 2, MEL) $1,250 + van fuel (~1,849 km) $384 + Kia Carnival $400 ($200/day × 2) + local car fuel $82.' },
    groundTransportItems: [
      { description: 'Van hire — Melbourne (Group 2)', notes: 'Standard MEL depot rate', amount: 1250 },
      { description: 'Van fuel', notes: '~1,849 km return', amount: 384 },
      { description: 'Kia Carnival hire', notes: '2 days × $200', amount: 400 },
      { description: 'Local fuel', notes: 'Between shows', amount: 82 },
    ],
    bradDriverFee: { value: 400, state: 'known', source: 'Brad Hodgkinson — $400/weekday (Thu 18 Mar off work). Fixed agreed rate.' },
    crewTravelDay: null,
    perDiems: { value: 160, state: 'known', source: '$40/day × 2 people (Darryn + Danny) × 2 days (Fri + Sat).' },
    perDiemDays: 2,
    fbAds: { value: 5000, state: 'estimated', source: '$2,500/venue × 2 venues. Payee: Meta/Facebook.' },
    fbAdsItems: [
      { venueCity: 'Penrith', amount: 2500, notes: 'Cap 538 → $2,500 bracket' },
      { venueCity: 'Bathurst', amount: 2500, notes: 'Cap 639 → $2,500 bracket' },
    ],
    shows: [
      {
        showOrder: 1, venueName: 'The Joan – Concert Hall', venueCity: 'Penrith', state: 'NSW', showDate: '2027-03-19',
        capacity: 538, ticketPrice: 75,
        venueHire: { value: 1815, state: 'estimated', source: '$1,815 flat (3 pm–10:30 pm). Source: Draft 22 Schedule. ⚠ 2026 actual billed $3,292 (hall+green room combined) — 2027 quote separates green room into on-costs.' },
        venueStaff: { value: 4174, state: 'estimated', source: '2027 SCHEDULE quote (fully itemised): Green Room $536, Box Office $139, Lighting Tech $454, Sound Tech $454, Venue Supervisor $408, FOH Ushers $739, Room clean $176, Foyer clean $143, Dressing Room $182, Green Room clean $44, Radio Mic $110, Data Projector $660, Industry Service Fee $130. ⚠ 2026 actual on-costs were $5,259 at only 259 tix — at 75%+ expect real figure to exceed this.' },
        venueStaffItems: [
          { role: 'Green Room', rate: 536, hours: 1, headcount: 1, source: 'Harbour quote, Draft 22 Schedule (itemised on-costs)' },
          { role: 'Box Office', rate: 139, hours: 1, headcount: 1, source: 'Harbour quote, Draft 22 Schedule' },
          { role: 'Lighting Tech', rate: 454, hours: 1, headcount: 1, source: 'Harbour quote, Draft 22 Schedule' },
          { role: 'Sound Tech', rate: 454, hours: 1, headcount: 1, source: 'Harbour quote, Draft 22 Schedule' },
          { role: 'Venue Supervisor', rate: 408, hours: 1, headcount: 1, source: 'Harbour quote, Draft 22 Schedule' },
          { role: 'FOH Ushers', rate: 739, hours: 1, headcount: 1, source: 'Harbour quote, Draft 22 Schedule' },
          { role: 'Room Clean', rate: 176, hours: 1, headcount: 1, source: 'Harbour quote, Draft 22 Schedule' },
          { role: 'Foyer Clean', rate: 143, hours: 1, headcount: 1, source: 'Harbour quote, Draft 22 Schedule' },
          { role: 'Dressing Room', rate: 182, hours: 1, headcount: 1, source: 'Harbour quote, Draft 22 Schedule' },
          { role: 'Green Room Clean', rate: 44, hours: 1, headcount: 1, source: 'Harbour quote, Draft 22 Schedule' },
          { role: 'Radio Mic', rate: 110, hours: 1, headcount: 1, source: 'Harbour quote, Draft 22 Schedule' },
          { role: 'Data Projector', rate: 660, hours: 1, headcount: 1, source: 'Harbour quote, Draft 22 Schedule' },
          { role: 'Industry Service Fee', rate: 130, hours: 1, headcount: 1, source: 'Harbour quote, Draft 22 Schedule' },
        ],
      },
      {
        showOrder: 2, venueName: 'Bathurst Memorial Entertainment Centre', venueCity: 'Bathurst', state: 'NSW', showDate: '2027-03-20',
        capacity: 639, ticketPrice: 75,
        venueHire: { value: 3594, state: 'estimated', source: 'MAX($2,400 flat, 10% NBO). At 75% ST (479 tix): 10% × $75 × 479 = $3,593. ⚠ 2026 actual billed $1,900 flat — 2027 deal moved to greater-of structure.' },
        venueStaff: { value: 3990, state: 'estimated', source: 'Michael Richardson crew-sizing (28 Jul 2026): Technical staff (2×12h + 1×8h @ $70) $2,240 + Ushers (7 × 3h @ $70) $1,470 + Merch staff (4h @ $70) $280. ⚠ Cross-check: 2026 actual was $2,776 at 311 tix — Michael builds in more staff for larger house.' },
        venueStaffItems: [
          { role: 'Technical Staff (12h)', rate: 70, hours: 12, headcount: 2, source: 'Michael Richardson crew-sizing, Jul 2026 — $70/hr' },
          { role: 'Technical Staff (8h)', rate: 70, hours: 8, headcount: 1, source: 'Michael Richardson crew-sizing, Jul 2026 — $70/hr' },
          { role: 'Ushers (3h)', rate: 70, hours: 3, headcount: 7, source: 'Michael Richardson crew-sizing, Jul 2026 — $70/hr' },
          { role: 'Merch Staff (4h)', rate: 70, hours: 4, headcount: 1, source: 'Michael Richardson crew-sizing, Jul 2026 — $70/hr' },
        ],
      },
    ],
  },

  R05: {
    flights: { value: 4000, state: 'estimated', source: 'WA bracket ~$4,000 return (MEL↔PER, departs Wed). Gareth to book actual fares.' },
    accommodation: { value: 4200, state: 'estimated', source: '$1,400/night × 3 (includes Wed pre-show fly-in night + Thu + Fri). ⚠ +$1,400 if Sat night needed.' },
    accommodationNights: 3,
    groundTransport: { value: 872, state: 'estimated', source: 'Kia Carnival hire $800 (4 days) + car fuel ($72). No van — Group 3 WA; backline hired locally (see Production).' },
    groundTransportItems: [
      { description: 'Kia Carnival hire', notes: '4 days', amount: 800 },
      { description: 'Car fuel', notes: 'Perth area', amount: 72 },
    ],
    backlineHire: { value: 3800, state: 'estimated', source: 'Local WA backline hire — no van (Group 3). Drum kit, keys, guitar amps hired locally. ⚠ $3,800 estimate; get supplier quote before confirming.' },
    bradDriverFee: null,
    crewTravelDay: { value: 500, state: 'estimated', source: 'Adam Dahl + Michael Richardson $250 each for non-performance Wednesday fly-in. Fly home Saturday night (show day) — no return-day fee.' },
    crewTravelDayItems: [
      { description: 'Adam Dahl', notes: 'Non-performance Wednesday fly-in (WA)', amount: 250 },
      { description: 'Michael Richardson', notes: 'Non-performance Wednesday fly-in (WA)', amount: 250 },
    ],
    perDiems: { value: 320, state: 'known', source: '$40/day × 2 people (Darryn + Danny) × 4 days (Wed travel + Thu–Sat).' },
    perDiemDays: 4,
    fbAds: { value: 7500, state: 'estimated', source: '$2,500 Bunbury (810 cap) + $2,500 Mandurah (777 cap) + $2,500 Astor Perth (976 cap). Payee: Meta/Facebook.' },
    fbAdsItems: [
      { venueCity: 'Bunbury', amount: 2500, notes: 'Cap 810 → $2,500 bracket' },
      { venueCity: 'Mandurah', amount: 2500, notes: 'Cap 777 → $2,500 bracket' },
      { venueCity: 'Perth', amount: 2500, notes: 'Cap 976 → $2,500 bracket' },
    ],
    shows: [
      {
        showOrder: 1, venueName: 'Bunbury Regional Entertainment Centre', venueCity: 'Bunbury', state: 'WA', showDate: '2027-04-01',
        capacity: 810, ticketPrice: 75,
        venueHire: { value: 4988, state: 'known', source: '$4,988 flat (8 am–12 am). Source: Draft 22. ✅ 2024 historical was $4,847 — consistent.' },
        venueStaff: { value: 3525, state: 'estimated', source: 'Historical 2024 actual (460 tix): FOH Manager $330, Box Office $220, Technical Labour $2,414 (lump), EIS Fee + Admin + Stage Consumables + Rider $561.' },
        venueStaffItems: [
          { role: 'FOH Manager', rate: 330, hours: 1, headcount: 1, source: 'Historical 2024 remittance (460 tix) — lump sum' },
          { role: 'Box Office', rate: 220, hours: 1, headcount: 1, source: 'Historical 2024 remittance (460 tix) — lump sum' },
          { role: 'Technical Labour', rate: 2414, hours: 1, headcount: 1, source: 'Historical 2024 remittance (460 tix) — lump sum; covers bump-in + show + bump-out crew' },
          { role: 'EIS Fee + Admin + Consumables + Rider', rate: 561, hours: 1, headcount: 1, source: 'Historical 2024 remittance (460 tix) — lump sum' },
        ],
      },
      {
        showOrder: 2, venueName: 'Mandurah Performing Arts Centre', venueCity: 'Mandurah', state: 'WA', showDate: '2027-04-02',
        capacity: 777, ticketPrice: 75,
        venueHire: { value: 3450, state: 'known', source: '$3,450 (up to 8 hrs, incl. bump in/out, cleaning, in-house audio & light). ✅ 2024 historical was $3,300 — consistent.' },
        venueStaff: { value: 3422, state: 'estimated', source: 'Historical 2024 actual (313 tix): FOH Manager $320, Ushers $550, Technical Labour $1,309 (lump), Equipment Hire $746, Beverages + Catering $497.' },
        venueStaffItems: [
          { role: 'FOH Manager', rate: 320, hours: 1, headcount: 1, source: 'Historical 2024 remittance (313 tix) — lump sum' },
          { role: 'Ushers', rate: 550, hours: 1, headcount: 1, source: 'Historical 2024 remittance (313 tix) — lump sum' },
          { role: 'Technical Labour', rate: 1309, hours: 1, headcount: 1, source: 'Historical 2024 remittance (313 tix) — lump sum; covers in-house audio & lighting (included in hire at MPAC)' },
          { role: 'Equipment Hire', rate: 746, hours: 1, headcount: 1, source: 'Historical 2024 remittance (313 tix) — lump sum' },
          { role: 'Beverages + Catering', rate: 497, hours: 1, headcount: 1, source: 'Historical 2024 remittance (313 tix) — lump sum' },
        ],
      },
      {
        showOrder: 3, venueName: 'Astor Theatre', venueCity: 'Perth', state: 'WA', showDate: '2027-04-03',
        capacity: 976, ticketPrice: 75,
        venueHire: { value: 6039, state: 'pending', source: '$8.25 inc GST per paying ticket (no flat fee). Includes in-house PA & lighting, venue staff, crowd controllers, member mail-out + web/FB listing. At 75% ST (732 tix): $8.25 × 732 = $6,039.' },
        venueStaff: { value: 3476, state: 'estimated', source: '2024 actual lighting $2,706 (AG Production) + quote sound day-rate $770. ⚠ $2,706 lighting may bundle equipment/crew — confirm with Michael. 2024 also carried hospitality $245 + marketing $165 (~$410) not modelled.' },
        venueStaffItems: [
          { role: 'Lighting (AG Production)', rate: 2706, hours: 1, headcount: 1, source: 'Historical 2024 remittance — lump sum; may bundle equipment + crew, confirm with Michael' },
          { role: 'Sound Day-Rate', rate: 770, hours: 1, headcount: 1, source: 'Quoted day-rate (Astor per-ticket deal covers most venue staff; these are production add-ons)' },
        ],
      },
    ],
  },

  R06: {
    flights: null,
    accommodation: { value: 1400, state: 'estimated', source: '$1,400/show (Ararat is ~3 hrs from Melbourne — overnight preferred over post-show midnight drive).' },
    accommodationNights: 1,
    groundTransport: { value: 266, state: 'estimated', source: 'Brad fuel $114 (self-drive, Group 1) + band car fuel $152. No van hire for Group 1 runs.' },
    groundTransportItems: [
      { description: 'Brad fuel (self-drive)', notes: 'Group 1 — no van hire', amount: 114 },
      { description: 'Band car fuel', notes: 'MEL → Ararat → MEL', amount: 152 },
    ],
    bradDriverFee: null,
    crewTravelDay: null,
    perDiems: { value: 80, state: 'known', source: '$40/day × 2 people (Darryn + Danny) × 1 day (Sat only).' },
    perDiemDays: 1,
    fbAds: { value: 2500, state: 'estimated', source: '$2,500 for 500-cap Ararat Town Hall. Payee: Meta/Facebook.' },
    fbAdsItems: [
      { venueCity: 'Ararat', amount: 2500, notes: 'Cap 500 → $2,500 bracket' },
    ],
    shows: [
      {
        showOrder: 1, venueName: 'Ararat Town Hall', venueCity: 'Ararat', state: 'VIC', showDate: '2027-04-10',
        capacity: 500, ticketPrice: 75,
        venueHire: { value: 1560, state: 'estimated', source: '$1,560 flat. Source: Draft 22 SCHEDULE (CONFIRMED). 🔴 Draft 13 showed two figures ($3,235 and $1,560) — Draft 22 $1,560 used. No historical settlement to verify. Confirm with Harbour.' },
        venueStaff: { value: 1530, state: 'estimated', source: '2027 quote rates (no historical anchor): ushers (~6 × 3h @ $50) $900 + technician (9h @ $70) $630. ⚠ Real cost could be $1,400–$2,000 depending on staff plan. An earlier working used "$450 stage-standard flat" — use this estimate and confirm.' },
        venueStaffItems: [
          { role: 'Ushers (3h)', rate: 50, hours: 3, headcount: 6, source: 'Educated estimate — 6 ushers × 3h @ $50/hr typical regional rate; no historical anchor for Ararat' },
          { role: 'Technician (9h)', rate: 70, hours: 9, headcount: 1, source: 'Educated estimate — 1 tech × 9h @ $70/hr (bump-in through bump-out); no historical anchor for Ararat' },
        ],
      },
    ],
  },

  R07: {
    flights: { value: 2200, state: 'estimated', source: "Gareth's actual Newcastle fare used (not standard Sydney bracket). Re-price if Tamworth entry/return chosen instead." },
    accommodation: { value: 4200, state: 'estimated', source: '$1,400/night × 3 (Thu Dubbo pre-show + Fri Dubbo + Sat Narrabri). ⚠ Sunday return assumed; confirm if Mon return adds a night.' },
    accommodationNights: 3,
    groundTransport: { value: 2744, state: 'estimated', source: 'Van hire (Group 2 rate, inland NSW) $1,250 + van fuel (~2,335 km) $485 + Kia Carnival $800 ($200/day × 4) + local car fuel $209.' },
    groundTransportItems: [
      { description: 'Van hire — inland NSW (Group 2)', notes: 'Standard MEL depot rate', amount: 1250 },
      { description: 'Van fuel', notes: '~2,335 km return', amount: 485 },
      { description: 'Kia Carnival hire', notes: '4 days × $200', amount: 800 },
      { description: 'Local fuel', notes: 'Between shows', amount: 209 },
    ],
    bradDriverFee: { value: 400, state: 'known', source: 'Brad Hodgkinson — $400/weekday (Thu 15 Apr off work). Fixed agreed rate.' },
    crewTravelDay: { value: 500, state: 'estimated', source: 'Adam Dahl + Michael Richardson $250 each (Thu fly-in to Dubbo). 🔴 If Sunday return via Newcastle arrives after midday, add further $500 (not yet included).' },
    crewTravelDayItems: [
      { description: 'Adam Dahl', notes: 'Non-performance Thursday fly-in to Dubbo', amount: 250 },
      { description: 'Michael Richardson', notes: 'Non-performance Thursday fly-in to Dubbo', amount: 250 },
    ],
    perDiems: { value: 240, state: 'known', source: '$40/day × 2 people (Darryn + Danny) × 3 days (Thu–Sat).' },
    perDiemDays: 3,
    fbAds: { value: 5000, state: 'estimated', source: '$2,500/venue × 2 venues (500 + 658 cap). Payee: Meta/Facebook.' },
    fbAdsItems: [
      { venueCity: 'Dubbo', amount: 2500, notes: 'Cap 500 → $2,500 bracket' },
      { venueCity: 'Narrabri', amount: 2500, notes: 'Cap 658 → $2,500 bracket' },
    ],
    shows: [
      {
        showOrder: 1, venueName: 'Dubbo Regional Theatre & Convention Centre', venueCity: 'Dubbo', state: 'NSW', showDate: '2027-04-16',
        capacity: 500, ticketPrice: 75,
        venueHire: { value: 3375, state: 'estimated', source: 'MAX($2,170 flat, 12% NBO). At 75% ST (375 tix): 12% × $75 × 375 = $3,375. Note: venue hire covers Supervisor + FOH staff up to 8 hrs.' },
        venueStaff: { value: 2853, state: 'estimated', source: '2027 quote (no historical anchor): Technical Staff (1×8h + 1×12h @ $75) $1,500 + Ushers (~4 × 3h @ $112.75) $1,353. 🔴 $112.75/hr usher rate appears abnormal — may be a Harbour typo (at $56/hr, total drops to ~$2,170). Confirm with venue before accepting.' },
        venueStaffItems: [
          { role: 'Technical Staff (8h)', rate: 75, hours: 8, headcount: 1, source: 'Harbour quote, Draft 22 Schedule — $75/hr' },
          { role: 'Technical Staff (12h)', rate: 75, hours: 12, headcount: 1, source: 'Harbour quote, Draft 22 Schedule — $75/hr' },
          { role: 'Ushers — ⚠ rate flagged (3h)', rate: 112.75, hours: 3, headcount: 4, source: 'Harbour quote, Draft 22 Schedule — ⚠ $112.75/hr appears abnormal (possible typo; at $56/hr would be ~$672 not $1,353). Confirm with venue.' },
        ],
      },
      {
        showOrder: 2, venueName: 'Crossing Theatre', venueCity: 'Narrabri', state: 'NSW', showDate: '2027-04-17',
        capacity: 658, ticketPrice: 75,
        venueHire: { value: 1370, state: 'known', source: '$1,370/day flat. Source: Draft 22. Notably low. No ticketing fee for live concerts (online $1/ticket kept by ticketer — not QF cost).' },
        venueStaff: { value: 1800, state: 'estimated', source: '2027 quote (no historical anchor): Dressing Rooms $50 + AV Package $460 + Event Staff (~4 × ~5h @ $64.50) ~$1,290. ⚠ No headcount stated — $1,290 staffing is an estimate for 658 cap; could be $1,000–$1,700. Confirm with Harbour.' },
        venueStaffItems: [
          { role: 'Dressing Rooms', rate: 50, hours: 1, headcount: 1, source: 'Harbour quote, Draft 22 Schedule (flat fee)' },
          { role: 'AV Package', rate: 460, hours: 1, headcount: 1, source: 'Harbour quote, Draft 22 Schedule (flat fee)' },
          { role: 'Event Staff (5h — headcount est.)', rate: 64.50, hours: 5, headcount: 4, source: 'Harbour quote, Draft 22 Schedule — $64.50/hr × 5h; headcount not stated, est. 4 for 658 cap. Confirm with venue.' },
        ],
      },
    ],
  },

  R08: {
    flights: null,
    accommodation: { value: 1400, state: 'estimated', source: '$1,400/show (Albury overnight — preferred over post-show late drive to Melbourne).' },
    accommodationNights: 1,
    groundTransport: { value: 425, state: 'estimated', source: 'Brad fuel $182 (self-drive, Group 1) + band car fuel $243. No van hire for Group 1 runs.' },
    groundTransportItems: [
      { description: 'Brad fuel (self-drive)', notes: 'Group 1 — no van hire', amount: 182 },
      { description: 'Band car fuel', notes: 'MEL → Albury → MEL', amount: 243 },
    ],
    bradDriverFee: null,
    crewTravelDay: null,
    perDiems: { value: 80, state: 'known', source: '$40/day × 2 people (Darryn + Danny) × 1 day (Sat only).' },
    perDiemDays: 1,
    fbAds: { value: 2500, state: 'estimated', source: '$2,500 for 800-cap Albury Entertainment Centre. Payee: Meta/Facebook.' },
    fbAdsItems: [
      { venueCity: 'Albury', amount: 2500, notes: 'Cap 800 → $2,500 bracket' },
    ],
    shows: [
      {
        showOrder: 1, venueName: 'Albury Entertainment Centre', venueCity: 'Albury', state: 'NSW', showDate: '2027-04-24',
        capacity: 800, ticketPrice: 75,
        venueHire: { value: 5400, state: 'estimated', source: 'MAX($2,245 flat, 12% NBO). At 75% ST (600 tix): 12% × $75 × 600 = $5,400. ✅ 2023 historical: $5,437 = 12% of $45,306 NBO (consistent).' },
        venueStaff: { value: 4796, state: 'estimated', source: 'Michael Richardson crew-sizing (28 Jul 2026): Ushers (6 × 3h @ $56.50) $1,017 + Box Office (2h @ $60.50) $121 + Merch Seller (4h @ $56.50) $226 + Duty Tech (12h @ $78) $936 + LX/AV Tech (12h @ $78) $936 + Audio Tech (8h @ $78) $624 + FOH Supervisor $624 + Followspot Op (4h @ $78) $312. ⚠ 2023 actual was $4,034 at 646 tix — Michael builds in followspot and full tech tier.' },
        venueStaffItems: [
          { role: 'Ushers (3h)', rate: 56.50, hours: 3, headcount: 6, source: 'Michael Richardson crew-sizing, Jul 2026 — $56.50/hr (Albury EBA rate)' },
          { role: 'Box Office (2h)', rate: 60.50, hours: 2, headcount: 1, source: 'Michael Richardson crew-sizing, Jul 2026 — $60.50/hr' },
          { role: 'Merch Seller (4h)', rate: 56.50, hours: 4, headcount: 1, source: 'Michael Richardson crew-sizing, Jul 2026 — $56.50/hr' },
          { role: 'Duty Tech (12h)', rate: 78, hours: 12, headcount: 1, source: 'Michael Richardson crew-sizing, Jul 2026 — $78/hr (bump-in through bump-out)' },
          { role: 'LX / AV Tech (12h)', rate: 78, hours: 12, headcount: 1, source: 'Michael Richardson crew-sizing, Jul 2026 — $78/hr' },
          { role: 'Audio Tech (8h)', rate: 78, hours: 8, headcount: 1, source: 'Michael Richardson crew-sizing, Jul 2026 — $78/hr' },
          { role: 'FOH Supervisor (8h)', rate: 78, hours: 8, headcount: 1, source: 'Michael Richardson crew-sizing, Jul 2026 — $78/hr' },
          { role: 'Followspot Op (4h)', rate: 78, hours: 4, headcount: 1, source: 'Michael Richardson crew-sizing, Jul 2026 — $78/hr' },
        ],
      },
    ],
  },

  R09: {
    flights: { value: 2000, state: 'estimated', source: 'Sydney bracket ~$2,000 return (MEL↔SYD). Gareth to book. ⚠ +cost if Friday bump-in requires extra flight.' },
    accommodation: { value: 1400, state: 'estimated', source: '$1,400 × 1 night (Sat). ⚠ +$1,400 if Friday crew/band arrival needed for bump-in at 2,034-cap State Theatre.' },
    accommodationNights: 1,
    groundTransport: { value: 1827, state: 'estimated', source: 'Van hire (Group 2, MEL) $1,250 + van fuel (~1,760 km) $366 + Kia Carnival $200 ($200/day × 1) + local car fuel $11.' },
    groundTransportItems: [
      { description: 'Van hire — Melbourne (Group 2)', notes: 'Standard MEL depot rate', amount: 1250 },
      { description: 'Van fuel', notes: '~1,760 km return', amount: 366 },
      { description: 'Kia Carnival hire', notes: '1 day × $200', amount: 200 },
      { description: 'Local fuel', notes: 'Between shows', amount: 11 },
    ],
    bradDriverFee: { value: 400, state: 'known', source: 'Brad Hodgkinson — $400/weekday (Fri 19 Nov off work). Fixed agreed rate.' },
    crewTravelDay: null,
    perDiems: { value: 80, state: 'known', source: '$40/day × 2 people (Darryn + Danny) × 1 day (Sat). ⚠ +$80 per person per extra day if Friday bump-in arrival used.' },
    perDiemDays: 1,
    fbAds: { value: 6000, state: 'estimated', source: 'Cap 2,034 exceeds the $6,000 top bracket (1,501–2,000). Likely $6,000–$7,000. Flagged. Payee: Meta/Facebook.' },
    fbAdsItems: [
      { venueCity: 'Sydney', amount: 6000, notes: 'Cap 2,034 → $6,000 top bracket (flag — may need $7,000)' },
    ],
    shows: [
      {
        showOrder: 1, venueName: 'State Theatre', venueCity: 'Sydney', state: 'NSW', showDate: '2027-11-20',
        capacity: 2034, ticketPrice: 97.45,
        venueHire: { value: 26280, state: 'known', source: 'Minimum fee: Venue Hire $14,240 + Standing Charges $5,990 + FOH Staff $6,050. FOH staff is inside the minimum — not double-counted in on-costs.' },
        venueStaff: { value: 28012, state: 'estimated', source: '🔴 FLOOR ONLY — Historical 2026 actual (859 tix, 42% house): Lighting $7,313, Vision Package $5,095, Staging $4,179, Audio $3,894, Flyman $1,232, LX Systems Tech $918, Stage Door $996, Bump Out $680, LX Crew $616, Fire & Safety Warden $648, Bump In $552, Security $425, Followspot $276 + consumables. At 75–100% expect materially higher (more ushers @ $65/hr, security @ $85/hr, casual FOH).' },
        venueStaffItems: [
          { role: 'Lighting', rate: 7313, hours: 1, headcount: 1, source: 'Historical 2026 remittance (859 tix / 42% house) — lump sum. Expect higher at 75%+.' },
          { role: 'Vision Package', rate: 5095, hours: 1, headcount: 1, source: 'Historical 2026 remittance — lump sum' },
          { role: 'Staging', rate: 4179, hours: 1, headcount: 1, source: 'Historical 2026 remittance — lump sum' },
          { role: 'Audio', rate: 3894, hours: 1, headcount: 1, source: 'Historical 2026 remittance — lump sum' },
          { role: 'Flyman', rate: 1232, hours: 1, headcount: 1, source: 'Historical 2026 remittance — lump sum' },
          { role: 'LX Systems Tech', rate: 918, hours: 1, headcount: 1, source: 'Historical 2026 remittance — lump sum' },
          { role: 'Stage Door', rate: 996, hours: 1, headcount: 1, source: 'Historical 2026 remittance — lump sum' },
          { role: 'Bump Out', rate: 680, hours: 1, headcount: 1, source: 'Historical 2026 remittance — lump sum' },
          { role: 'LX Crew', rate: 616, hours: 1, headcount: 1, source: 'Historical 2026 remittance — lump sum' },
          { role: 'Fire & Safety Warden', rate: 648, hours: 1, headcount: 1, source: 'Historical 2026 remittance — lump sum (State Theatre mandatory)' },
          { role: 'Bump In', rate: 552, hours: 1, headcount: 1, source: 'Historical 2026 remittance — lump sum' },
          { role: 'Security', rate: 425, hours: 1, headcount: 1, source: 'Historical 2026 remittance — lump sum' },
          { role: 'Followspot', rate: 276, hours: 1, headcount: 1, source: 'Historical 2026 remittance — lump sum' },
          { role: 'Consumables + Other', rate: 1188, hours: 1, headcount: 1, source: 'Historical 2026 remittance — lump sum (misc. charges)' },
        ],
      },
    ],
  },
  R10: {
    flights: { value: 2000, state: 'estimated', source: 'Non-standard open-jaw route: MEL→Newcastle (Fri) / Sydney→MEL (Sun). Sheet estimate $2,000 — Gareth to confirm actual fare once booked.' },
    accommodation: { value: 2800, state: 'estimated', source: '$1,400/night × 2 nights (Thu pre-show + Fri after Newcastle). 7 rooms. Sat night not required — fly out Sun morning from Sydney.' },
    accommodationNights: 2,
    groundTransport: { value: 2132, state: 'estimated', source: 'Van hire $1,250 + van fuel (MEL→Newcastle→Picton→Melbourne ~2,040 km) $426 + Kia Carnival $400 ($200/gig × 2) + local fuel $56.' },
    groundTransportItems: [
      { description: 'Van hire — Melbourne (Group 2)', notes: '~$1,250/weekend, Sydney/Central NSW rate', amount: 1250 },
      { description: 'Van fuel', notes: '~2,040 km loop MEL→Newcastle→Picton→MEL @ 11L/100km × $1.90/L', amount: 426 },
      { description: 'Kia Carnival hire', notes: '2 gigs × $200 (Newcastle Airport↔Civic↔Picton↔Sydney Airport)', amount: 400 },
      { description: 'Local fuel', notes: '~280 km + 15 km buffer @ 10L/100km × $1.90/L', amount: 56 },
    ],
    bradDriverFee: { value: 400, state: 'estimated', source: 'Brad Hodgkinson — $400 for Thu departure (weekday off work). ASSUMPTION — confirm actual driving days.' },
    crewTravelDay: null,
    perDiems: { value: 240, state: 'estimated', source: '$40/day × 2 people (Darryn + Danny) × 3 days (Thu travel + Fri Newcastle show + Sat Picton show).' },
    perDiemDays: 3,
    fbAds: { value: 7500, state: 'estimated', source: 'Tiered by venue capacity: Newcastle cap 1,474 → $5,000 (1,001–1,500 bracket); Picton cap 351 → $2,500 (300–600 bracket). Total $7,500. Source: R10 sheet. Payee: Meta/Facebook.' },
    fbAdsItems: [
      { venueCity: 'Newcastle', amount: 5000, notes: 'Cap 1,474 → $5,000 bracket (1,001–1,500)' },
      { venueCity: 'Picton', amount: 2500, notes: 'Cap 351 → $2,500 bracket (300–600)' },
    ],
    shows: [
      {
        showOrder: 1, venueName: 'Newcastle Civic Theatre', venueCity: 'Newcastle', state: 'NSW', showDate: '2027-04-30',
        capacity: 1474, ticketPrice: 75,
        venueHire: { value: 5785, state: 'known', source: '$5,785 flat per Draft 22 Schedule. ⚠️ 2026 remittance shows a "Newcastle Theatre" entry with $7,812 hire + $11,200 on-costs ≈ $19,000 — if same venue under a different name, costs could be $4k+ higher. Confirm with Harbour.' },
        venueStaff: { value: 9062, state: 'estimated', source: 'Real 2023 historical remittance lump-sum: Technical Production/Security/FOH/Ticket Office $5,883 + Equipment Hire $1,494 + St John/Industry Fees $424 + Catering $510 + Event Marketing $751 = $9,062. Confirmed approach with Michael (28 Jul 2026).' },
        venueStaffItems: [
          { role: 'Technical Production + Security + FOH + Ticket Office Staff', rate: 5883, hours: 1, headcount: 1, source: 'Historical 2023 remittance — lump sum (no individual breakdown available)' },
          { role: 'Production Equipment Hire', rate: 1494, hours: 1, headcount: 1, source: 'Historical 2023 remittance — lump sum' },
          { role: 'Industry / Compliance Fees (St John + Service Fees)', rate: 424, hours: 1, headcount: 1, source: 'Historical 2023 remittance — lump sum' },
          { role: 'Catering', rate: 510, hours: 1, headcount: 1, source: 'Historical 2023 remittance — lump sum' },
          { role: 'Event Marketing + Selling Staff', rate: 751, hours: 1, headcount: 1, source: 'Historical 2023 remittance — lump sum' },
        ],
      },
      {
        showOrder: 2, venueName: 'Wollondilly Performing Arts Centre', venueCity: 'Picton', state: 'NSW', showDate: '2027-05-01',
        capacity: 351, ticketPrice: 75,
        venueHire: { value: 1200, state: 'known', source: '$1,200 flat per Draft 22 Schedule. Big Band Tech Package ($250) included in on-costs per Michael Richardson (28 Jul 2026). Capacity costed at 351 (Standard Theatre End-On mode) per Gareth confirmation.' },
        venueStaff: { value: 1460, state: 'estimated', source: 'Per venue terms + Big Band Tech Package (per Michael Richardson, 28 Jul 2026): Technician $195 (3h @ $65) + BOH Staff $100 (2h @ $50) + FOH Duty Mgr $165 (3h @ $55) + FOH Staff $100 (2h @ $50) + Cleaning $200 + Marketing Levy $300 + Basic Tech $150 + Big Band Package $250.' },
        venueStaffItems: [
          { role: 'Technician', rate: 65, hours: 3, headcount: 1, source: 'Venue terms, Draft 22 — $65/hr × 3h' },
          { role: 'Other BOH Staff', rate: 50, hours: 2, headcount: 1, source: 'Venue terms, Draft 22 — $50/hr × 2h' },
          { role: 'FOH Duty Manager', rate: 55, hours: 3, headcount: 1, source: 'Venue terms, Draft 22 — $55/hr × 3h' },
          { role: 'Other FOH Staff', rate: 50, hours: 2, headcount: 1, source: 'Venue terms, Draft 22 — $50/hr × 2h' },
          { role: 'Cleaning (flat)', rate: 200, hours: 1, headcount: 1, source: 'Venue terms, Draft 22 — flat fee' },
          { role: 'Mandatory Marketing Levy (flat)', rate: 300, hours: 1, headcount: 1, source: 'Venue terms, Draft 22 — flat fee (mandatory for all external hirers)' },
          { role: 'Basic Tech Package (flat)', rate: 150, hours: 1, headcount: 1, source: 'Venue terms, Draft 22 — flat fee' },
          { role: 'Big Band Tech Package — per Michael Richardson', rate: 250, hours: 1, headcount: 1, source: 'Michael Richardson, Jul 2026 — additional package required for QF production requirements' },
        ],
      },
    ],
  },
  R11: {
    flights: { value: 2000, state: 'estimated', source: 'MEL↔CBR bracket ~$2,000 return. ⚠ Early Fri flight required (3h drive Canberra→Bega for 1pm crew call). May need Thu fly-in — flag with Gareth.' },
    accommodation: { value: 2800, state: 'estimated', source: '$1,400/night × 2 (Fri Bega + Sat Canberra). 7 rooms. ⚠ Wrest Point separately offers on-site rooms at $185–$300/room — cheaper if booked direct.' },
    accommodationNights: 2,
    groundTransport: { value: 2069, state: 'estimated', source: 'Van hire (Sydney/Central NSW rate as proxy — no ACT rate) $1,250 + van fuel (MEL→CBR→BEG→CBR→MEL ~1,560km) $326 + Kia Carnival 2 × $200 $400 + local car fuel (CBR area ~490km) $93.' },
    groundTransportItems: [
      { description: 'Van hire — Sydney/Central NSW rate (ACT proxy)', notes: 'No ACT-specific rate; Gareth to get actual quote', amount: 1250 },
      { description: 'Van fuel', notes: '~1,560 km MEL↔CBR↔BEG↔CBR↔MEL loop', amount: 326 },
      { description: 'Kia Carnival hire', notes: '2 gigs × $200', amount: 400 },
      { description: 'Local car fuel', notes: 'Canberra Airport↔Bega↔Canberra area ~490km', amount: 93 },
    ],
    bradDriverFee: { value: 400, state: 'estimated', source: 'Brad Hodgkinson — $400/weekday (Thu departure assumed). ASSUMPTION — confirm actual driving day.' },
    crewTravelDay: null,
    perDiems: { value: 240, state: 'known', source: '$40/day × 2 people (Darryn + Danny) × 3 days (Thu travel + Fri Bega + Sat Canberra).' },
    perDiemDays: 3,
    fbAds: { value: 8500, state: 'estimated', source: '$2,500 Bega Valley (300–600 cap bracket) + $6,000 Canberra Theatre cap 1,239 (1,001–1,500 bracket — ⚠ inconsistent with R10 Newcastle $5,000 at same bracket; flag with Gareth). Payee: Meta/Facebook.' },
    fbAdsItems: [
      { venueCity: 'Bega', amount: 2500, notes: 'Cap 450 → $2,500 bracket (300–600)' },
      { venueCity: 'Canberra', amount: 6000, notes: 'Cap 1,239 → $6,000 bracket (1,001–1,500) — ⚠ flag inconsistency vs R10 Newcastle $5,000 same bracket' },
    ],
    shows: [
      {
        showOrder: 1, venueName: 'Bega Valley Civic Centre', venueCity: 'Bega', state: 'NSW', showDate: '2027-05-07',
        capacity: 450, ticketPrice: 75,
        venueHire: { value: 1100, state: 'estimated', source: '$1,100 flat. Source: R11 Gig Costings tab. ⚠ No Harbour quote confirmed — treat as planning estimate until deal terms received.' },
        venueStaff: { value: 2371, state: 'estimated', source: 'R11 Gig Costings tab — hours/headcounts not stated by venue, estimated for 450-cap show. ⚠ Harbour quote + Michael confirmation needed before locking. Followspot (4h × $83/hr placeholder) is mandatory per Michael Richardson (Jul 2026) — venue has no stated followspot rate.' },
        venueStaffItems: [
          { role: 'Venue Personnel', rate: 70, hours: 8, headcount: 1, source: 'R11 Gig Costings — $70/hr × 8h, headcount not stated (estimated 1 for 450-cap)' },
          { role: 'Security (x2, combined)', rate: 185, hours: 4, headcount: 1, source: 'R11 Gig Costings — combined $185/hr for pair × 4h min call. Confirm with venue.' },
          { role: 'AV Technician', rate: 83, hours: 8, headcount: 1, source: 'R11 Gig Costings — $83/hr × 8h, headcount not stated (estimated 1)' },
          { role: 'Followspot Op (mandatory, placeholder rate)', rate: 83, hours: 4, headcount: 1, source: 'Michael Richardson, Jul 2026 — followspot is mandatory for every QF show. Venue has no stated followspot rate; using AV Tech rate $83/hr as placeholder. Confirm with venue.' },
          { role: 'Additional Cleaning (flat)', rate: 75, hours: 1, headcount: 1, source: 'R11 Gig Costings — flat fee' },
        ],
      },
      {
        showOrder: 2, venueName: 'Canberra Theatre', venueCity: 'Canberra', state: 'ACT', showDate: '2027-05-08',
        capacity: 1239, ticketPrice: 97.45,
        venueHire: { value: 6699, state: 'estimated', source: '$6,699. Source: Real 2026 historical remittance (confirmed, not a deposit line). ⚠ SCHEDULE status is EOI — Harbour has not yet approached venue. All figures provisional until at least HELD.' },
        venueStaff: { value: 14559, state: 'estimated', source: '🔴 Real 2026 historical remittance (includes venue\'s own technical/FOH staff — QF crew costs are separate and always additional). Canberra Theatre has flagged high on-costs historically. ⚠ 2026 show sell-through unknown — treat as a real anchor but not a firm 2027 quote.' },
        venueStaffItems: [
          { role: 'Theatre Technical Staff', rate: 4864.75, hours: 1, headcount: 1, source: 'Historical 2026 remittance — lump sum' },
          { role: 'FOH Wage (all FOH staff)', rate: 3074.50, hours: 1, headcount: 1, source: 'Historical 2026 remittance — lump sum' },
          { role: 'Audio Tech', rate: 1551, hours: 1, headcount: 1, source: 'Historical 2026 remittance — lump sum' },
          { role: 'Box Office + Misc Staffing', rate: 999, hours: 1, headcount: 1, source: 'Historical 2026 remittance — residual staffing charges not itemised in raw remittance; derived from spreadsheet total vs known line items' },
          { role: 'Security Services', rate: 356.40, hours: 1, headcount: 1, source: 'Historical 2026 remittance — lump sum' },
          { role: 'Hazer Fee', rate: 132, hours: 1, headcount: 1, source: 'Historical 2026 remittance — lump sum' },
          { role: 'Package C (AV production)', rate: 1247.40, hours: 1, headcount: 1, source: 'Historical 2026 remittance — lump sum' },
          { role: 'Projector & Screen', rate: 1250, hours: 1, headcount: 1, source: 'Historical 2026 remittance — lump sum' },
          { role: 'Smoke Isolation', rate: 572, hours: 1, headcount: 1, source: 'Historical 2026 remittance — lump sum' },
          { role: 'Industrial / Parking Fees', rate: 245, hours: 1, headcount: 1, source: 'Historical 2026 remittance — lump sum' },
          { role: 'Catering / Beverages', rate: 266.94, hours: 1, headcount: 1, source: 'Historical 2026 remittance — lump sum' },
        ],
      },
    ],
  },

  R12: {
    flights: { value: 2000, state: 'estimated', source: 'Sydney/Central NSW bracket ~$2,000 return (MEL↔SYD). Gareth to book.' },
    accommodation: { value: 2800, state: 'estimated', source: '$1,400/night × 2 (Fri Goulburn + Sat Chatswood). ⚠ Chatswood is ~20min from Sydney Airport — flying home Sat night post-show may be realistic and saves 1 night.' },
    accommodationNights: 2,
    groundTransport: { value: 2095, state: 'estimated', source: 'Van hire $1,250 + van fuel (MEL→Goulburn→Chatswood→MEL ~1,740km) $364 + Kia Carnival 2 × $200 $400 + local car fuel (SYD Airport↔Goulburn↔Chatswood loop ~425km) $81.' },
    groundTransportItems: [
      { description: 'Van hire — Sydney/Central NSW rate', notes: '~$1,250/weekend', amount: 1250 },
      { description: 'Van fuel', notes: '~1,740km MEL→Goulburn (direct Hume Hwy)→Chatswood→MEL', amount: 364 },
      { description: 'Kia Carnival hire', notes: '2 gigs × $200', amount: 400 },
      { description: 'Local car fuel', notes: 'SYD Airport↔Goulburn↔Chatswood↔SYD Airport ~425km', amount: 81 },
    ],
    bradDriverFee: { value: 400, state: 'estimated', source: 'Brad Hodgkinson — $400/weekday (Thu departure assumed). ASSUMPTION — confirm driving days.' },
    crewTravelDay: null,
    perDiems: { value: 240, state: 'known', source: '$40/day × 2 people (Darryn + Danny) × 3 days (Thu travel + Fri Goulburn + Sat Chatswood).' },
    perDiemDays: 3,
    fbAds: { value: 6000, state: 'estimated', source: '$2,500 Goulburn (300–600 bracket) + $3,500 Chatswood cap 1,000 (601–1,000 bracket). Payee: Meta/Facebook.' },
    fbAdsItems: [
      { venueCity: 'Goulburn', amount: 2500, notes: 'Cap 403 → $2,500 bracket (300–600)' },
      { venueCity: 'Chatswood', amount: 3500, notes: 'Cap 1,000 → $3,500 bracket (601–1,000)' },
    ],
    shows: [
      {
        showOrder: 1, venueName: 'Goulburn Performing Arts Centre', venueCity: 'Goulburn', state: 'NSW', showDate: '2027-05-14',
        capacity: 403, ticketPrice: 75,
        venueHire: { value: 1650, state: 'estimated', source: '$1,650 flat. Source: R12 Gig Costings tab. ⚠ HELD — not yet locked with a deposit.' },
        venueStaff: { value: 6410, state: 'estimated', source: 'Itemised per Michael Richardson guidance (28 Jul 2026) — headcounts estimated by Michael, hours not stated by venue (estimated). FOH ushers 4-person headcount is Michael\'s own estimate ("3–4 at a guess"). All figures are pre-confirmation estimates — Michael and Harbour to verify.' },
        venueStaffItems: [
          { role: 'Duty Manager', rate: 68, hours: 8, headcount: 1, source: 'Michael Richardson guidance, Jul 2026 — $68/hr, 8h assumed' },
          { role: 'Duty Technician', rate: 68, hours: 12, headcount: 1, source: 'Michael Richardson guidance — extended to 12h (was 8h) for QF bump-in requirements' },
          { role: 'Technician — LX', rate: 63, hours: 12, headcount: 1, source: 'Michael Richardson guidance — $63/hr, 12h for LX bump-in through bump-out' },
          { role: 'Technician — Audio', rate: 63, hours: 8, headcount: 1, source: 'Michael Richardson guidance — $63/hr, 8h (new role added per Michael, Jul 2026)' },
          { role: 'FOH Staff / Ushers', rate: 57, hours: 8, headcount: 4, source: 'Michael Richardson guidance — $57/hr × 8h; headcount "3–4 at a guess" per Michael, using 4 (top of range). Confirm with venue.' },
          { role: 'Additional BOH Staff', rate: 57, hours: 4, headcount: 1, source: 'R12 Gig Costings — $57/hr × 4h' },
          { role: 'Radio (Wireless) Mics × 2 (flat)', rate: 88, hours: 1, headcount: 1, source: 'R12 Gig Costings — $44 each × 2 = $88 flat' },
          { role: 'Basic Tech Hire (flat)', rate: 220, hours: 1, headcount: 1, source: 'R12 Gig Costings — mandatory flat fee' },
          { role: 'Small Band Tech Package (flat)', rate: 165, hours: 1, headcount: 1, source: 'R12 Gig Costings — flat fee' },
          { role: 'Cleaning Fee (flat)', rate: 550, hours: 1, headcount: 1, source: 'R12 Gig Costings — full venue cleaning, flat fee' },
          { role: 'Marketing Levy (flat)', rate: 440, hours: 1, headcount: 1, source: 'R12 Gig Costings — mandatory marketing levy, flat fee' },
          { role: 'Dedicated EDM (flat)', rate: 275, hours: 1, headcount: 1, source: 'R12 Gig Costings — dedicated email campaign, flat fee' },
        ],
      },
      {
        showOrder: 2, venueName: 'The Concourse — Concert Hall', venueCity: 'Chatswood', state: 'NSW', showDate: '2027-05-15',
        capacity: 1000, ticketPrice: 75,
        venueHire: { value: 6600, state: 'estimated', source: '$6,600. Source: Real 2024 historical remittance figure. ⚠ SCHEDULE status 2P — second behind HELD + 1st-pencil act. Both must fall through before show is ours. ⚠ 2027 rate not yet confirmed with Harbour.' },
        venueStaff: { value: 4534, state: 'estimated', source: '⚠ Real 2024 historical remittance (turnkey description was wrong — substantial on-costs existed in 2024). Production Package + venue-supplied Audio & Lighting Techs, Fire Warden, EDM, Rider, Equipment. ⚠ Venue\'s own techs do NOT replace QF Sound/Lighting crew — both costs apply. 2027 rate unconfirmed.' },
        venueStaffItems: [
          { role: 'Production Package (flat)', rate: 715, hours: 1, headcount: 1, source: 'Historical 2024 remittance — flat fee' },
          { role: 'Audio Technicians × 2', rate: 253, hours: 1, headcount: 2, source: 'Historical 2024 remittance — $253 each × 2' },
          { role: 'Lighting Technicians × 2', rate: 1075.25, hours: 1, headcount: 1, source: 'Historical 2024 remittance — $822.25 + $253 (two different rates; kept as lump)' },
          { role: 'Fire Warden (flat)', rate: 374, hours: 1, headcount: 1, source: 'Historical 2024 remittance — flat fee' },
          { role: 'EDM / Marketing (flat)', rate: 400, hours: 1, headcount: 1, source: 'Historical 2024 remittance — flat fee' },
          { role: 'Backstage Rider (flat)', rate: 496, hours: 1, headcount: 1, source: 'Historical 2024 remittance — flat fee' },
          { role: 'Marketing / Signage (flat)', rate: 401.50, hours: 1, headcount: 1, source: 'Historical 2024 remittance — lightbox + outdoor + custom posters, flat' },
          { role: 'Small Equipment (mics, smoke, projector, flat)', rate: 566.50, hours: 1, headcount: 1, source: 'Historical 2024 remittance — flat fee' },
        ],
      },
    ],
  },

  R13: {
    flights: { value: 2000, state: 'estimated', source: 'TAS bracket ~$2,000 open-jaw (MEL→Hobart / Launceston→MEL). Gareth to book. Recommended open-jaw to avoid backtracking band to Hobart after Launceston show.' },
    accommodation: { value: 3100, state: 'estimated', source: 'Band: $1,400/night × 2 (Fri Hobart + Sat Launceston) = $2,800. Plus Brad\'s 2 pre-show solo nights (~$150/night) = $300. ⚠ Wrest Point has on-site rooms at $185–$300/room — cheaper than standard $1,400/room if booked direct; not assumed here.' },
    accommodationNights: 2,
    groundTransport: { value: 2900, state: 'estimated', source: 'Van hire (TAS rate ~$800/weekend) + Spirit of Tasmania ferry (return crossing for van ~$1,500) + van fuel (DEV→HBA→LSN→DEV ~580km + Geelong terminal legs ~150km) $153 + Kia Carnival 2 × $200 $400 + local car fuel (HBA Airport↔Wrest Point↔LSN↔LSN Airport ~255km) $48.' },
    groundTransportItems: [
      { description: 'Van hire — Tasmania rate', notes: '~$800/weekend; Gareth to confirm current rate', amount: 800 },
      { description: 'Spirit of Tasmania ferry — van (return)', notes: '~$1,500/run; Gareth to confirm current rate', amount: 1500 },
      { description: 'Van fuel (Tasmania driving + Geelong terminal legs)', notes: 'DEV→HBA→LSN→DEV ~580km + terminal legs ~150km', amount: 153 },
      { description: 'Kia Carnival hire (locally in Tasmania)', notes: '2 gigs × $200', amount: 400 },
      { description: 'Local car fuel', notes: 'HBA Airport↔Wrest Point↔LSN↔airport ~255km', amount: 48 },
    ],
    bradDriverFee: { value: 800, state: 'estimated', source: 'Brad Hodgkinson — 2 weekdays × $400 (Wed departure via ferry + Mon return). Longer lead-time than mainland runs. Brad drives van solo on ferry; band flies Fri.' },
    crewTravelDay: null,
    perDiems: { value: 160, state: 'known', source: '$40/day × 2 people (Darryn + Danny) × 2 days (Fri Hobart + Sat Launceston). Band flies in Fri morning — Hobart Airport to Wrest Point ~20min, no pre-show travel day.' },
    perDiemDays: 2,
    fbAds: { value: 6000, state: 'estimated', source: '$2,500 Hobart Wrest Point (300–600 bracket) + $3,500 Launceston Albert Hall cap 950 (601–1,000 bracket). Payee: Meta/Facebook.' },
    fbAdsItems: [
      { venueCity: 'Hobart', amount: 2500, notes: 'Cap 348 → $2,500 bracket (300–600)' },
      { venueCity: 'Launceston', amount: 3500, notes: 'Cap 950 → $3,500 bracket (601–1,000)' },
    ],
    shows: [
      {
        showOrder: 1, venueName: 'Wrest Point Showroom', venueCity: 'Hobart', state: 'TAS', showDate: '2027-06-04',
        capacity: 348, ticketPrice: 75,
        venueHire: { value: 2200, state: 'estimated', source: '$2,200 flat. Source: R13 Gig Costings tab. ⚠ HELD — not yet locked with deposit.' },
        venueStaff: { value: 6944, state: 'estimated', source: 'Mixed source: security/ushers/event manager estimated for 348-cap (rates from venue, headcounts assumed); House PA removal $800 flat (QF brings own PA); Urban Music sub-hire quote from Michael Richardson (Jul 2026) for tech labour $1,188 + gear package $3,421. Urban Music quote is real but not a confirmed 2027 price — get fresh quote closer to tour.' },
        venueStaffItems: [
          { role: 'Security', rate: 70, hours: 4, headcount: 2, source: 'Venue rate $70/hr × 4h min call; headcount estimated at 2 for 348-cap show. Confirm with venue.' },
          { role: 'Ushers', rate: 55, hours: 3, headcount: 3, source: 'Venue rate $55/hr × 3h min call; headcount estimated at 3 for 348-cap show. Confirm with venue.' },
          { role: 'Event Manager', rate: 60, hours: 8, headcount: 1, source: 'Venue rate $60/hr; hours not stated — assumed 8h. Confirm actual call hours with venue.' },
          { role: 'House PA Removal / Storage / Reinstatement (flat)', rate: 800, hours: 1, headcount: 1, source: 'Wrest Point charges to remove and reinstate their in-house PA since QF brings its own. Flat fee.' },
          { role: 'Sub-hired AX & LX Tech Labour (Urban Music quote)', rate: 1188, hours: 1, headcount: 1, source: 'Michael Richardson, Jul 2026 — Urban Music quote: 2× load-in (4h min call each) + 2× load-out (4h min call each) + spot op (3h) = AX $528 + LX $660. Real prior quote, not confirmed 2027 price.' },
          { role: 'Full Gear Package (Urban Music quote)', rate: 3421, hours: 1, headcount: 1, source: 'Michael Richardson, Jul 2026 — Urban Music quote: hazers, mics/stands, power leads, RCF 15in floor wedges, drum sub, projector+screen, guitar riser, keys riser, followspot, transport. Real prior quote, not confirmed 2027 price — get fresh quote.' },
        ],
      },
      {
        showOrder: 2, venueName: 'Albert Hall', venueCity: 'Launceston', state: 'TAS', showDate: '2027-06-05',
        capacity: 950, ticketPrice: 75,
        venueHire: { value: 1500, state: 'estimated', source: '$1,500 flat. Source: R13 Gig Costings tab. ⚠ HELD — not yet locked with deposit.' },
        venueStaff: { value: 3677, state: 'estimated', source: 'Venue rates stated; headcounts not stated — estimated for 950-cap show. Flat fees (Marketing $275, Great Hall Setup $650, Projector $595, EDM $75) are confirmed from venue terms. Hourly roles are estimated. Projector confirmed needed per Michael Richardson (Jul 2026).' },
        venueStaffItems: [
          { role: 'Marketing Standard Services (flat)', rate: 275, hours: 1, headcount: 1, source: 'Albert Hall venue terms — flat fee' },
          { role: 'Great Hall Set Up (flat)', rate: 650, hours: 1, headcount: 1, source: 'Albert Hall venue terms — flat fee' },
          { role: 'Projector & Screen Hire (flat)', rate: 595, hours: 1, headcount: 1, source: 'Albert Hall venue terms — flat fee; confirmed required per Michael Richardson, Jul 2026' },
          { role: 'FOH / Box Office Staff', rate: 53.60, hours: 3, headcount: 6, source: 'Albert Hall venue rate $53.60/hr × 3h min call; headcount estimated at 6 for 950-cap. Confirm with venue.' },
          { role: 'FOH / Box Office Manager', rate: 59.15, hours: 3, headcount: 1, source: 'Albert Hall venue rate $59.15/hr × 3h min call' },
          { role: 'Technical Crew (bump in/out)', rate: 59.15, hours: 3, headcount: 2, source: 'Albert Hall venue rate $59.15/hr × 3h min call; headcount estimated at 2. Confirm with venue.' },
          { role: 'Technical Staff (during show)', rate: 62.60, hours: 3, headcount: 2, source: 'Albert Hall venue rate $62.60/hr × 3h min call; headcount estimated at 2. Confirm with venue.' },
          { role: 'Technical Manager', rate: 69.85, hours: 3, headcount: 1, source: 'Albert Hall venue rate $69.85/hr × 3h min call' },
          { role: 'Dedicated EDM (flat)', rate: 75, hours: 1, headcount: 1, source: 'Albert Hall venue terms — flat fee' },
        ],
      },
    ],
  },

  R14: {
    flights: null,
    accommodation: { value: 2800, state: 'estimated', source: '$1,400/night × 2 (Fri Hamilton + Sat Geelong). Group 1 self-drive — no flights needed.' },
    accommodationNights: 2,
    groundTransport: { value: 385, state: 'estimated', source: "Brad's 4WD+trailer (15L/100km × ~580km × $1.90/L) $165 + 2 band cars (10L/100km × ~580km × $1.90/L × 2) $220. No van hire — Group 1 self-drive. Route: MEL→Hamilton→Geelong→MEL ~580km." },
    groundTransportItems: [
      { description: "Brad's 4WD + trailer fuel", notes: '15L/100km × ~580km @ $1.90/L loop MEL→Hamilton→Geelong→MEL', amount: 165 },
      { description: 'Band cars fuel (× 2)', notes: '10L/100km × ~580km @ $1.90/L × 2 cars', amount: 220 },
    ],
    bradDriverFee: null,
    crewTravelDay: null,
    perDiems: { value: 160, state: 'known', source: '$40/day × 2 people (Darryn + Danny) × 2 days (Fri Hamilton + Sat Geelong).' },
    perDiemDays: 2,
    fbAds: { value: 6000, state: 'estimated', source: '$2,500 Hamilton PAC (300–600 bracket) + $3,500 Geelong Arts Centre Playhouse cap 764 (601–1,000 bracket). Payee: Meta/Facebook.' },
    fbAdsItems: [
      { venueCity: 'Hamilton', amount: 2500, notes: 'Cap 452 → $2,500 bracket (300–600)' },
      { venueCity: 'Geelong', amount: 3500, notes: 'Cap 764 → $3,500 bracket (601–1,000)' },
    ],
    shows: [
      {
        showOrder: 1, venueName: 'Hamilton Performing Arts Centre', venueCity: 'Hamilton', state: 'VIC', showDate: '2027-09-10',
        capacity: 452, ticketPrice: 75,
        venueHire: { value: 1400, state: 'estimated', source: 'MAX($1,400 flat, 15% NBO). At 75% ST (339 tix): 15% × $75 × 339 = $3,814 — NBO wins at any meaningful sell-through. ⚠ Very high % structure — flag with Harbour. HELD — not yet locked.' },
        venueStaff: { value: 1718, state: 'estimated', source: 'R14 Gig Costings — rates stated, headcount not; assumed 1 Operating Tech + 1 Technician (8h each). No historical anchor for Hamilton PAC. Michael to sanity-check.' },
        venueStaffItems: [
          { role: 'Equipment Hire — Projector, Moving Lights × 4, Haze, Wireless Mics × 4 (flat)', rate: 550, hours: 1, headcount: 1, source: 'R14 Gig Costings — flat fee ($100 + $200 + $50 + $200)' },
          { role: 'Operating Tech', rate: 78, hours: 8, headcount: 1, source: 'R14 Gig Costings rate $78/hr; hours assumed 8h. Headcount assumed 1. Michael to confirm.' },
          { role: 'Technician', rate: 68, hours: 8, headcount: 1, source: 'R14 Gig Costings rate $68/hr; hours assumed 8h. Headcount assumed 1. Michael to confirm.' },
        ],
      },
      {
        showOrder: 2, venueName: 'Geelong Arts Centre — Playhouse', venueCity: 'Geelong', state: 'VIC', showDate: '2027-09-11',
        capacity: 764, ticketPrice: 75,
        venueHire: { value: 4685, state: 'estimated', source: '$4,685 flat (Playhouse room confirmed by Gareth). Source: R14 Gig Costings tab. ⚠ SCHEDULE status 2P — second behind HELD + 1st-pencil act. 2025 historical was $3,965 for a different show type — 2027 flat rate quote used.' },
        venueStaff: { value: 2899, state: 'estimated', source: '🔴 Rate-card estimate is likely an underestimate. 2025 historical for Geelong Arts Centre: $4,714 (technicians $2,346, FOH $1,150, stage door $329, equipment $760, LPA $129) — significantly higher than rate-card at 8h/1 head. May reflect longer hours or additional crew at that show. R14 Gig Costings rates stated, hours assumed 8h, headcount assumed per room size. Michael to review — use 2025 historical as a high anchor.' },
        venueStaffItems: [
          { role: 'Technician', rate: 66.66, hours: 8, headcount: 1, source: 'R14 Gig Costings rate $66.66/hr; 8h assumed. ⚠ 2025 historical shows technicians $2,346 total — likely more headcount or longer hours. Confirm with Michael.' },
          { role: 'FOH Supervisor', rate: 66.29, hours: 8, headcount: 1, source: 'R14 Gig Costings rate $66.29/hr; 8h assumed' },
          { role: 'Ushers / Merch × 2', rate: 56.40, hours: 8, headcount: 2, source: 'R14 Gig Costings rate $56.40/hr; 8h assumed × 2 (matched prior Storyhouse treatment). Confirm headcount for larger Playhouse room.' },
          { role: 'Stage Door Attendant', rate: 56.40, hours: 8, headcount: 1, source: 'R14 Gig Costings rate $56.40/hr; 8h assumed' },
          { role: 'Cleaner', rate: 60.20, hours: 8, headcount: 1, source: 'R14 Gig Costings rate $60.20/hr; 8h assumed' },
        ],
      },
    ],
  },
}

// Fixed costs that apply to every run (same regardless of venue)
export const LIGHTING_HIRE_PER_RUN = 330  // $ — fixed per weekend run
export const FOOD_PER_SHOW = 225           // $ — fixed per show
export const CREW_FEE_PER_SHOW = 2650     // $ — Adam $600 + Michael lighting $600 + Michael PM $250 + Darryn $600 + Danny $600

/**
 * Settlements 3-column Expected vs Actual sheet — the Settlements front door.
 *
 * REPLACE (not additive): `/settlements/{run}` and show-scoped
 * `/settlements/{run}/{show}` are this sheet. Wave-1 Agent Settlement lives
 * at `/agent`. Legacy `/sheet` redirects here.
 *
 * Col1 labels · Col2 live Advancing expected · Col3 actuals.
 * Col2 binds to advancing_cost_fields + Advancing shows chrome when an
 * active Run Advancing workspace exists. Frozen cost_fields is fallback
 * only when that workspace is missing (BOOKED-but-copy-failed). Never invent.
 * Pre-show is a hard block. No revenue sliders.
 * Col2 tickets sold = actual count (entered or known), then the same
 * P&L formulas as Run Costing (inside / Harbour 10% / auto-calcs) on
 * Advancing live costs — not sell-through on frozen Costing.
 */

import { todayAU } from './dates.ts'
import {
  normalizeCapacityBands,
  modelledVenueStaffForTickets,
} from './capacity-bands.ts'
import {
  DEFINED_RUN_COST_FIELDS,
  DEFINED_SHOW_COST_FIELDS,
  allEntriesPaid,
  entriesSum,
  lineItemsSum,
  sectionPayableLines,
} from './cost-fields.ts'
import {
  HARBOUR_COMMISSION_RATE,
  GST_QUARANTINE_KEY,
  RESERVE_EX_GST_LABEL,
  computePnlSummary,
  computeVenueWaterfall,
  gstQuarantineLineLabel,
  knownInsideForShow,
  remittanceHasCcSplit,
  resolveInsideCosts,
  roundMoney,
  type InsideFactorValues,
  type KnownInsideLine,
  type PnlSummary,
  type PnlVenueWaterfall,
} from './pnl-run-costing.ts'
import { snapshotFieldTotal, type CostingSnapshotField } from './settlements.ts'

export const SHEET_TAB_LABEL = 'Sheet'
export const SHEET_HEADING = 'Settlements'
export const AGENT_SETTLEMENT_NAV_LABEL = 'Agent settlement'
export const WAVE1_AGENT_SEGMENT = 'agent'
export const SETTLEMENTS_DEMO_BADGE = 'DEMO'
export const SETTLEMENTS_DEMO_GLANCE_LABEL = 'Sample completed show'
export const SETTLEMENTS_DEMO_BANNER =
  'DEMO sample completed show — glance Settlements v3 here. Figures come from Advancing and settlement / remittance email attachments; nothing is invented on this page.'
export const ADVANCING_COSTS_LABEL = 'Advancing Costs'
export const COL1_HEADER = 'Line'
export const COL2_HEADER = 'Expected (Advancing)'
export const COL2_LIVE_ADVANCING_NOTE =
  'Col2 is a live read of Run Advancing. Tickets sold is the actual count — not a sell-through slider.'
export const COL2_COSTING_FALLBACK_NOTE =
  'No active Run Advancing workspace — Col2 is falling back to locked Run Costing (BOOKED copy may have failed). Figures are not invented.'
export const COL3_HEADER = 'Actuals'
export const COL3_PLACEHOLDER_NOTE =
  'Venue settlement figures enter as confirmed. Challenge drafts a Harbour email (never auto-sent). Band costs copy from Advancing and stay editable until PAID. One Expected bucket can roll up many Actuals.'
export const COL3_CELL = '—'

export const PRE_SHOW_BLOCK_COPY =
  'Data not yet available — check back when the show has occurred.'
export const PRE_SHOW_STAKEHOLDER_NOTE =
  'Stakeholders use Advancing, not Settlements.'

export const TICKETS_SOLD_LABEL = 'Tickets sold (actual count)'
export const TICKETS_SOLD_HELP =
  'Entered or known actuals only. Settlements does not use sell-through sliders.'

/** Match Run Costing live social-ads auto-calc (tickets × $1.10). */
export const SOCIAL_ADS_PER_TICKET = 1.10

export const SHEET_FORBIDS_REVENUE_SLIDERS = true

/** Where Col2 Expected amounts were loaded from. */
export type SettlementExpectedSource = 'advancing' | 'costing_fallback'

export function col2SourceNote(source: SettlementExpectedSource): string {
  return source === 'advancing' ? COL2_LIVE_ADVANCING_NOTE : COL2_COSTING_FALLBACK_NOTE
}

export type SheetLineGroup = 'tickets' | 'revenue' | 'venue_costs' | 'run_costs' | 'pnl'

export type SheetLine = {
  key: string
  label: string
  group: SheetLineGroup
  expected: number | null
  note?: string
  kind: 'count' | 'money'
  /** Live Advancing PAID roll-up. Settlements must show this as locked PAID. */
  expectedPaid?: boolean
}

export type SheetShowInput = {
  id: string
  venue_name: string
  venue_city: string
  show_date: string | null
  show_order: number
  capacity: number | null
  capacity_bands?: unknown | null
  ticket_price: number | null
  tickets_sold: number | null
  booking_fee_per_payer?: number | null
  cc_fee_pct?: number | null
}

export type TicketsSoldSource = 'entered' | 'known' | 'missing'

/**
 * Canonical Settlements front door — always one settlement per **run**.
 * `showId` is a bookmark alias only; the page still renders run grain.
 */
export function settlementSheetHref(runCode: string, showId?: string | null): string {
  const base = `/settlements/${runCode.toLowerCase()}`
  return showId ? `${base}/${showId}` : base
}

/** Wave-1 Agent Settlement workspace — secondary route, not the front door. */
export function wave1SettlementHref(runCode: string, showId?: string | null): string {
  const base = `/settlements/${runCode.toLowerCase()}/${WAVE1_AGENT_SEGMENT}`
  return showId ? `/settlements/${runCode.toLowerCase()}/${showId}/${WAVE1_AGENT_SEGMENT}` : base
}

/** Remittance workspace — secondary route, linked from the sheet. */
export function remittanceHref(runCode: string, showId?: string | null): string {
  const base = `/settlements/${runCode.toLowerCase()}/remittance`
  return showId ? `/settlements/${runCode.toLowerCase()}/${showId}/remittance` : base
}

/** Staging glance: TCOMP1, SAMP##, or name/notes that say DEMO / SAMPLE. Never invents figures. */
export function isSettlementsDemoRun(run: {
  code?: string | null
  name?: string | null
  notes?: string | null
}): boolean {
  const code = String(run.code ?? '').toUpperCase()
  if (code === 'TCOMP1') return true
  if (/^SAMP\d+$/.test(code)) return true
  return /\b(demo|sample)\b/i.test(`${run.name ?? ''} ${run.notes ?? ''}`)
}

/**
 * A show has occurred only after its Sydney calendar date.
 * Same-day and undated shows stay blocked — stakeholders stay on Advancing.
 */
export function showHasOccurred(
  showDate: string | null | undefined,
  today: string = todayAU(),
): boolean {
  const day = calendarDay(showDate)
  if (!day) return false
  return day < today
}

export function calendarDay(date: string | null | undefined): string | null {
  if (!date) return null
  const m = String(date).match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}

export function resolveTicketsSold(opts: {
  entered?: number | null
  known?: number | null
}): { tickets: number | null; source: TicketsSoldSource } {
  const entered = asCount(opts.entered)
  if (entered != null) return { tickets: entered, source: 'entered' }
  const known = asCount(opts.known)
  if (known != null) return { tickets: known, source: 'known' }
  return { tickets: null, source: 'missing' }
}

function asCount(value: number | null | undefined): number | null {
  if (value == null || value === ('' as unknown)) return null
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round(n)
}

export function socialAdsForTickets(tickets: number | null | undefined): number {
  if (tickets == null) return 0
  return roundMoney(Math.max(0, Number(tickets) || 0) * SOCIAL_ADS_PER_TICKET)
}

export function liveCostAmount(field: CostingSnapshotField): number {
  if (field.field_key === 'venue_staff' && field.line_items.length > 0) {
    return lineItemsSum(field.line_items)
  }
  if (field.entries.length > 0) return entriesSum(field.entries)
  return snapshotFieldTotal(field)
}

/** True when every Advancing payable on the field is PAID (same roll-up as Run Advancing). */
export function fieldIsPaidOnAdvancing(field: CostingSnapshotField | undefined): boolean {
  if (!field) return false
  return allEntriesPaid(sectionPayableLines(field.field_key, field.entries, field.line_items))
}

export function venueStaffExpected(opts: {
  field: CostingSnapshotField | undefined
  show: Pick<SheetShowInput, 'capacity' | 'capacity_bands'>
  tickets: number | null
}): number {
  const base = opts.field ? liveCostAmount(opts.field) : 0
  const bands = normalizeCapacityBands(opts.show.capacity_bands)
  if (!bands.length || opts.tickets == null) return roundMoney(base)
  return modelledVenueStaffForTickets({
    bands,
    tickets: opts.tickets,
    baseTotal: base,
    lineItems: opts.field?.line_items ?? null,
  })
}

export function expectedVenueWaterfall(opts: {
  show: SheetShowInput
  tickets: number
  factors?: InsideFactorValues | null
  remittanceLines?: KnownInsideLine[] | null
}): PnlVenueWaterfall {
  const price = Number(opts.show.ticket_price) || 0
  const gross = roundMoney(opts.tickets * price)
  const known = knownInsideForShow(opts.remittanceLines ?? [], opts.show.id)
  const inside = resolveInsideCosts({
    grossTicketSales: gross,
    payerCount: opts.tickets,
    factors: opts.factors,
    venueOverride: {
      bookingFeePerPayer: opts.show.booking_fee_per_payer,
      ccFeePct: opts.show.cc_fee_pct,
    },
    remittanceKnownTotal: known,
    hasCcSplitHistory: remittanceHasCcSplit(opts.remittanceLines ?? [], opts.show.id),
  })
  const waterfall = computeVenueWaterfall({ grossTicketSales: gross, insideTotal: inside.total })
  waterfall.inside = inside
  return waterfall
}

function fieldFor(
  fields: CostingSnapshotField[],
  fieldKey: string,
  showId: string | null,
): CostingSnapshotField | undefined {
  return fields.find(f => f.field_key === fieldKey && (f.show_id ?? null) === showId)
}

export function buildShowSheetLines(opts: {
  show: SheetShowInput
  fields: CostingSnapshotField[]
  tickets: number | null
  ticketsSource: TicketsSoldSource
  factors?: InsideFactorValues | null
  remittanceLines?: KnownInsideLine[] | null
  gstLines?: KnownInsideLine[] | null
  includeRunCosts?: boolean
}): { lines: SheetLine[]; summary: PnlSummary | null; waterfall: PnlVenueWaterfall | null } {
  const lines: SheetLine[] = []
  const ticketsNote =
    opts.ticketsSource === 'entered' ? 'entered actual'
      : opts.ticketsSource === 'known' ? 'known actual'
        : 'enter actual count'

  lines.push({
    key: 'tickets_sold',
    label: TICKETS_SOLD_LABEL,
    group: 'tickets',
    expected: opts.tickets,
    note: ticketsNote,
    kind: 'count',
  })

  const waterfall = opts.tickets != null
    ? expectedVenueWaterfall({
        show: opts.show,
        tickets: opts.tickets,
        factors: opts.factors,
        remittanceLines: opts.remittanceLines,
      })
    : null

  lines.push({
    key: 'gross_ticket_sales',
    label: 'Gross ticket sales',
    group: 'revenue',
    expected: waterfall?.grossTicketSales ?? null,
    kind: 'money',
  })
  lines.push({
    key: 'inside_pre_commission',
    label: '− Inside (pre-commission)',
    group: 'revenue',
    expected: waterfall?.inside.total ?? null,
    note: waterfall?.inside.sourceLabel,
    kind: 'money',
  })
  lines.push({
    key: 'commissionable',
    label: 'Commissionable',
    group: 'revenue',
    expected: waterfall?.commissionable ?? null,
    kind: 'money',
  })
  lines.push({
    key: 'harbour_commission',
    label: `− Harbour Agency (${Math.round(HARBOUR_COMMISSION_RATE * 100)}% locked)`,
    group: 'revenue',
    expected: waterfall?.harbourCommission ?? null,
    kind: 'money',
  })
  lines.push({
    key: 'net_revenue',
    label: 'Net revenue',
    group: 'revenue',
    expected: waterfall?.netRevenue ?? null,
    kind: 'money',
  })

  let showCosts = 0
  for (const def of DEFINED_SHOW_COST_FIELDS) {
    if (def.key === 'gross_box_office') continue
    const field = fieldFor(opts.fields, def.key, opts.show.id)
    const expected = def.key === 'venue_staff'
      ? venueStaffExpected({ field, show: opts.show, tickets: opts.tickets })
      : field ? liveCostAmount(field) : 0
    showCosts += expected
    lines.push({
      key: `show:${def.key}`,
      label: def.label,
      group: 'venue_costs',
      expected,
      note: field?.source ?? undefined,
      kind: 'money',
      expectedPaid: fieldIsPaidOnAdvancing(field),
    })
  }

  let runCosts = 0
  if (opts.includeRunCosts) {
    for (const def of DEFINED_RUN_COST_FIELDS) {
      const field = fieldFor(opts.fields, def.key, null)
      const expected = def.key === 'social_ads_var'
        ? socialAdsForTickets(opts.tickets)
        : field ? liveCostAmount(field) : 0
      runCosts += expected
      lines.push({
        key: `run:${def.key}`,
        label: def.label,
        group: 'run_costs',
        expected,
        note: def.key === 'social_ads_var' ? `AUTO CALC · $${SOCIAL_ADS_PER_TICKET.toFixed(2)}/ticket` : field?.source ?? undefined,
        kind: 'money',
        expectedPaid: fieldIsPaidOnAdvancing(field),
      })
    }
  } else {
    const social = socialAdsForTickets(opts.tickets)
    runCosts += social
    lines.push({
      key: 'run:social_ads_var',
      label: 'Social Media Marketing Co. — $1/ticket',
      group: 'run_costs',
      expected: social,
      note: `AUTO CALC · $${SOCIAL_ADS_PER_TICKET.toFixed(2)}/ticket (this show)`,
      kind: 'money',
    })
  }

  const totalCosts = roundMoney(showCosts + runCosts)
  const summary = waterfall
    ? computePnlSummary({
        netRevenue: waterfall.netRevenue,
        totalCosts,
        remittanceLines: opts.gstLines ?? opts.remittanceLines,
        showId: opts.show.id,
      })
    : null

  lines.push({
    key: 'total_costs',
    label: 'Total costs',
    group: 'pnl',
    expected: waterfall ? totalCosts : null,
    kind: 'money',
  })
  lines.push({
    key: 'net_profit',
    label: 'Net Profit / (Loss)',
    group: 'pnl',
    expected: summary?.netProfit ?? null,
    kind: 'money',
  })
  lines.push({
    key: GST_QUARANTINE_KEY,
    label: gstQuarantineLineLabel(summary?.gstKnown ?? false),
    group: 'pnl',
    expected: summary?.gstQuarantine ?? null,
    note: summary?.gstSourceLabel,
    kind: 'money',
  })
  lines.push({
    key: 'reserve',
    label: RESERVE_EX_GST_LABEL,
    group: 'pnl',
    expected: summary?.reserve ?? null,
    kind: 'money',
  })
  lines.push({
    key: 'pre_dist_margin',
    label: 'Pre-Distribution Margin',
    group: 'pnl',
    expected: summary?.preDistMargin ?? null,
    kind: 'money',
  })

  return { lines, summary, waterfall }
}

export function buildRunSheet(opts: {
  shows: SheetShowInput[]
  fields: CostingSnapshotField[]
  knownTicketsByShow?: Record<string, number | null | undefined>
  factors?: InsideFactorValues | null
  remittanceLines?: KnownInsideLine[] | null
  gstLines?: KnownInsideLine[] | null
  today?: string
}): {
  blocked: boolean
  occurred: SheetShowInput[]
  upcoming: SheetShowInput[]
  sections: Array<{
    show: SheetShowInput
    tickets: number | null
    ticketsSource: TicketsSoldSource
    lines: SheetLine[]
    summary: PnlSummary | null
  }>
  runLines: SheetLine[]
  summary: PnlSummary | null
} {
  const occurred = opts.shows.filter(s => showHasOccurred(s.show_date, opts.today))
  const upcoming = opts.shows.filter(s => !showHasOccurred(s.show_date, opts.today))
  const blocked = occurred.length === 0

  const sections = occurred.map(show => {
    const resolved = resolveTicketsSold({
      entered: show.tickets_sold,
      known: opts.knownTicketsByShow?.[show.id],
    })
    const built = buildShowSheetLines({
      show,
      fields: opts.fields,
      tickets: resolved.tickets,
      ticketsSource: resolved.source,
      factors: opts.factors,
      remittanceLines: opts.remittanceLines,
      gstLines: opts.gstLines,
      includeRunCosts: false,
    })
    return { show, tickets: resolved.tickets, ticketsSource: resolved.source, lines: built.lines, summary: built.summary }
  })

  const totalTickets = sections.reduce((s, sec) => s + (sec.tickets ?? 0), 0)
  const runLines: SheetLine[] = DEFINED_RUN_COST_FIELDS.map(def => {
    const field = fieldFor(opts.fields, def.key, null)
    const expected = def.key === 'social_ads_var'
      ? socialAdsForTickets(sections.some(sec => sec.tickets != null) ? totalTickets : null)
      : field ? liveCostAmount(field) : 0
    return {
      key: `run:${def.key}`,
      label: def.label,
      group: 'run_costs' as const,
      expected,
      note: def.key === 'social_ads_var' ? `AUTO CALC · $${SOCIAL_ADS_PER_TICKET.toFixed(2)}/ticket` : field?.source ?? undefined,
      kind: 'money' as const,
      expectedPaid: fieldIsPaidOnAdvancing(field),
    }
  })

  const netRevenue = sections.reduce((s, sec) => {
    const row = sec.lines.find(l => l.key === 'net_revenue')
    return s + (row?.expected ?? 0)
  }, 0)
  const venueCosts = sections.reduce((s, sec) => {
    return s + sec.lines.filter(l => l.group === 'venue_costs').reduce((n, l) => n + (l.expected ?? 0), 0)
  }, 0)
  const runCosts = runLines.reduce((s, l) => s + (l.expected ?? 0), 0)
  const anyTickets = sections.some(sec => sec.tickets != null)
  const summary = !blocked && anyTickets
    ? computePnlSummary({
        netRevenue,
        totalCosts: roundMoney(venueCosts + runCosts),
        remittanceLines: opts.gstLines ?? opts.remittanceLines,
      })
    : null

  return { blocked, occurred, upcoming, sections, runLines, summary }
}

export function sheetUsesRevenueSliders(): boolean {
  return !SHEET_FORBIDS_REVENUE_SLIDERS
}

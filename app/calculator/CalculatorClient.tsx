'use client'

import { formatDateShortAU } from '@/lib/dates'

import { useState, useMemo } from 'react'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { formatBookingStatus } from '@/lib/format-booking-status'
import BandedSellSlider from '@/components/BandedSellSlider'
import {
  normalizeCapacityBands,
  topBandSeats,
  modelledVenueStaffForTickets,
} from '@/lib/capacity-bands'

export type CalcShow = {
  id: string
  venue: string
  date: string
  capacity: number
  capacityBands?: unknown | null
  nettPrice: number
  venueHire: number
  /** BASE venue_staff — never overwrite from max band. */
  onCosts: number
  staffLineItems?: unknown | null
}

export type CalcRun = {
  id: string
  code: string
  name: string
  status: string
  region: string
  shows: CalcShow[]
  fixedTotal: number
  warnings: string[]
}

export type Factors = {
  harbourPct: number
  danielPerTicket: number
  apraPct: number
  ccPct: number
}

function showModelCap(show: CalcShow): number {
  const bands = normalizeCapacityBands(show.capacityBands)
  return topBandSeats(bands, show.capacity) ?? show.capacity ?? 0
}

function showModelledOnCosts(show: CalcShow, tickets: number): number {
  const bands = normalizeCapacityBands(show.capacityBands)
  if (!bands.length) return show.onCosts
  const lineItems = Array.isArray(show.staffLineItems)
    ? (show.staffLineItems as Array<{ role: string; rate: number; hours: number; headcount: number }>)
    : null
  return modelledVenueStaffForTickets({
    bands,
    tickets,
    baseTotal: show.onCosts,
    lineItems,
  })
}

function calcRun(run: CalcRun, factors: Factors, sellPcts: number[]) {
  const showResults = run.shows.map((show, i) => {
    const pct = sellPcts[i] ?? 0.65
    const cap = showModelCap(show)
    const tickets = Math.floor(cap * pct)
    const nettBO = tickets * show.nettPrice
    const onCosts = showModelledOnCosts(show, tickets)
    const showNet = nettBO
      - factors.harbourPct * nettBO
      - factors.apraPct * nettBO
      - factors.ccPct * nettBO
      - show.venueHire
      - onCosts
    return { tickets, showNet, onCosts, cap }
  })

  const totalTickets = showResults.reduce((s, r) => s + r.tickets, 0)
  const venueNet = showResults.reduce((s, r) => s + r.showNet, 0)
  const social = totalTickets * factors.danielPerTicket
  const preReserve = venueNet - run.fixedTotal - social
  const gstQuarantine = preReserve > 0 ? preReserve / 11 : 0
  const postGST = preReserve - gstQuarantine
  const ownerReserve = postGST > 0 ? postGST * 0.20 : 0
  const distributable = postGST - ownerReserve
  const gareth = distributable * 0.40

  return { totalTickets, venueNet, social, preReserve, gstQuarantine, ownerReserve, distributable, gareth }
}

function calcBreakeven(run: CalcRun, factors: Factors): number | null {
  for (let p = 1; p <= 100; p++) {
    const pct = p / 100
    const r = calcRun(run, factors, run.shows.map(() => pct))
    if (r.preReserve >= 0) return pct
  }
  return null
}

const STATUS_COLOR: Record<string, string> = {
  confirmed: '#34d399',
  proposed: '#60a5fa',
  booking: '#fbbf24',
  show_week: '#c084fc',
  post_show: '#fb923c',
  settled: '#94a3b8',
}

function statusColor(s: string) { return STATUS_COLOR[s] ?? '#60a5fa' }

function fmt(n: number) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(n)
}

function fmtDate(iso: string) {
  return formatDateShortAU(iso)
}

function Row({ label, value, negative, bold }: { label: string; value: number; negative?: boolean; bold?: boolean }) {
  return (
    <div className={`flex justify-between items-center ${bold ? 'font-semibold' : ''}`}>
      <span className="text-xs" style={{ color: 'var(--muted)' }}>{label}</span>
      <span className="text-sm" style={{ color: negative ? 'var(--red)' : value >= 0 ? 'var(--text)' : 'var(--red)' }}>
        {fmt(value)}
      </span>
    </div>
  )
}

export default function CalculatorClient({ runs, factors }: { runs: CalcRun[]; factors: Factors }) {
  const [selectedId, setSelectedId] = useState(runs[0]?.code ?? '')
  const [pcts, setPcts] = useState<number[]>((runs[0]?.shows ?? []).map(() => 0.65))

  const run = runs.find(r => r.code === selectedId) ?? runs[0]

  function selectRun(code: string) {
    const r = runs.find(r => r.code === code)!
    setSelectedId(code)
    setPcts(r.shows.map(() => 0.65))
  }

  const result = useMemo(() => calcRun(run, factors, pcts), [run, factors, pcts])
  const be = useMemo(() => calcBreakeven(run, factors), [run, factors])

  const totalTickets = pcts.reduce((s, p, i) => s + Math.floor(showModelCap(run.shows[i]!) * p), 0)
  const totalCap = run.shows.reduce((s, sh) => s + showModelCap(sh), 0)

  if (!run) return <p className="text-slate-400 p-8">No runs available.</p>

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--gold)' }}>Run Viability Calculator</h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>Drag sell-through sliders to model different scenarios in real time.</p>
      </div>

      {/* Run selector */}
      <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-7 gap-2">
        {runs.map(r => {
          const color = statusColor(r.status)
          const active = r.code === selectedId
          return (
            <button
              key={r.code}
              onClick={() => selectRun(r.code)}
              className="rounded-lg px-3 py-2 text-xs font-bold transition-all text-left"
              style={{
                background: active ? 'var(--surface2)' : 'var(--surface)',
                border: `1px solid ${active ? color : 'var(--border)'}`,
                color: active ? color : 'var(--muted)',
                boxShadow: active ? `0 0 0 1px ${color}40` : 'none',
              }}
            >
              <div>{r.code}</div>
              <div className="font-normal mt-0.5 truncate" style={{ color: active ? 'var(--text)' : 'var(--muted)', fontSize: 10 }}>
                {r.name.split(' · ')[0]}
              </div>
            </button>
          )
        })}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Sliders */}
        <div className="space-y-6">
          <div className="rounded-xl p-6 space-y-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div>
              <h2 className="font-semibold text-lg" style={{ color: 'var(--text)' }}>{run.name}</h2>
              <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
                {run.region} · {run.shows.map(s => fmtDate(s.date)).join(', ')}
              </p>
            </div>

            {run.shows.map((show, i) => {
              const cap = showModelCap(show)
              const pct = pcts[i] ?? 0.65
              const tickets = Math.floor(cap * pct)
              const modelledStaff = showModelledOnCosts(show, tickets)
              const stepped = Math.abs(modelledStaff - show.onCosts) > 0.005
              const bands = normalizeCapacityBands(show.capacityBands)
              return (
              <div key={show.id} className="space-y-2">
                <div className="flex justify-between items-center">
                  <div>
                    <div className="text-sm font-medium" style={{ color: 'var(--text)' }}>{show.venue}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs px-1.5 py-0.5 rounded font-bold uppercase"
                        style={{ color: statusColor(run.status), background: statusColor(run.status) + '20' }}>
                        {formatBookingStatus(run.status)}
                      </span>
                      <span className="text-xs" style={{ color: 'var(--muted)' }}>
                        cap {cap.toLocaleString()}{bands.length > 1 ? ` · ${bands.length} bands` : ''} · ${show.nettPrice}/ticket
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold" style={{ color: 'var(--gold)' }}>{Math.round(pct * 100)}%</div>
                    <div className="text-xs" style={{ color: 'var(--muted)' }}>
                      {tickets.toLocaleString()} tickets
                    </div>
                  </div>
                </div>
                <BandedSellSlider
                  value={Math.round(pct * 100)}
                  onChange={v => { const np = [...pcts]; np[i] = v / 100; setPcts(np) }}
                  capacity={cap}
                  capacityBands={show.capacityBands}
                />
                <div className="flex justify-between text-xs" style={{ color: 'var(--muted)' }}>
                  <span>Staff {stepped ? '(calc)' : '(base)'}: {fmt(modelledStaff)}</span>
                  {stepped ? <span>base {fmt(show.onCosts)}</span> : <span>0% — 100%</span>}
                </div>
              </div>
            )})}

            {/* Breakeven indicator */}
            {be && (
              <div className="rounded-lg px-4 py-3 flex items-center justify-between text-sm"
                style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                <span style={{ color: 'var(--muted)' }}>Breakeven sell-through</span>
                <span className="font-bold" style={{ color: be <= 0.5 ? 'var(--green)' : be <= 0.65 ? 'var(--amber)' : 'var(--red)' }}>
                  {Math.round(be * 100)}%
                </span>
              </div>
            )}
          </div>

          {/* Warnings */}
          {run.warnings.length > 0 && (
            <div className="space-y-2">
              {run.warnings.map((w, i) => (
                <div key={i} className="flex gap-2 px-4 py-3 rounded-lg text-xs" style={{ background: '#1c0a0a', border: '1px solid #3b1515' }}>
                  <span style={{ color: '#fca5a5' }}>⚠ {w}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Results */}
        <div className="space-y-4">
          {/* Big profit number */}
          <div className="rounded-xl p-6" style={{
            background: result.preReserve >= 0 ? '#052e16' : '#1c0606',
            border: `1px solid ${result.preReserve >= 0 ? '#166534' : '#7f1d1d'}`
          }}>
            <div className="flex items-center gap-2 mb-1" style={{ color: result.preReserve >= 0 ? 'var(--green)' : 'var(--red)' }}>
              {result.preReserve >= 0 ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
              <span className="text-sm font-medium">Pre-reserve profit</span>
            </div>
            <div className="text-4xl font-bold" style={{ color: result.preReserve >= 0 ? 'var(--green)' : 'var(--red)' }}>
              {fmt(result.preReserve)}
            </div>
            <div className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
              {totalTickets.toLocaleString()} of {totalCap.toLocaleString()} tickets sold ({Math.round(totalTickets / totalCap * 100)}% blended)
            </div>
          </div>

          {/* Distribution waterfall */}
          <div className="rounded-xl p-5 space-y-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <h3 className="text-sm font-semibold" style={{ color: 'var(--muted)' }}>Distribution Waterfall</h3>
            <Row label="Venue net (less hire, on-costs, APRA, Harbour)" value={result.venueNet} />
            <Row label="Fixed run costs (travel, crew, ads)" value={-run.fixedTotal} negative />
            <Row label="Social media (per ticket)" value={-result.social} negative />
            <div className="border-t pt-3 mt-3" style={{ borderColor: 'var(--border)' }}>
              <Row label="Pre-reserve profit" value={result.preReserve} bold />
            </div>
            <Row label="GST quarantine (1/11 ≈ 9.1%)" value={-result.gstQuarantine} negative />
            <Row label="Owner reserve (20%)" value={-result.ownerReserve} negative />
            <div className="border-t pt-3 mt-3" style={{ borderColor: 'var(--border)' }}>
              <Row label="Distributable" value={result.distributable} bold />
            </div>
          </div>

          {/* Owner splits */}
          <div className="grid grid-cols-3 gap-3">
            {([
              { name: 'Gareth', pct: 40, color: 'var(--gold)' },
              { name: 'Brad', pct: 30, color: 'var(--blue)' },
              { name: 'Scott', pct: 30, color: 'var(--purple)' },
            ] as const).map(o => (
              <div key={o.name} className="rounded-xl p-4 text-center" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <div className="text-xs font-medium mb-1" style={{ color: 'var(--muted)' }}>{o.name} ({o.pct}%)</div>
                <div className="text-lg font-bold" style={{ color: o.color }}>
                  {result.distributable >= 0 ? fmt(result.distributable * o.pct / 100) : '—'}
                </div>
              </div>
            ))}
          </div>

          {/* Scenario comparison */}
          <div className="rounded-xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="px-4 py-3" style={{ background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
              <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--muted)' }}>Scenario Comparison</span>
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Sell%', 'Profit', 'Gareth'].map(h => (
                    <th key={h} className="px-4 py-2 text-left font-medium" style={{ color: 'var(--muted)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[40, 50, 60, 70, 80, 90, 100].map(p => {
                  const r = calcRun(run, factors, run.shows.map(() => p / 100))
                  const avgPct = pcts.length > 0 ? pcts.reduce((s, v) => s + v, 0) / pcts.length : 0.65
                  const isCurrent = Math.abs(p / 100 - avgPct) < 0.06
                  return (
                    <tr key={p} style={{ borderBottom: '1px solid var(--border)', background: isCurrent ? 'var(--surface2)' : 'transparent' }}>
                      <td className="px-4 py-2 font-medium" style={{ color: isCurrent ? 'var(--gold)' : 'var(--muted)' }}>{p}%</td>
                      <td className="px-4 py-2 font-medium" style={{ color: r.preReserve >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmt(r.preReserve)}</td>
                      <td className="px-4 py-2 font-medium" style={{ color: 'var(--gold)' }}>{r.gareth >= 0 ? fmt(r.gareth) : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

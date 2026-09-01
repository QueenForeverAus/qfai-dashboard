'use client'
import { useState, useMemo } from 'react'
import { RUNS, calcRun, breakeven, Run, RunStatus } from '@/lib/runs'
import { TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react'

function fmt(n: number) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(n)
}

const STATUS_COLOR: Record<RunStatus, string> = {
  CONFIRMED: '#34d399', HELD: '#60a5fa', '2P': '#fbbf24', EOI: '#f87171'
}

export default function Calculator() {
  const [selectedId, setSelectedId] = useState(RUNS[0].id)
  const [pcts, setPcts] = useState<number[]>(RUNS[0].shows.map(() => 0.65))

  const run = RUNS.find(r => r.id === selectedId)!

  function selectRun(id: string) {
    const r = RUNS.find(r => r.id === id)!
    setSelectedId(id)
    setPcts(r.shows.map(() => 0.65))
  }

  const result = useMemo(() => calcRun(run, pcts), [run, pcts])
  const be = useMemo(() => breakeven(run), [run])

  const totalTickets = pcts.reduce((s, p, i) => s + Math.floor(run.shows[i].capacity * p), 0)
  const totalCap = run.shows.reduce((s, sh) => s + sh.capacity, 0)

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--gold)' }}>Run Viability Calculator</h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>Drag sell-through sliders to model different scenarios in real time.</p>
      </div>

      {/* Run selector */}
      <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-7 gap-2">
        {RUNS.map(r => {
          const worstStatus = r.shows.reduce<RunStatus>((worst, s) => {
            const order: RunStatus[] = ['CONFIRMED', 'HELD', '2P', 'EOI']
            return order.indexOf(s.status) > order.indexOf(worst) ? s.status : worst
          }, 'CONFIRMED')
          const active = r.id === selectedId
          return (
            <button
              key={r.id}
              onClick={() => selectRun(r.id)}
              className="rounded-lg px-3 py-2 text-xs font-bold transition-all text-left"
              style={{
                background: active ? 'var(--surface2)' : 'var(--surface)',
                border: `1px solid ${active ? STATUS_COLOR[worstStatus] : 'var(--border)'}`,
                color: active ? STATUS_COLOR[worstStatus] : 'var(--muted)',
                outline: active ? `0px solid ${STATUS_COLOR[worstStatus]}` : 'none',
                boxShadow: active ? `0 0 0 1px ${STATUS_COLOR[worstStatus]}40` : 'none',
              }}
            >
              <div>{r.id}</div>
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
              <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>{run.region} · {run.shows.map(s => s.date).join(', ')}</p>
            </div>

            {run.shows.map((show, i) => (
              <div key={i} className="space-y-2">
                <div className="flex justify-between items-center">
                  <div>
                    <div className="text-sm font-medium" style={{ color: 'var(--text)' }}>{show.venue}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs px-1.5 py-0.5 rounded font-bold" style={{ color: STATUS_COLOR[show.status], background: STATUS_COLOR[show.status] + '20' }}>
                        {show.status}
                      </span>
                      <span className="text-xs" style={{ color: 'var(--muted)' }}>cap {show.capacity.toLocaleString()}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold" style={{ color: 'var(--gold)' }}>{Math.round(pcts[i] * 100)}%</div>
                    <div className="text-xs" style={{ color: 'var(--muted)' }}>{Math.floor(show.capacity * pcts[i]).toLocaleString()} tickets</div>
                  </div>
                </div>
                <input
                  type="range" min={0} max={100} value={Math.round(pcts[i] * 100)}
                  onChange={e => { const np = [...pcts]; np[i] = Number(e.target.value) / 100; setPcts(np) }}
                  className="w-full h-2 rounded-full appearance-none cursor-pointer"
                  style={{ accentColor: 'var(--gold)' }}
                />
                <div className="flex justify-between text-xs" style={{ color: 'var(--muted)' }}>
                  <span>0%</span><span>50%</span><span>100%</span>
                </div>
              </div>
            ))}

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
          {run.warnings && (
            <div className="space-y-2">
              {run.warnings.map((w, i) => (
                <div key={i} className="flex gap-2 px-4 py-3 rounded-lg text-xs" style={{ background: '#1c0a0a', border: '1px solid #3b1515' }}>
                  <AlertTriangle size={14} className="shrink-0 mt-0.5" style={{ color: 'var(--red)' }} />
                  <span style={{ color: '#fca5a5' }}>{w}</span>
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

          {/* Distribution */}
          <div className="rounded-xl p-5 space-y-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <h3 className="text-sm font-semibold" style={{ color: 'var(--muted)' }}>Distribution Waterfall</h3>
            <Row label="Venue net (less hire, on-costs, APRA, Harbour)" value={result.venueNet} />
            <Row label="Fixed run costs (travel, crew, ads)" value={-result.fixedTotal} negative />
            <Row label="Social media (per ticket)" value={-result.social} negative />
            <div className="border-t pt-3 mt-3" style={{ borderColor: 'var(--border)' }}>
              <Row label="Pre-reserve profit" value={result.preReserve} bold />
            </div>
            <Row label="GST quarantine (20%)" value={result.preReserve > 0 ? -result.preReserve * 0.20 : 0} negative />
            <Row label="Owner reserve (20%)" value={result.preReserve > 0 ? -result.preReserve * 0.64 * 0.20 : 0} negative />
            <div className="border-t pt-3 mt-3" style={{ borderColor: 'var(--border)' }}>
              <Row label="Distributable" value={result.distributable} bold />
            </div>
          </div>

          {/* Owner splits */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { name: 'Gareth', pct: 40, color: 'var(--gold)' },
              { name: 'Brad', pct: 30, color: 'var(--blue)' },
              { name: 'Scott', pct: 30, color: 'var(--purple)' },
            ].map(o => (
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
                  const r = calcRun(run, run.shows.map(() => p / 100))
                  const isCurrent = Math.abs(p / 100 - pcts.reduce((s, v) => s + v, 0) / pcts.length) < 0.06
                  return (
                    <tr key={p}
                      style={{
                        borderBottom: '1px solid var(--border)',
                        background: isCurrent ? 'var(--surface2)' : 'transparent',
                      }}>
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

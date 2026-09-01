'use client'
import { useState } from 'react'
import { RUNS, calcRun } from '@/lib/runs'
import { CheckCircle, XCircle, AlertTriangle, ChevronRight } from 'lucide-react'

function fmt(n: number) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 2 }).format(n)
}

interface SettlementInput {
  grossBoxOffice: string
  harbourCommission: string
  venueCosts: string
  ticketingFees: string
  apra: string
  creditCardFees: string
  otherDeductions: string
  netPayable: string
}

interface Check {
  label: string
  expected: number
  received: number
  ok: boolean
  tolerance: number
  note?: string
}

export default function SettlementChecker() {
  const [selectedRun, setSelectedRun] = useState(RUNS[0].id)
  const [selectedShow, setSelectedShow] = useState(0)
  const [sellPct, setSellPct] = useState(70)
  const [input, setInput] = useState<SettlementInput>({
    grossBoxOffice: '', harbourCommission: '', venueCosts: '',
    ticketingFees: '', apra: '', creditCardFees: '', otherDeductions: '', netPayable: '',
  })
  const [checks, setChecks] = useState<Check[] | null>(null)

  const run = RUNS.find(r => r.id === selectedRun)!
  const show = run.shows[selectedShow]
  const pcts = run.shows.map((_, i) => i === selectedShow ? sellPct / 100 : 0.65)
  const result = calcRun(run, pcts)

  const tickets = Math.floor(show.capacity * sellPct / 100)
  const grossBO = tickets * (show.nettPrice + show.bookingFee)
  const nettBO = tickets * show.nettPrice
  const expectedHarbour = nettBO * run.harbourPct
  const expectedCC = grossBO * show.ccPct
  const expectedAPRA = grossBO * show.apraPct
  const expectedTicketingFees = tickets * show.bookingFee
  const actualHire = Math.max(show.venueHireFlat, show.venueHirePct * nettBO)
  const expectedVenueCosts = actualHire + show.onCosts
  const expectedNet = nettBO - expectedHarbour - expectedCC - expectedAPRA - actualHire - show.onCosts

  function parse(s: string) { return parseFloat(s.replace(/[,$\s]/g, '')) || 0 }

  function runChecks() {
    const checks: Check[] = [
      {
        label: 'Gross box office',
        expected: grossBO,
        received: parse(input.grossBoxOffice),
        ok: Math.abs(parse(input.grossBoxOffice) - grossBO) <= grossBO * 0.02,
        tolerance: 2,
        note: `Based on ${tickets} tickets × $${(show.nettPrice + show.bookingFee).toFixed(2)}`
      },
      {
        label: 'Ticketing / booking fees (ticketer keeps)',
        expected: expectedTicketingFees,
        received: parse(input.ticketingFees),
        ok: Math.abs(parse(input.ticketingFees) - expectedTicketingFees) <= expectedTicketingFees * 0.02,
        tolerance: 2,
        note: `$${show.bookingFee.toFixed(2)}/ticket × ${tickets} tickets`
      },
      {
        label: 'Harbour Agency commission (10% of nett BO)',
        expected: expectedHarbour,
        received: parse(input.harbourCommission),
        ok: Math.abs(parse(input.harbourCommission) - expectedHarbour) <= expectedHarbour * 0.01,
        tolerance: 1,
        note: `10% of $${fmt(nettBO)} nett box office`
      },
      {
        label: 'Credit card / transaction fees',
        expected: expectedCC,
        received: parse(input.creditCardFees),
        ok: Math.abs(parse(input.creditCardFees) - expectedCC) <= expectedCC * 0.05,
        tolerance: 5,
        note: `${(show.ccPct * 100).toFixed(1)}% of gross $${fmt(grossBO)}`
      },
      {
        label: 'APRA (2% of gross)',
        expected: expectedAPRA,
        received: parse(input.apra),
        ok: Math.abs(parse(input.apra) - expectedAPRA) <= expectedAPRA * 0.02,
        tolerance: 2,
        note: `2% of gross box office $${fmt(grossBO)}`
      },
      {
        label: 'Venue hire + on-costs',
        expected: expectedVenueCosts,
        received: parse(input.venueCosts),
        ok: Math.abs(parse(input.venueCosts) - expectedVenueCosts) <= expectedVenueCosts * 0.05,
        tolerance: 5,
        note: `Hire $${fmt(actualHire)} + on-costs $${fmt(show.onCosts)}`
      },
      {
        label: 'Net payable to QF',
        expected: expectedNet,
        received: parse(input.netPayable),
        ok: Math.abs(parse(input.netPayable) - expectedNet) <= Math.abs(expectedNet) * 0.02,
        tolerance: 2,
        note: 'Bottom line — nett BO less all deductions'
      },
    ]
    setChecks(checks)
  }

  const passCount = checks?.filter(c => c.ok).length ?? 0
  const failCount = checks ? checks.length - passCount : 0

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--gold)' }}>Settlement Checker</h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
          Paste settlement figures and cross-check against contract terms. Flags every discrepancy before Gareth signs off.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Left: Setup */}
        <div className="space-y-5">
          <div className="rounded-xl p-5 space-y-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <h2 className="font-semibold text-sm" style={{ color: 'var(--muted)' }}>1. Select run and show</h2>

            <div>
              <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--muted)' }}>Run</label>
              <select
                value={selectedRun}
                onChange={e => { setSelectedRun(e.target.value); setSelectedShow(0); setChecks(null) }}
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}
              >
                {RUNS.map(r => <option key={r.id} value={r.id}>{r.id} — {r.name}</option>)}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--muted)' }}>Show</label>
              <select
                value={selectedShow}
                onChange={e => { setSelectedShow(Number(e.target.value)); setChecks(null) }}
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}
              >
                {run.shows.map((s, i) => <option key={i} value={i}>{s.venue} — {s.date}</option>)}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--muted)' }}>
                Actual sell-through: <span style={{ color: 'var(--gold)' }}>{sellPct}%</span> ({tickets.toLocaleString()} tickets)
              </label>
              <input type="range" min={0} max={100} value={sellPct}
                onChange={e => { setSellPct(Number(e.target.value)); setChecks(null) }}
                className="w-full" style={{ accentColor: 'var(--gold)' }} />
            </div>
          </div>

          {/* Expected values */}
          <div className="rounded-xl p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <h2 className="font-semibold text-sm mb-4" style={{ color: 'var(--muted)' }}>Expected (from contract)</h2>
            <div className="space-y-2 text-sm">
              {[
                ['Gross box office', grossBO],
                ['Ticketing fees (ticketer keeps)', expectedTicketingFees],
                ['Nett box office', nettBO],
                ['Harbour 10%', expectedHarbour],
                ['Credit card fees', expectedCC],
                ['APRA 2%', expectedAPRA],
                ['Venue hire', actualHire],
                ['On-costs', show.onCosts],
                ['Net payable to QF', expectedNet],
              ].map(([label, val]) => (
                <div key={String(label)} className="flex justify-between">
                  <span style={{ color: 'var(--muted)' }}>{label}</span>
                  <span className="font-medium" style={{ color: Number(val) < 0 ? 'var(--red)' : 'var(--text)' }}>{fmt(Number(val))}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Input + Results */}
        <div className="space-y-5">
          <div className="rounded-xl p-5 space-y-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <h2 className="font-semibold text-sm" style={{ color: 'var(--muted)' }}>2. Paste settlement figures</h2>
            {(Object.keys(input) as Array<keyof SettlementInput>).map(key => {
              const labels: Record<keyof SettlementInput, string> = {
                grossBoxOffice: 'Gross box office', harbourCommission: 'Harbour commission',
                venueCosts: 'Venue hire + on-costs', ticketingFees: 'Ticketing / booking fees',
                apra: 'APRA', creditCardFees: 'Credit card fees',
                otherDeductions: 'Other deductions', netPayable: 'Net payable to QF',
              }
              return (
                <div key={key}>
                  <label className="text-xs font-medium block mb-1" style={{ color: 'var(--muted)' }}>{labels[key]}</label>
                  <input
                    type="text" placeholder="$0.00"
                    value={input[key]}
                    onChange={e => { setInput(p => ({ ...p, [key]: e.target.value })); setChecks(null) }}
                    className="w-full px-3 py-2 rounded-lg text-sm"
                    style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}
                  />
                </div>
              )
            })}
            <button
              onClick={runChecks}
              className="w-full py-2.5 rounded-lg font-semibold text-sm transition-all"
              style={{ background: 'var(--gold)', color: '#000' }}
            >
              Check Settlement
            </button>
          </div>

          {/* Results */}
          {checks && (
            <div className="rounded-xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <div className="px-5 py-3 flex items-center justify-between" style={{ background: failCount > 0 ? '#1c0606' : '#052e16', borderBottom: '1px solid var(--border)' }}>
                <span className="font-semibold text-sm" style={{ color: failCount > 0 ? 'var(--red)' : 'var(--green)' }}>
                  {failCount > 0 ? `⚠ ${failCount} discrepanc${failCount === 1 ? 'y' : 'ies'} found` : '✓ Settlement checks out'}
                </span>
                <span className="text-xs" style={{ color: 'var(--muted)' }}>{passCount}/{checks.length} passed</span>
              </div>
              <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                {checks.map((c, i) => (
                  <div key={i} className="px-5 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2">
                        {c.ok
                          ? <CheckCircle size={16} className="mt-0.5 shrink-0" style={{ color: 'var(--green)' }} />
                          : <XCircle size={16} className="mt-0.5 shrink-0" style={{ color: 'var(--red)' }} />
                        }
                        <div>
                          <div className="text-sm font-medium" style={{ color: 'var(--text)' }}>{c.label}</div>
                          {c.note && <div className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>{c.note}</div>}
                          {!c.ok && (
                            <div className="text-xs mt-1 font-medium" style={{ color: 'var(--red)' }}>
                              Expected {fmt(c.expected)}, received {fmt(c.received)} · diff {fmt(c.received - c.expected)}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="text-sm font-medium shrink-0" style={{ color: c.ok ? 'var(--green)' : 'var(--red)' }}>
                        {fmt(c.received || 0)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

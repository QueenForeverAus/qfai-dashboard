'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { formatDateAU, formatDateShortAU } from '@/lib/dates'
import {
  SETTLEMENT_PROPOSED_NOTE,
  SETTLEMENTS_MODULE_LABEL,
} from '@/lib/settlements'
import { REMITTANCE_CASH_NOTE, REMITTANCE_TAB_LABEL } from '@/lib/remittance'
import { SHEET_TAB_LABEL, settlementSheetHref } from '@/lib/settlements-sheet'

export type SettlementListShow = {
  id: string
  venue_name: string
  venue_city: string
  show_date: string | null
  show_order: number
}

export type SettlementListRun = {
  id: string
  code: string
  name: string
  status: string
  start_date: string | null
  end_date: string | null
  finalised: boolean
  finalised_at: string | null
  band_cost_open: number
  shows: SettlementListShow[]
}

const STATUS: Record<string, string> = {
  confirmed: 'bg-green-900/40 text-green-400 border-green-800',
  proposed: 'bg-amber-900/40 text-amber-400 border-amber-800',
  post_show: 'bg-orange-900/40 text-orange-400 border-orange-800',
  settled: 'bg-slate-700 text-slate-400 border-slate-600',
  show_week: 'bg-purple-900/40 text-purple-400 border-purple-800',
}

export default function SettlementsListClient({ runs }: { runs: SettlementListRun[] }) {
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {}
    for (const run of runs) {
      if (run.code.toUpperCase() === 'R12' || run.finalised || run.status === 'post_show') {
        initial[run.id] = true
      }
    }
    return initial
  })
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return runs
    return runs.filter(run => {
      if (run.code.toLowerCase().includes(q) || run.name.toLowerCase().includes(q)) return true
      return run.shows.some(s =>
        s.venue_name.toLowerCase().includes(q) || s.venue_city.toLowerCase().includes(q),
      )
    })
  }, [query, runs])

  return (
    <div className="p-4 sm:p-6 max-w-5xl">
      <div className="mb-5">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <h1 className="text-white text-2xl font-bold tracking-wide">{SETTLEMENTS_MODULE_LABEL}</h1>
          <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-teal-900/40 text-teal-300 border border-teal-800">
            {REMITTANCE_TAB_LABEL}
          </span>
        </div>
        <p className="text-slate-400 text-sm">{SETTLEMENT_PROPOSED_NOTE}</p>
        <p className="text-slate-500 text-xs mt-1">{REMITTANCE_CASH_NOTE}</p>
        <p className="text-slate-500 text-xs mt-1">Post-show close. Tour Desk stays the pre-show costing workspace.</p>
        <p className="text-slate-500 text-xs mt-1">
          Rebuild path: <span className="text-slate-400">{SHEET_TAB_LABEL}</span> is the 3-column expected vs actual view. Wave 1 Settlement / Remittance stay available.
        </p>
      </div>

      <input
        type="search"
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Find a run or venue (e.g. R12)"
        className="w-full mb-4 px-3 py-2 rounded-lg text-sm bg-slate-800 border border-slate-700 text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-400"
      />

      {filtered.length === 0 ? (
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-8 text-center text-slate-500">
          No runs match.
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(run => {
            const expanded = Boolean(open[run.id])
            return (
              <div key={run.id} className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-3">
                  <button
                    type="button"
                    aria-expanded={expanded}
                    onClick={() => setOpen(prev => ({ ...prev, [run.id]: !prev[run.id] }))}
                    className="text-slate-400 hover:text-white text-sm w-7 h-7 rounded-md hover:bg-slate-700 shrink-0"
                    title={expanded ? 'Hide shows' : 'Show nested shows'}
                  >
                    {expanded ? '▾' : '▸'}
                  </button>
                  <Link
                    href={`/settlements/${run.code.toLowerCase()}`}
                    className="flex-1 min-w-0 flex items-center gap-3"
                    data-testid={`settlement-run-${run.code}`}
                  >
                    <span className="text-amber-400 font-bold shrink-0">{run.code}</span>
                    <span className="text-white text-sm truncate">{run.name}</span>
                    <span className={`hidden sm:inline px-2 py-0.5 rounded text-[10px] font-semibold uppercase border ${STATUS[run.status] ?? 'bg-slate-700 text-slate-400 border-slate-600'}`}>
                      {run.status.replace('_', ' ')}
                    </span>
                  </Link>
                  <div className="flex items-center gap-2 shrink-0">
                    <Link
                      href={settlementSheetHref(run.code)}
                      className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded border bg-teal-900/30 text-teal-300 border-teal-800 hover:bg-teal-900/50"
                      data-testid={`settlement-sheet-run-${run.code}`}
                    >
                      {SHEET_TAB_LABEL}
                    </Link>
                    {run.finalised ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded border bg-teal-900/40 text-teal-300 border-teal-800">
                        FINALISED
                      </span>
                    ) : (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded border bg-slate-900 text-slate-500 border-slate-700">
                        Not finalised
                      </span>
                    )}
                    {run.band_cost_open > 0 && (
                      <span className="text-[10px] text-orange-400">{run.band_cost_open} open band cost{run.band_cost_open === 1 ? '' : 's'}</span>
                    )}
                  </div>
                </div>
                {expanded && (
                  <div className="border-t border-slate-700/70 bg-slate-900/40">
                    <div className="px-4 py-2 text-[10px] uppercase tracking-wide text-slate-600">
                      Nested shows · {formatDateAU(run.start_date)}{run.start_date !== run.end_date ? ` – ${formatDateAU(run.end_date)}` : ''}
                    </div>
                    {run.shows.length === 0 ? (
                      <p className="px-4 pb-3 text-slate-500 text-sm">No shows on this run.</p>
                    ) : (
                      <ul>
                        {run.shows.map(show => (
                          <li key={show.id}>
                            <div className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-slate-800/80 text-sm">
                              <Link
                                href={`/settlements/${run.code.toLowerCase()}/${show.id}`}
                                className="flex-1 min-w-0 flex items-center justify-between gap-3"
                                data-testid={`settlement-show-${show.id}`}
                              >
                                <span className="text-slate-200">
                                  {show.venue_name}
                                  {show.venue_city ? <span className="text-slate-500"> · {show.venue_city}</span> : null}
                                </span>
                                <span className="text-slate-500 text-xs shrink-0">{formatDateShortAU(show.show_date)}</span>
                              </Link>
                              <Link
                                href={settlementSheetHref(run.code, show.id)}
                                className="shrink-0 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded border bg-teal-900/30 text-teal-300 border-teal-800 hover:bg-teal-900/50"
                                data-testid={`settlement-sheet-${show.id}`}
                              >
                                {SHEET_TAB_LABEL}
                              </Link>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

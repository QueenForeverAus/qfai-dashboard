'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { formatDateAU, formatDateShortAU } from '@/lib/dates'
import {
  SETTLEMENT_PROPOSED_NOTE,
  SETTLEMENTS_MODULE_LABEL,
} from '@/lib/settlements'
import { settlementSheetHref } from '@/lib/settlements-sheet'
import {
  SETTLEMENTS_LIST_BUCKETS,
  SETTLEMENTS_LIST_BUCKET_EMPTY,
  SETTLEMENTS_LIST_BUCKET_LABELS,
  SETTLEMENTS_LIST_EMPTY,
  defaultSettlementsListBucket,
  type SettlementsListBucket,
} from '@/lib/settlements-list'

export type SettlementListShow = {
  id: string
  venue_name: string
  venue_city: string
  show_date: string | null
  show_order: number
  harbour_status?: string | null
}

export type SettlementListRun = {
  id: string
  code: string
  name: string
  notes: string | null
  status: string
  start_date: string | null
  end_date: string | null
  finalised: boolean
  finalised_at: string | null
  remittance_status: string
  bucket: SettlementsListBucket
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

const BUCKET_BADGE: Record<SettlementsListBucket, { label: string; className: string }> = {
  not_settled: {
    label: 'Not settled',
    className: 'bg-orange-900/40 text-orange-300 border-orange-800',
  },
  settled: {
    label: 'Settled',
    className: 'bg-teal-900/40 text-teal-300 border-teal-800',
  },
  settled_remitted: {
    label: 'Settled & remitted',
    className: 'bg-slate-700 text-slate-300 border-slate-600',
  },
}

export default function SettlementsListClient({ runs }: { runs: SettlementListRun[] }) {
  const counts = useMemo(() => {
    const next: Record<SettlementsListBucket, number> = {
      not_settled: 0,
      settled: 0,
      settled_remitted: 0,
    }
    for (const run of runs) next[run.bucket] += 1
    return next
  }, [runs])

  const [bucket, setBucket] = useState<SettlementsListBucket>(() => defaultSettlementsListBucket(counts))
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {}
    for (const run of runs) {
      if (
        run.code.toUpperCase() === 'R12'
        || run.finalised
        || run.status === 'post_show'
        || run.bucket !== 'not_settled'
      ) {
        initial[run.id] = true
      }
    }
    return initial
  })
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const inBucket = runs.filter(run => run.bucket === bucket)
    const q = query.trim().toLowerCase()
    if (!q) return inBucket
    return inBucket.filter(run => {
      if (run.code.toLowerCase().includes(q) || run.name.toLowerCase().includes(q)) return true
      return run.shows.some(s =>
        s.venue_name.toLowerCase().includes(q) || s.venue_city.toLowerCase().includes(q),
      )
    })
  }, [query, runs, bucket])

  return (
    <div className="p-4 sm:p-6 max-w-5xl">
      <div className="mb-5">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <h1 className="text-white text-2xl font-bold tracking-wide">{SETTLEMENTS_MODULE_LABEL}</h1>
          <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-teal-900/40 text-teal-300 border border-teal-800">
            Expected vs actual
          </span>
        </div>
        <p className="text-slate-400 text-sm">{SETTLEMENT_PROPOSED_NOTE}</p>
        <p className="text-slate-500 text-xs mt-1">Post-show close. Only completed shows appear here. Tour Desk stays the pre-show costing workspace.</p>
        <p className="text-slate-500 text-xs mt-1">
          Opening a run lands on the 3-column Expected vs Actual sheet. Remittance and Wave-1 agent settlement stay available from the sheet.
        </p>
      </div>

      <div
        role="tablist"
        aria-label="Settlement lifecycle"
        className="flex flex-wrap gap-2 mb-4"
        data-testid="settlements-bucket-tabs"
      >
        {SETTLEMENTS_LIST_BUCKETS.map(key => {
          const on = bucket === key
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={on}
              data-testid={`settlements-bucket-${key}`}
              onClick={() => setBucket(key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                on
                  ? 'bg-amber-400/15 text-amber-300 border-amber-700'
                  : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
              }`}
            >
              {SETTLEMENTS_LIST_BUCKET_LABELS[key]}
              <span className="ml-1.5 text-[10px] tabular-nums opacity-80">{counts[key]}</span>
            </button>
          )
        })}
      </div>

      <input
        type="search"
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Find a completed run or venue"
        className="w-full mb-4 px-3 py-2 rounded-lg text-sm bg-slate-800 border border-slate-700 text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-400"
      />

      {runs.length === 0 ? (
        <div
          className="bg-slate-800 rounded-xl border border-slate-700 p-8 text-center text-slate-500"
          data-testid="settlements-empty"
        >
          {SETTLEMENTS_LIST_EMPTY}
        </div>
      ) : filtered.length === 0 ? (
        <div
          className="bg-slate-800 rounded-xl border border-slate-700 p-8 text-center text-slate-500"
          data-testid="settlements-empty-bucket"
        >
          {query.trim() ? 'No runs match.' : SETTLEMENTS_LIST_BUCKET_EMPTY}
        </div>
      ) : (
        <div className="space-y-2" data-testid="settlements-list-run-grain">
          {filtered.map(run => {
            const expanded = Boolean(open[run.id])
            const badge = BUCKET_BADGE[run.bucket]
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
                    href={settlementSheetHref(run.code)}
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
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${badge.className}`}>
                      {badge.label}
                    </span>
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
                      Venues on this run · one settlement · {formatDateAU(run.start_date)}{run.start_date !== run.end_date ? ` – ${formatDateAU(run.end_date)}` : ''}
                    </div>
                    {run.shows.length === 0 ? (
                      <p className="px-4 pb-3 text-slate-500 text-sm">No shows on this run.</p>
                    ) : (
                      <ul>
                        {run.shows.map(show => (
                          <li key={show.id}>
                            <div className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-slate-800/80 text-sm">
                              <Link
                                href={settlementSheetHref(run.code, show.id)}
                                className="flex-1 min-w-0 flex items-center justify-between gap-3"
                                data-testid={`settlement-show-${show.id}`}
                              >
                                <span className="text-slate-200">
                                  {show.venue_name}
                                  {show.venue_city ? <span className="text-slate-500"> · {show.venue_city}</span> : null}
                                </span>
                                <span className="text-slate-500 text-xs shrink-0">{formatDateShortAU(show.show_date)}</span>
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

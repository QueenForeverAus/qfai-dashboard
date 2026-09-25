'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { formatDateAU } from '@/lib/dates'
import type { TicketSalesBoard, TicketSalesBoardRow, TicketSalesPace } from '@/lib/ticket-sales-board'
import TicketSalesTabs from './TicketSalesTabs'

const PACE_OPTIONS: { value: '' | TicketSalesPace; label: string }[] = [
  { value: '', label: '—' },
  { value: 'clear', label: 'Clear' },
  { value: 'watch', label: 'Watch' },
  { value: 'impediment', label: 'Impediment' },
]

const HORIZON_CLASS: Record<string, string> = {
  Near: 'bg-amber-900/40 text-amber-300 border-amber-800',
  Mid: 'bg-sky-900/40 text-sky-300 border-sky-800',
  Far: 'bg-slate-700 text-slate-300 border-slate-600',
}

function countText(value: number | null): string {
  if (value == null) return '—'
  return value.toLocaleString('en-AU')
}

function PaceSelect({ row }: { row: TicketSalesBoardRow }) {
  const [pace, setPace] = useState<string>(row.pace ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onChange(next: string) {
    const previous = pace
    setPace(next)
    setSaving(true)
    setError(null)
    const res = await fetch('/api/ticket-sales/pace', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ show_id: row.showId, pace: next || null }),
    })
    setSaving(false)
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setPace(previous)
      setError(typeof body.error === 'string' ? body.error : 'Could not save pace')
    }
  }

  return (
    <div className="min-w-[8.5rem]">
      <label className="sr-only" htmlFor={`pace-${row.sheetRowKey}`}>Pace for {row.venueName}</label>
      <select
        id={`pace-${row.sheetRowKey}`}
        value={pace}
        disabled={saving || !row.showId}
        onChange={event => { void onChange(event.target.value) }}
        className="w-full bg-slate-900 border border-slate-600 rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:border-amber-400 disabled:opacity-50"
      >
        {PACE_OPTIONS.map(option => (
          <option key={option.value || 'empty'} value={option.value}>{option.label}</option>
        ))}
      </select>
      {error && <p className="text-red-400 text-[11px] mt-1">{error}</p>}
    </div>
  )
}

export default function TicketSalesBoardClient({
  board,
  sourceFile,
  sourceSheet,
}: {
  board: TicketSalesBoard
  sourceFile: string | null
  sourceSheet: string | null
}) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function upload(file: File) {
    setUploading(true)
    setError(null)
    setMessage(null)
    const form = new FormData()
    form.append('file', file)
    form.append('scope', 'all')
    const res = await fetch('/api/admin/ticket-sales/ingest', { method: 'POST', body: form })
    const body = await res.json().catch(() => ({}))
    setUploading(false)
    if (!res.ok) {
      setError(typeof body.error === 'string' ? body.error : 'Upload failed')
      return
    }
    const snapshots = Array.isArray(body.snapshots) ? body.snapshots.length : 0
    setMessage(`Ingested ${body.sheet ?? 'sheet'} from ${body.source_file ?? file.name} — ${snapshots} weekly snapshot${snapshots === 1 ? '' : 's'}.`)
    router.refresh()
  }

  const offBoard = Math.max(0, board.snapshotRowCount - board.rows.length - board.unmatched.length)

  return (
    <div className="min-h-screen bg-slate-900 px-4 py-8 max-w-6xl mx-auto">
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Ticket Sales & Ads</h1>
          <TicketSalesTabs active="board" />
          <p className="text-slate-400 text-sm mt-3">Ads in a later slice</p>
          <p className="text-amber-400/70 text-xs mt-2">
            Owner-only — same gate as Run Costings and Ticket Outlook. Not visible to crew, production, or promoters.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="text-sm bg-amber-400 text-slate-900 font-semibold px-3 py-2 rounded-lg hover:bg-amber-300 disabled:opacity-50"
          >
            {uploading ? 'Reading sheet…' : 'Upload weekly sheet'}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={event => {
              const file = event.target.files?.[0]
              if (file) void upload(file)
              event.target.value = ''
            }}
          />
        </div>
      </div>

      {error && (
        <div className="text-red-400 text-sm bg-red-900/20 border border-red-800 rounded-lg px-4 py-3 mb-4">{error}</div>
      )}
      {message && (
        <div className="text-green-400 text-sm bg-green-900/20 border border-green-800 rounded-lg px-4 py-3 mb-4">{message}</div>
      )}

      <p className="text-slate-500 text-xs mb-4">
        Meta spend, recommendations, and ad controls come in slice 2–3.
      </p>

      {!board.asOf ? (
        <div className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-8 text-center text-slate-400 text-sm">
          No weekly snapshot yet. Upload the ticket-sales workbook to build this board.
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-slate-700 bg-slate-800/60">
            <table className="w-full text-sm min-w-[880px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500 border-b border-slate-700">
                  <th className="px-3 py-3 font-semibold">Show</th>
                  <th className="px-3 py-3 font-semibold">Horizon</th>
                  <th className="px-3 py-3 font-semibold text-right">Sold</th>
                  <th className="px-3 py-3 font-semibold text-right">Capacity</th>
                  <th className="px-3 py-3 font-semibold text-right">% sold</th>
                  <th className="px-3 py-3 font-semibold text-right">Δ week</th>
                  <th className="px-3 py-3 font-semibold">Pace</th>
                  <th className="px-3 py-3 font-semibold">Sheet as-of</th>
                </tr>
              </thead>
              <tbody>
                {board.rows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-8 text-center text-slate-500">
                      The latest snapshot has no on-sale or upcoming shows with ticket numbers.
                    </td>
                  </tr>
                ) : board.rows.map(row => (
                  <tr key={row.sheetRowKey} className="border-b border-slate-700/80 align-top">
                    <td className="px-3 py-3">
                      <div className="text-slate-200">{row.city}</div>
                      <div className="text-slate-500 text-xs">{row.showDate ? formatDateAU(row.showDate, { weekday: 'short' }) : '—'}</div>
                      {row.runHref ? (
                        <Link href={row.runHref} className="text-amber-400 hover:text-amber-300 text-sm font-medium">
                          {row.venueName}
                        </Link>
                      ) : (
                        <div className="text-white">{row.venueName}</div>
                      )}
                      {row.runCode && (
                        <div className="text-slate-600 text-[11px]">{row.runCode}</div>
                      )}
                      {row.updateSource && (
                        <div className="text-slate-600 text-[11px] mt-0.5">Update source: {row.updateSource}</div>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold uppercase border ${HORIZON_CLASS[row.horizonLabel] ?? HORIZON_CLASS.Far}`}>
                        {row.horizonLabel}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right text-white tabular-nums">{countText(row.sold)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      <div className="text-white">{countText(row.capacity)}</div>
                      {row.capacity != null && (
                        <div className="text-slate-600 text-[11px]">
                          {row.capacityBasis === 'on_sale' ? 'On sale' : row.capacityBasis === 'house' ? 'House' : ''}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right text-white tabular-nums">{row.pctSold == null ? '—' : `${row.pctSold}%`}</td>
                    <td className="px-3 py-3 text-right text-white tabular-nums">{row.deltaLabel}</td>
                    <td className="px-3 py-3"><PaceSelect row={row} /></td>
                    <td className="px-3 py-3 text-slate-300 whitespace-nowrap">{formatDateAU(row.asOf)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <section className="mt-6 bg-slate-800/40 border border-dashed border-slate-600 rounded-xl px-4 py-4" aria-label="Unmatched">
            <h2 className="text-white text-sm font-semibold">Unmatched</h2>
            <p className="text-slate-500 text-xs mt-1 mb-3">
              Sheet rows for on-sale or upcoming shows that did not match a Portal show by date and venue. They stay on the snapshot.
            </p>
            {board.unmatched.length === 0 ? (
              <p className="text-slate-400 text-sm">No unmatched rows in this snapshot.</p>
            ) : (
              <ul className="space-y-2">
                {board.unmatched.map(row => (
                  <li key={row.sheetRowKey} className="text-sm text-slate-300">
                    <span className="text-white">{row.city}</span>
                    {' · '}
                    {row.showDate ? formatDateAU(row.showDate) : 'No date'}
                    {' · '}
                    {row.venueName}
                    <span className="text-slate-500">
                      {' '}— sold {countText(row.sold)}, capacity {countText(row.capacity)}
                      {row.capacityBasis === 'on_sale' ? ' on sale' : row.capacityBasis === 'house' ? ' house' : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="mt-6 text-xs text-slate-500 space-y-1">
            <p className="text-slate-400 font-medium">Source of data</p>
            <p>
              Weekly ticket-sales workbook{sourceFile ? ` (${sourceFile}` : ''}{sourceSheet ? `${sourceFile ? ', ' : ' ('}sheet ${sourceSheet}` : ''}{(sourceFile || sourceSheet) ? ')' : ''}.
              Sold is the Current Sales column. Capacity is on-sale capacity when the sheet has it, otherwise house capacity.
              This workbook has no Remaining column. % sold is Sold divided by that capacity.
              Δ week is the change in Sold against the previous snapshot{board.previousAsOf ? ` (${formatDateAU(board.previousAsOf)})` : ''}. An em dash means there is no prior snapshot for that show.
              Pace is empty until an owner sets Clear, Watch, or Impediment. Nothing on this page sets pace automatically.
            </p>
            <p>
              {offBoard > 0
                ? `${offBoard} played show${offBoard === 1 ? '' : 's'} remain in the snapshot and are left off this board.`
                : 'Every sheet row in the latest snapshot is either on the board or in Unmatched.'}
            </p>
          </section>
        </>
      )}
    </div>
  )
}

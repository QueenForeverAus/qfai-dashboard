'use client'

import {
  type CapacityBand,
  activeBandForTickets,
  bandBoundaryFractions,
  bandColour,
  normalizeCapacityBands,
  topBandSeats,
} from '@/lib/capacity-bands'

type Props = {
  /** Sell-through percent 0–100 */
  value: number
  onChange: (pct: number) => void
  capacity: number | null | undefined
  capacityBands?: unknown | null
  className?: string
}

/**
 * Colour-banded sell-through slider.
 * Track segments follow Harbour capacity bands; labels sit at seat boundaries.
 * Falls back to a plain gold slider when bands are empty.
 */
export default function BandedSellSlider({ value, onChange, capacity, capacityBands, className }: Props) {
  const bands = normalizeCapacityBands(capacityBands)
  const topCap = topBandSeats(bands, capacity) ?? 0
  const tickets = topCap > 0 ? Math.round(topCap * (value / 100)) : 0
  const active = activeBandForTickets(bands, tickets)
  const activeIdx = active ? bands.findIndex(b => b.seats === active.seats) : -1
  const boundaries = bandBoundaryFractions(bands, topCap)

  if (bands.length < 2 || topCap <= 0) {
    return (
      <div className={className}>
        <input
          type="range"
          min={0}
          max={100}
          value={value}
          onChange={e => onChange(parseInt(e.target.value, 10))}
          className="w-full h-1.5 rounded-lg appearance-none cursor-pointer bg-slate-700 accent-amber-400"
          style={{ maxWidth: '100%' }}
        />
      </div>
    )
  }

  // Build segment widths as % of track
  const segs: Array<{ widthPct: number; colour: string; seats: number; label: string | null }> = []
  let prevFrac = 0
  bands.forEach((b, i) => {
    const frac = Math.min(1, b.seats / topCap)
    const widthPct = Math.max(0, (frac - prevFrac) * 100)
    segs.push({
      widthPct,
      colour: bandColour(i),
      seats: b.seats,
      label: b.label ?? null,
    })
    prevFrac = frac
  })

  const accent = activeIdx >= 0 ? bandColour(activeIdx) : 'var(--gold, #fbbf24)'

  return (
    <div className={className}>
      {/* Colour track */}
      <div className="relative w-full mb-1" style={{ maxWidth: '100%' }}>
        <div className="flex h-2 w-full overflow-hidden rounded-full border border-slate-600/80">
          {segs.map((s, i) => (
            <div
              key={`${s.seats}-${i}`}
              style={{ width: `${s.widthPct}%`, background: s.colour }}
              title={s.label ? `${s.label} · ${s.seats}` : `${s.seats} seats`}
            />
          ))}
        </div>
        {/* Boundary tick labels */}
        <div className="relative h-4 mt-0.5 w-full">
          {boundaries.map((b, i) => (
            <div
              key={`lbl-${b.seats}-${i}`}
              className="absolute text-[9px] leading-none whitespace-nowrap"
              style={{
                left: `${b.frac * 100}%`,
                transform: b.frac >= 0.95 ? 'translateX(-100%)' : b.frac <= 0.05 ? 'translateX(0)' : 'translateX(-50%)',
                color: bandColour(i),
              }}
            >
              {b.label ? `${b.label} · ${b.seats}` : b.seats.toLocaleString()}
            </div>
          ))}
        </div>
        <input
          type="range"
          min={0}
          max={100}
          value={value}
          onChange={e => onChange(parseInt(e.target.value, 10))}
          className="absolute left-0 right-0 w-full appearance-none cursor-pointer bg-transparent"
          style={{
            top: 0,
            height: 8,
            margin: 0,
            accentColor: accent,
          }}
          aria-label="Sell-through percent"
        />
      </div>
      {active && (
        <div className="text-[10px] mt-0.5" style={{ color: accent }}>
          Band: {active.label ?? `${active.seats} seats`}
          {active.ushers_cost != null || active.security_cost != null
            ? ` · Harbour ushers/sec $${(Number(active.ushers_cost) || 0) + (Number(active.security_cost) || 0)}`
            : ' · silent scale ushers/security'}
        </div>
      )}
    </div>
  )
}

export type { CapacityBand }

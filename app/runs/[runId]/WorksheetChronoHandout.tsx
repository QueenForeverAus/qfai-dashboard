'use client'

import type { WorksheetChronoModel } from '@/lib/worksheet-travel-chrono'

export default function WorksheetChronoHandout({
  model,
  published,
}: {
  model: WorksheetChronoModel
  published: boolean
}) {
  const { header, days } = model
  return (
    <div className="space-y-4" data-testid="worksheet-chrono-handout">
      <p className="text-slate-500 text-xs">
        {published ? 'Published worksheet' : 'Handout preview'}
        {' · '}chronological itinerary · blank fields omitted
      </p>

      <section
        className="bg-slate-800/40 border border-slate-700 rounded-xl p-5"
        data-testid="worksheet-chrono-header"
      >
        <div className="text-[10px] font-semibold uppercase tracking-widest text-amber-400/80 mb-2">
          Run
        </div>
        {header.runName ? (
          <div className="text-white font-bold text-xl">{header.runName}</div>
        ) : null}
        {header.runCode ? (
          <div className="text-amber-400 font-mono text-sm mb-3">{header.runCode}</div>
        ) : null}
        <Meta label="Region" value={header.region} />
        <Meta label="People" value={header.people} />
        <Meta label="Dates" value={header.dateSpan} />
        <Meta label="Venues" value={header.venues.join(' · ')} />
        {header.synopsis ? (
          <div className="mt-3 pt-3 border-t border-slate-700">
            <div className="text-slate-500 text-xs mb-1">Synopsis</div>
            <p className="text-slate-300 text-sm whitespace-pre-wrap">{header.synopsis}</p>
          </div>
        ) : null}
        {header.notes.length > 0 ? (
          <div className="mt-3 pt-3 border-t border-slate-700 space-y-0.5">
            {header.notes.map((note, index) => (
              <Meta key={`${note.label}-${index}`} label={note.label} value={note.value} />
            ))}
          </div>
        ) : null}
      </section>

      {days.length === 0 ? (
        <p className="text-slate-600 text-xs italic" data-testid="worksheet-chrono-empty">
          No itinerary items yet.
        </p>
      ) : (
        days.map(day => (
          <section
            key={day.date ?? 'undated'}
            className="bg-slate-800/40 border border-slate-700 rounded-xl p-5"
            data-testid="worksheet-chrono-day"
            data-date={day.date ?? ''}
          >
            <h3 className="text-slate-300 text-xs font-semibold uppercase tracking-wider mb-3">
              {day.heading}
            </h3>
            <div className="space-y-3">
              {day.events.map(event => (
                <article
                  key={event.id}
                  className="rounded-lg border border-slate-700 bg-slate-900/40 p-3"
                  data-testid="worksheet-chrono-event"
                  data-kind={event.kind}
                >
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-400/80">
                      {event.kindLabel}
                    </span>
                    {event.timeLabel ? (
                      <span className="text-slate-400 text-xs font-mono">{event.timeLabel}</span>
                    ) : null}
                  </div>
                  <div className="text-slate-200 text-sm font-semibold mt-0.5">{event.title}</div>
                  {event.fields.length > 0 ? (
                    <div className="mt-1 space-y-0.5" data-testid="worksheet-chrono-fields">
                      {event.fields.map((field, index) => (
                        <div key={`${field.label}-${index}`} className="flex gap-2 text-sm py-0.5">
                          <span className="text-slate-500 w-28 flex-shrink-0">{field.label}</span>
                          <span className="text-slate-200 whitespace-pre-wrap">{field.value}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  if (!value.trim()) return null
  return (
    <div className="flex gap-2 text-sm py-0.5" data-testid="worksheet-chrono-meta">
      <span className="text-slate-500 w-28 flex-shrink-0">{label}</span>
      <span className="text-slate-200 whitespace-pre-wrap">{value}</span>
    </div>
  )
}

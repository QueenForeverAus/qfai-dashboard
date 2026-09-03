'use client'

import { useProfile } from '@/lib/profile-context'

const ROLES = [
  { key: 'production', label: 'Production', color: '#60a5fa' },
  { key: 'crew',       label: 'Crew',       color: '#94a3b8' },
  { key: 'external',   label: 'External',   color: '#f87171' },
]

const ROLE_LABEL: Record<string, string> = {
  production: 'Production',
  crew:       'Crew',
  external:   'External',
}

export default function ViewAsBar() {
  const { profile, viewAs, setViewAs } = useProfile()

  if (profile?.role !== 'admin') return null

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 text-xs overflow-x-auto"
      style={{
        background: viewAs ? '#1a0a2e' : '#0f1629',
        borderTop: `1px solid ${viewAs ? '#7c3aed' : '#1e293b'}`,
      }}
    >
      <span style={{ color: viewAs ? '#a78bfa' : '#475569' }} className="font-semibold shrink-0 whitespace-nowrap">
        {viewAs ? `👁 Previewing as ${ROLE_LABEL[viewAs]}` : '🛡 Admin view'}
      </span>

      <span style={{ color: '#334155' }} className="shrink-0 hidden xs:inline sm:inline">·</span>
      <span style={{ color: '#475569' }} className="shrink-0 whitespace-nowrap">Preview as:</span>

      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        {ROLES.map(r => (
          <button
            key={r.key}
            onClick={() => setViewAs(viewAs === r.key ? null : r.key)}
            className="px-2 sm:px-2.5 py-1 rounded font-medium transition-all whitespace-nowrap"
            style={{
              background: viewAs === r.key ? r.color + '30' : 'transparent',
              border: `1px solid ${viewAs === r.key ? r.color : '#334155'}`,
              color: viewAs === r.key ? r.color : '#64748b',
            }}
          >
            {r.label}
          </button>
        ))}
      </div>

      {viewAs && (
        <button
          onClick={() => setViewAs(null)}
          className="ml-auto shrink-0 px-2.5 py-1 rounded font-medium transition-all whitespace-nowrap"
          style={{ border: '1px solid #334155', color: '#64748b' }}
        >
          ✕ Exit preview
        </button>
      )}
    </div>
  )
}

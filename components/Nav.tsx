'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const links = [
  { href: '/', label: 'Mission Control' },
  { href: '/calculator', label: 'Run Calculator' },
  { href: '/emails', label: 'Email Drafts' },
  { href: '/settlement', label: 'Settlement Checker' },
]

export default function Nav() {
  const path = usePathname()
  return (
    <nav style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }} className="px-4 py-0">
      <div className="max-w-7xl mx-auto flex items-center gap-8">
        <div className="py-4 flex items-center gap-3">
          <span className="text-lg font-bold tracking-tight" style={{ color: 'var(--gold)' }}>🎩 QFAI</span>
          <span style={{ color: 'var(--muted)' }} className="text-sm hidden md:block">Queen Forever AI</span>
        </div>
        <div className="flex items-center gap-1">
          {links.map(l => (
            <Link
              key={l.href}
              href={l.href}
              className="px-4 py-4 text-sm font-medium transition-colors"
              style={{
                color: path === l.href ? 'var(--gold)' : 'var(--muted)',
                borderBottom: path === l.href ? '2px solid var(--gold)' : '2px solid transparent',
              }}
            >
              {l.label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  )
}

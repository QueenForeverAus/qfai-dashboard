'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useProfile, canAccessPage } from '@/lib/profile-context'

const navItems = [
  { href: '/',           label: 'Mission Control', icon: '⚡' },
  { href: '/runs',       label: 'Runs',            icon: '🎸' },
  { href: '/emails',     label: 'Drafts',          icon: '✉️' },
  { href: '/settlement', label: 'Settlement',       icon: '💰' },
  { href: '/factors',    label: 'Factors',          icon: '⚙' },
  { href: '/feedback',   label: 'Feedback',         icon: '💬' },
  { href: '/admin',      label: 'Admin',            icon: '🛠' },
  { href: '/settings',   label: 'Settings',         icon: '🔑' },
]

function HamburgerIcon({ open }: { open: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" className="text-white">
      {open ? (
        <>
          <line x1="4" y1="4" x2="18" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <line x1="18" y1="4" x2="4" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </>
      ) : (
        <>
          <line x1="3" y1="6" x2="19" y2="6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <line x1="3" y1="11" x2="19" y2="11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <line x1="3" y1="16" x2="19" y2="16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </>
      )}
    </svg>
  )
}

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { effectiveRole } = useProfile()
  const [mobileOpen, setMobileOpen] = useState(false)

  const visibleItems = navItems.filter(item => canAccessPage(effectiveRole, item.href))

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <>
      {/* ── Desktop sidebar ── */}
      <aside className="hidden md:flex w-56 bg-slate-900 border-r border-slate-700 flex-col h-full sticky top-0">
        <div className="p-4 border-b border-slate-700">
          <div className="flex items-center gap-2">
            <span className="text-amber-400 text-xl">♛</span>
            <div>
              <div className="text-white text-sm font-bold leading-tight">Queen Forever</div>
              <div className="text-slate-400 text-xs">Tours Portal</div>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {visibleItems.map((item) => {
            const active = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href))
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                  active
                    ? 'bg-amber-400/10 text-amber-400 font-medium'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                <span>{item.icon}</span>
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="p-3 border-t border-slate-700">
          <button
            onClick={handleSignOut}
            className="w-full text-left flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <span>🚪</span>
            Sign out
          </button>
        </div>
      </aside>

      {/* ── Mobile top bar (always visible) ── */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 h-12 bg-slate-900 border-b border-slate-700 flex items-center px-3 gap-3">
        <button
          onClick={() => setMobileOpen(v => !v)}
          className="p-2 -ml-1 rounded-lg hover:bg-slate-800 transition-colors"
          aria-label="Menu"
        >
          <HamburgerIcon open={mobileOpen} />
        </button>
        <div className="flex items-center gap-2">
          <span className="text-amber-400 text-lg">♛</span>
          <span className="text-white text-sm font-bold">Queen Forever</span>
          <span className="text-slate-500 text-xs">Tours Portal</span>
        </div>
      </div>

      {/* ── Mobile full-screen menu overlay ── */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 bg-slate-900 flex flex-col">
          {/* Header row with hamburger (now × to close) */}
          <div className="h-12 flex items-center px-3 border-b border-slate-700 flex-shrink-0">
            <button
              onClick={() => setMobileOpen(false)}
              className="p-2 -ml-1 rounded-lg hover:bg-slate-800 transition-colors"
              aria-label="Close menu"
            >
              <HamburgerIcon open={true} />
            </button>
            <div className="ml-3 flex items-center gap-2">
              <span className="text-amber-400 text-lg">♛</span>
              <span className="text-white text-sm font-bold">Queen Forever</span>
            </div>
          </div>

          {/* Nav items — big touch targets, fill the screen */}
          <nav className="flex-1 flex flex-col overflow-y-auto p-4 gap-1">
            {visibleItems.map((item) => {
              const active = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href))
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-4 px-5 py-5 rounded-xl text-lg font-medium transition-colors ${
                    active
                      ? 'bg-amber-400/10 text-amber-400'
                      : 'text-slate-200 hover:bg-slate-800 active:bg-slate-700'
                  }`}
                >
                  <span className="text-2xl">{item.icon}</span>
                  {item.label}
                </Link>
              )
            })}
          </nav>

          {/* Sign out at bottom */}
          <div className="p-4 border-t border-slate-700 flex-shrink-0">
            <button
              onClick={handleSignOut}
              className="w-full flex items-center gap-4 px-5 py-5 rounded-xl text-lg font-medium text-slate-400 hover:text-white hover:bg-slate-800 active:bg-slate-700 transition-colors"
            >
              <span className="text-2xl">🚪</span>
              Sign out
            </button>
          </div>
        </div>
      )}
    </>
  )
}

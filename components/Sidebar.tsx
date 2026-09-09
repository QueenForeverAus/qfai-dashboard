'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useProfile, canAccessPage } from '@/lib/profile-context'
import {
  TOUR_DESK_NAV_CHILDREN,
  TOUR_DESK_NAV_HEADING,
  isTourDeskChildActive,
} from '@/lib/tour-desk-nav'

type NavLeaf = { href: string; label: string; icon: string }
type NavGroup = { label: string; icon: string; children: ReadonlyArray<{ href: string; label: string }> }
type NavItem = NavLeaf | NavGroup

const navItems: NavItem[] = [
  { href: '/',           label: 'Mission Control', icon: '⚡' },
  {
    label: TOUR_DESK_NAV_HEADING,
    icon: '🎸',
    children: TOUR_DESK_NAV_CHILDREN,
  },
  { href: '/factors',    label: 'Factors',          icon: '⚙' },
  { href: '/feedback',   label: 'Feedback',         icon: '💬' },
  { href: '/admin',      label: 'Admin',            icon: '🛠' },
  { href: '/settings',   label: 'Profile',          icon: '👤' },
]

function isGroup(item: NavItem): item is NavGroup {
  return 'children' in item
}

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

function leafActive(pathname: string, href: string) {
  return pathname === href || (href !== '/' && pathname.startsWith(href))
}

function childClass(active: boolean, mobile: boolean) {
  if (mobile) {
    return `flex items-center gap-4 px-5 py-4 rounded-xl text-lg font-medium transition-colors ${
      active ? 'bg-amber-400/10 text-amber-400' : 'text-slate-200 hover:bg-slate-800 active:bg-slate-700'
    }`
  }
  return `flex items-center gap-2.5 pl-8 pr-3 py-2 rounded-lg text-sm transition-colors ${
    active
      ? 'bg-amber-400/10 text-amber-400 font-medium'
      : 'text-slate-400 hover:text-white hover:bg-slate-800'
  }`
}

function leafClass(active: boolean, mobile: boolean) {
  if (mobile) {
    return `flex items-center gap-4 px-5 py-5 rounded-xl text-lg font-medium transition-colors ${
      active ? 'bg-amber-400/10 text-amber-400' : 'text-slate-200 hover:bg-slate-800 active:bg-slate-700'
    }`
  }
  return `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
    active
      ? 'bg-amber-400/10 text-amber-400 font-medium'
      : 'text-slate-400 hover:text-white hover:bg-slate-800'
  }`
}

export default function Sidebar() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const router = useRouter()
  const { effectiveRole } = useProfile()
  const [mobileOpen, setMobileOpen] = useState(false)
  const tab = searchParams.get('tab')

  const visibleItems = navItems.filter(item => {
    if (isGroup(item)) {
      return item.children.some(child => canAccessPage(effectiveRole, child.href))
    }
    return canAccessPage(effectiveRole, item.href)
  })

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  function renderItems(mobile: boolean) {
    return visibleItems.map((item) => {
      if (isGroup(item)) {
        const visibleChildren = item.children.filter(child => canAccessPage(effectiveRole, child.href))
        if (visibleChildren.length === 0) return null
        return (
          <div key={item.label} role="group" aria-label={item.label} className={mobile ? 'py-1' : 'pt-1 pb-0.5'}>
            <div
              className={
                mobile
                  ? 'flex items-center gap-4 px-5 pt-4 pb-1 text-xs font-semibold tracking-widest uppercase text-slate-500'
                  : 'flex items-center gap-2.5 px-3 pt-2 pb-1 text-[10px] font-semibold tracking-widest uppercase text-slate-500'
              }
            >
              <span className={mobile ? 'text-2xl' : undefined} aria-hidden>{item.icon}</span>
              {item.label}
            </div>
            <div className={mobile ? 'flex flex-col gap-1' : 'space-y-0.5'}>
              {visibleChildren.map(child => {
                const active = isTourDeskChildActive({ href: child.href, pathname, tab })
                return (
                  <Link
                    key={child.href}
                    href={child.href}
                    onClick={mobile ? () => setMobileOpen(false) : undefined}
                    className={childClass(active, mobile)}
                  >
                    {child.label}
                  </Link>
                )
              })}
            </div>
          </div>
        )
      }

      const active = leafActive(pathname, item.href)
      return (
        <Link
          key={item.href}
          href={item.href}
          onClick={mobile ? () => setMobileOpen(false) : undefined}
          className={leafClass(active, mobile)}
        >
          <span className={mobile ? 'text-2xl' : undefined}>{item.icon}</span>
          {item.label}
        </Link>
      )
    })
  }

  return (
    <>
      {/* ── Desktop sidebar ── */}
      <aside className="hidden md:flex w-56 bg-slate-900 border-r border-slate-700 flex-col h-full sticky top-0">
        <div className="px-4 pt-5 pb-4 border-b border-slate-700">
          <Image src="/qf-logo.png" alt="Queen Forever" width={176} height={54} className="object-contain w-full" priority />
          <div className="mt-2.5 flex items-center gap-2">
            <div className="flex-1 h-px bg-slate-700" />
            <span className="text-slate-500 text-[10px] font-semibold tracking-widest uppercase">Tours Portal</span>
            <div className="flex-1 h-px bg-slate-700" />
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {renderItems(false)}
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
        <Image src="/qf-logo.png" alt="Queen Forever" width={120} height={36} className="object-contain" priority />
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
            <div className="ml-3">
              <Image src="/qf-logo.png" alt="Queen Forever" width={120} height={36} className="object-contain" priority />
            </div>
          </div>

          {/* Nav items — big touch targets, fill the screen */}
          <nav className="flex-1 flex flex-col overflow-y-auto p-4 gap-1">
            {renderItems(true)}
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

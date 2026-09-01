'use client'

import { createContext, useContext, useState, useEffect } from 'react'

export type Profile = { id: string; full_name: string; email: string; role: string }

type ProfileContextType = {
  profile: Profile | null
  effectiveRole: string
  viewAs: string | null
  isLoading: boolean
  setViewAs: (role: string | null) => void
}

const ProfileContext = createContext<ProfileContextType>({
  profile: null,
  effectiveRole: 'external',
  viewAs: null,
  isLoading: true,
  setViewAs: () => {},
})

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [viewAs, setViewAsState] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    sessionStorage.removeItem('qfai_viewAs')
    fetch('/api/me')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        setProfile(data as Profile | null)
        setIsLoading(false)
      })
      .catch(() => setIsLoading(false))
  }, [])

  function setViewAs(role: string | null) {
    setViewAsState(role)
  }

  const effectiveRole = isLoading ? 'admin' : (viewAs ?? profile?.role ?? 'external')

  return (
    <ProfileContext.Provider value={{ profile, effectiveRole, viewAs, isLoading, setViewAs }}>
      {children}
    </ProfileContext.Provider>
  )
}

export function useProfile() {
  return useContext(ProfileContext)
}

// What each role can access
export const ROLE_ACCESS: Record<string, { pages: string[]; tabs: string[] }> = {
  admin:      { pages: ['/', '/runs', '/emails', '/settlement', '/feedback', '/admin', '/factors', '/settings'], tabs: ['costs', 'overview', 'audit'] },
  owner:      { pages: ['/', '/runs', '/emails', '/settlement', '/feedback', '/factors', '/settings'],           tabs: ['costs', 'overview', 'audit'] },
  production: { pages: ['/runs', '/feedback', '/settings'],                                         tabs: ['costs'] },
  crew:       { pages: ['/runs', '/feedback', '/settings'],                                         tabs: [] },
  external:   { pages: ['/feedback', '/settings'],                                                  tabs: [] },
}

export function canAccessPage(role: string, page: string): boolean {
  const access = ROLE_ACCESS[role as keyof typeof ROLE_ACCESS] ?? ROLE_ACCESS.external
  return access.pages.some(p => page === p || (p !== '/' && page.startsWith(p)))
}

export function canAccessTab(role: string, tab: string): boolean {
  const access = ROLE_ACCESS[role as keyof typeof ROLE_ACCESS] ?? ROLE_ACCESS.external
  return access.tabs.includes(tab)
}

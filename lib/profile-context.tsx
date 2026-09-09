'use client'

import { createContext, useContext, useState, useEffect } from 'react'

export type Profile = { id: string; full_name: string; email: string; role: string }

type ProfileContextType = {
  profile: Profile | null
  effectiveRole: string
  viewAs: string | null
  isLoading: boolean
  setViewAs: (role: string | null) => void
  refreshProfile: () => Promise<void>
}

const ProfileContext = createContext<ProfileContextType>({
  profile: null,
  effectiveRole: 'external',
  viewAs: null,
  isLoading: true,
  setViewAs: () => {},
  refreshProfile: async () => {},
})

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [viewAs, setViewAsState] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  async function loadProfile() {
    try {
      const res = await fetch('/api/me')
      const data = res.ok ? await res.json() : null
      setProfile(data as Profile | null)
    } catch {
      setProfile(null)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    sessionStorage.removeItem('qfai_viewAs')
    void loadProfile()
  }, [])

  function setViewAs(role: string | null) {
    setViewAsState(role)
  }

  const effectiveRole = isLoading ? 'admin' : (viewAs ?? profile?.role ?? 'external')

  return (
    <ProfileContext.Provider value={{ profile, effectiveRole, viewAs, isLoading, setViewAs, refreshProfile: loadProfile }}>
      {children}
    </ProfileContext.Provider>
  )
}

export function useProfile() {
  return useContext(ProfileContext)
}

export { ROLE_ACCESS, canAccessPage, canAccessTab } from '@/lib/role-access'

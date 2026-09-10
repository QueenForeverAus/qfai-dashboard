'use client'

import { Suspense } from 'react'
import { usePathname } from 'next/navigation'
import Sidebar from './Sidebar'
import ViewAsBar from './ViewAsBar'
import { ProfileProvider } from '@/lib/profile-context'

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isBareAuth = pathname === '/login' || pathname.startsWith('/update-password')

  if (isBareAuth) return <>{children}</>

  return (
    <ProfileProvider>
      <div className="flex h-screen" style={{ paddingBottom: 44 }}>
        <Suspense fallback={<aside className="hidden md:flex w-56 bg-slate-900 border-r border-slate-700" />}>
          <Sidebar />
        </Suspense>
        <main className="flex-1 overflow-y-auto overflow-x-hidden bg-slate-900 pt-12 md:pt-0">
          {children}
        </main>
      </div>
      <ViewAsBar />
    </ProfileProvider>
  )
}

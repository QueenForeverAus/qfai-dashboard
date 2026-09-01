'use client'

import { usePathname } from 'next/navigation'
import Sidebar from './Sidebar'
import ViewAsBar from './ViewAsBar'
import { ProfileProvider } from '@/lib/profile-context'

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isLogin = pathname === '/login'

  if (isLogin) return <>{children}</>

  return (
    <ProfileProvider>
      <div className="flex h-screen" style={{ paddingBottom: 44 }}>
        <Sidebar />
        <main className="flex-1 overflow-y-auto bg-slate-900 pt-12 md:pt-0">
          {children}
        </main>
      </div>
      <ViewAsBar />
    </ProfileProvider>
  )
}

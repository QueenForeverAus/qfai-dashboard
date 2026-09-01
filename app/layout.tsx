import type { Metadata } from 'next'
import './globals.css'
import ClientLayout from '@/components/ClientLayout'

export const metadata: Metadata = {
  title: 'Queen Forever Tours',
  description: 'Tour Management Portal — Queen Forever',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-900">
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  )
}

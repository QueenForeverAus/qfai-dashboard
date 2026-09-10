import { createAdminClient } from '@/lib/supabase/server-admin'
import { getAdminOwnerActor } from '@/lib/admin-access'
import type { TourRow } from '@/lib/tours'
import { loadPortalSettings } from '@/lib/portal-settings'
import AdminSettingsClient from './AdminSettingsClient'

export const dynamic = 'force-dynamic'

export default async function AdminSettingsPage() {
  const actor = await getAdminOwnerActor()
  if (!actor) {
    return (
      <div className="p-6">
        <h1 className="text-white text-2xl font-bold mb-2">Settings</h1>
        <p className="text-slate-400 text-sm">Settings is available to admin and owner only.</p>
      </div>
    )
  }

  const supabase = createAdminClient()
  const [{ data: tours }, portalSettings] = await Promise.all([
    supabase
      .from('tours')
      .select('id, name, date_from, date_to, sort_order, created_at, updated_at')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true }),
    loadPortalSettings(supabase),
  ])

  return (
    <AdminSettingsClient
      initialTours={(tours ?? []) as TourRow[]}
      initialSettings={portalSettings}
    />
  )
}

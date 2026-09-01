import { createAdminClient } from '@/lib/supabase/server-admin'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import FactorsClient from './FactorsClient'

export const dynamic = 'force-dynamic'

export default async function FactorsPage() {
  // Use cookie-aware client for auth check (admin client can't read session cookies)
  const userClient = await createClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) redirect('/login')

  // Use admin client for data access (bypasses RLS)
  const supabase = createAdminClient()

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || !['owner', 'admin'].includes(profile.role)) {
    redirect('/runs')
  }

  const { data: factors } = await supabase
    .from('run_factors')
    .select('*')
    .order('category')
    .order('label')

  return (
    <div className="min-h-screen bg-slate-900 px-4 py-8 max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Factors</h1>
        <p className="text-slate-400 text-sm mt-1">
          Rule inputs that flow through to all ESTIMATE fields across every run. Edit a value here and it cascades automatically to any run that uses that factor.
        </p>
        <p className="text-amber-400/70 text-xs mt-2">
          Owner-only — not visible to crew or production.
        </p>
      </div>

      <FactorsClient initialFactors={factors ?? []} />
    </div>
  )
}

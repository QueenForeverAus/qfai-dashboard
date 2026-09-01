import { createClient as createSupabaseClient } from '@supabase/supabase-js'

// Service role client for server-side reads — bypasses RLS.
// Never expose this to the browser.
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

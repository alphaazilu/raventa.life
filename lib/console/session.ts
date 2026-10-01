import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

// The signed-in person for this request, looked up once. The console's
// layout, page and server data all need it; without this each asked
// Supabase again (≈ one round trip each), which made every tap slow.
export const getConsoleSession = cache(async () => {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { supabase, user: null, role: null as string | null, firstName: null as string | null }
  const { data: me } = await supabase.from('profiles').select('role, first_name').eq('id', user.id).maybeSingle()
  return { supabase, user, role: (me?.role as string | null) ?? null, firstName: (me?.first_name as string | null) ?? null }
})

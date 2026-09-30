import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { ConsoleDashboard } from '@/components/console/console-dashboard'
import { createClient } from '@/lib/supabase/server'
import { CONSOLE_PATH, DESK_PATH, isAdmin } from '@/lib/auth/roles'
import { loadDashboard } from './dashboard-data'

export const metadata: Metadata = {
  title: 'ภาพรวม | RAVENTA Back Office',
}

export const dynamic = 'force-dynamic'

// Back Office home: today at a glance + one card per area. Admins only —
// staff land on the front desk.
export default async function ConsolePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/login?next=${CONSOLE_PATH}`)

  const { data: me } = await supabase.from('profiles').select('role, first_name').eq('id', user.id).maybeSingle()
  if (!isAdmin(me?.role)) redirect(DESK_PATH)

  const data = await loadDashboard()
  return (
    <main>
      <ConsoleDashboard firstName={me?.first_name ?? null} data={data} />
    </main>
  )
}

import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { CheckInDesk } from '@/components/admin/check-in-desk'
import { createClient } from '@/lib/supabase/server'
import { canUseDesk, isAdmin } from '@/lib/auth/roles'
import { getFloor } from './actions'

export const metadata: Metadata = {
  title: 'Check-in | RAVENTA Wellness Center',
}

// Full-screen tool for the counter tablet — no site header/footer.
export default async function CheckInPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/admin/check-in')

  const { data: me } = await supabase.from('profiles').select('role, first_name').eq('id', user.id).maybeSingle()
  if (!canUseDesk(me?.role)) redirect('/account')

  const floor = await getFloor()

  return (
    <main className="min-h-dvh bg-background">
      <CheckInDesk
        staffName={me?.first_name || user.email || ''}
        isAdmin={isAdmin(me?.role)}
        initialFloor={floor.ok ? floor.data : null}
        initialError={floor.ok ? null : floor.error}
      />
    </main>
  )
}

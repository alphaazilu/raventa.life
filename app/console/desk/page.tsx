import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { CheckInDesk } from '@/components/admin/check-in-desk'
import { createClient } from '@/lib/supabase/server'
import { canUseDesk, DESK_PATH, isAdmin } from '@/lib/auth/roles'
import { getFloor } from './actions'

export const metadata: Metadata = {
  title: 'ขาย + เช็คอิน | RAVENTA Back Office',
}

// Sell + check in — the counter tablet's main screen.
export default async function DeskPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/login?next=${DESK_PATH}`)

  const { data: me } = await supabase.from('profiles').select('role, first_name').eq('id', user.id).maybeSingle()
  if (!canUseDesk(me?.role)) redirect('/account')

  const floor = await getFloor()

  return (
    <main>
      <CheckInDesk
        staffName={me?.first_name || user.email || ''}
        showTakings={isAdmin(me?.role)}
        initialFloor={floor.ok ? floor.data : null}
        initialError={floor.ok ? null : floor.error}
      />
    </main>
  )
}

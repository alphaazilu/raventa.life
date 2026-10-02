import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { CheckInDesk } from '@/components/admin/check-in-desk'
import { getConsoleSession } from '@/lib/console/session'
import { canUseDesk, DESK_PATH, isAdmin } from '@/lib/auth/roles'
import { getDeskCatalog, getFloor } from './actions'

export const metadata: Metadata = {
  title: 'ขาย + เช็คอิน | RAVENTA Back Office',
}

// Sell + check in — the counter tablet's main screen.
export default async function DeskPage() {
  const { user, role } = await getConsoleSession()
  if (!user) redirect(`/login?next=${DESK_PATH}`)
  if (!canUseDesk(role)) redirect('/account')

  const [floor, catalog] = await Promise.all([getFloor(), getDeskCatalog()])

  return (
    <main>
      <CheckInDesk
        showTakings={isAdmin(role)}
        initialFloor={floor.ok ? floor.data : null}
        initialError={floor.ok ? null : floor.error}
        initialCatalog={catalog.ok ? catalog.data : null}
      />
    </main>
  )
}

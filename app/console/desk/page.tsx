import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { CheckInDesk } from '@/components/admin/check-in-desk'
import { getConsoleSession } from '@/lib/console/session'
import { canUseDesk, DESK_PATH, isAdmin } from '@/lib/auth/roles'
import { getDeskCatalog, getFloor } from './actions'
import { getCurrentDevice } from '@/lib/console/device'
import { deskAllowed } from '@/lib/console/settings'
import { DeskTabletOnly } from '@/components/console/desk-tablet-only'

export const metadata: Metadata = {
  title: 'ขาย + เช็คอิน | RAVENTA Back Office',
}

// Sell + check in — the counter tablet's main screen.
// ?view=floor opens the "In today" tab (e.g. Dashboard › Recent check-ins › See all).
export default async function DeskPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view } = await searchParams
  const { user, role } = await getConsoleSession()
  if (!user) redirect(`/login?next=${DESK_PATH}`)
  if (!canUseDesk(role)) redirect('/account')
  const onTablet = Boolean(await getCurrentDevice().catch(() => null))
  if (!(await deskAllowed({ userId: user.id, admin: isAdmin(role), onTablet }))) return <DeskTabletOnly />

  const [floor, catalog] = await Promise.all([getFloor(), getDeskCatalog()])

  return (
    <main>
      <CheckInDesk
        showTakings={isAdmin(role)}
        initialFloor={floor.ok ? floor.data : null}
        initialError={floor.ok ? null : floor.error}
        initialCatalog={catalog.ok ? catalog.data : null}
        initialView={view === 'floor' ? 'floor' : 'desk'}
      />
    </main>
  )
}

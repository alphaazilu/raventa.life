import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { CheckInDesk } from '@/components/admin/check-in-desk'
import { getConsoleSession } from '@/lib/console/session'
import { canUseDesk, DESK_PATH, isAccountant, isAdmin, REPORTS_PATH } from '@/lib/auth/roles'
import { getDeskCatalog, getFloor } from './actions'
import { getCurrentDevice } from '@/lib/console/device'
import { deskAllowed } from '@/lib/console/settings'
import { DeskTabletOnly } from '@/components/console/desk-tablet-only'
import { getCashRules, getCurrentSession } from '@/lib/console/cash'
import { loadDeskCommission } from '@/lib/console/commission'
import { getAppSettings } from '@/lib/console/settings'
import { getBrandInfo } from '@/lib/brand/settings'
import { backOfficeName } from '@/lib/brand/info'

export async function generateMetadata(): Promise<Metadata> {
  const brand = await getBrandInfo()
  return {
    title: `ขาย + เช็คอิน | ${backOfficeName(brand)}`,
  }
}

// Sell + check in — the counter tablet's main screen.
// ?tab=floor (or ?view=floor, before v0.30) opens the "In today" tab (e.g. Dashboard › Recent check-ins › See all).
export default async function DeskPage({ searchParams }: { searchParams: Promise<{ tab?: string; view?: string }> }) {
  const q = await searchParams
  const view = q.tab ?? q.view
  const { user, role } = await getConsoleSession()
  if (!user) redirect(`/login?next=${DESK_PATH}`)
  if (!canUseDesk(role)) redirect(isAccountant(role) ? REPORTS_PATH : '/account')
  const onTablet = Boolean(await getCurrentDevice().catch(() => null))
  if (!(await deskAllowed({ userId: user.id, admin: isAdmin(role), onTablet }))) return <DeskTabletOnly />

  const [floor, catalog, cash, drawer, commission, settings] = await Promise.all([
    getFloor(),
    getDeskCatalog(),
    getCashRules(),
    getCurrentSession().catch(() => undefined),
    loadDeskCommission(user.id),
    getAppSettings(),
  ])
  // Cash taken with no drawer open isn't in any shift close (§30, v0.31).
  const drawerWarn = cash.setUp && drawer !== undefined && drawer?.status !== 'open'

  return (
    <main>
      <CheckInDesk
        showTakings={isAdmin(role)}
        initialFloor={floor.ok ? floor.data : null}
        initialError={floor.ok ? null : floor.error}
        initialCatalog={catalog.ok ? catalog.data : null}
        initialView={view === 'floor' ? 'floor' : 'desk'}
        drawerWarn={drawerWarn}
        commission={commission}
        capacity={settings.floorCapacity}
      />
    </main>
  )
}

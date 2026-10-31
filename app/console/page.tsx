import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { ConsoleDashboard } from '@/components/console/console-dashboard'
import { getConsoleSession } from '@/lib/console/session'
import { CONSOLE_PATH } from '@/lib/auth/roles'
import { can, effectivePermissions } from '@/lib/auth/permissions'
import { consoleHomeFor } from '@/lib/auth/permission-catalog'
import { loadDashboard } from './dashboard-data'
import { loadAlerts } from '@/lib/console/alerts'
import { getAppSettings } from '@/lib/console/settings'
import { getBrandInfo } from '@/lib/brand/settings'
import { backOfficeName } from '@/lib/brand/info'

export async function generateMetadata(): Promise<Metadata> {
  const brand = await getBrandInfo()
  return {
    title: `ภาพรวม | ${backOfficeName(brand)}`,
  }
}

export const dynamic = 'force-dynamic'

// Back Office home: today at a glance, what needs doing (v0.30), and one
// card per area. Admins only —
// staff land on the front desk.
export default async function ConsolePage() {
  const { user, firstName } = await getConsoleSession()
  if (!user) redirect(`/login?next=${CONSOLE_PATH}`)
  if (!(await can(user.id, 'access:overview'))) redirect(consoleHomeFor(await effectivePermissions(user.id)))

  const [data, alerts, settings] = await Promise.all([loadDashboard(), loadAlerts(), getAppSettings()])
  return (
    <main>
      <ConsoleDashboard firstName={firstName} data={data} alerts={alerts} capacity={settings.floorCapacity} />
    </main>
  )
}

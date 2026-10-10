import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { ConsoleDashboard } from '@/components/console/console-dashboard'
import { getConsoleSession } from '@/lib/console/session'
import { CONSOLE_PATH, DESK_PATH, isAdmin } from '@/lib/auth/roles'
import { loadDashboard } from './dashboard-data'
import { loadAlerts } from '@/lib/console/alerts'

export const metadata: Metadata = {
  title: 'ภาพรวม | RAVENTA Back Office',
}

export const dynamic = 'force-dynamic'

// Back Office home: today at a glance, what needs doing (v0.30), and one
// card per area. Admins only —
// staff land on the front desk.
export default async function ConsolePage() {
  const { user, role, firstName } = await getConsoleSession()
  if (!user) redirect(`/login?next=${CONSOLE_PATH}`)
  if (!isAdmin(role)) redirect(DESK_PATH)

  const [data, alerts] = await Promise.all([loadDashboard(), loadAlerts()])
  return (
    <main>
      <ConsoleDashboard firstName={firstName} data={data} alerts={alerts} />
    </main>
  )
}

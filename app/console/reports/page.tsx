import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getConsoleSession } from '@/lib/console/session'
import { DESK_PATH, isAdmin, REPORTS_PATH } from '@/lib/auth/roles'
import { loadSalesReport } from '@/lib/console/reports'
import { resolvePeriod } from '@/lib/console/report-period'
import { resolveTimePeriod } from '@/lib/console/time-period'
import { loadTimeReport } from '@/lib/console/time-report'
import { getAppSettings } from '@/lib/console/settings'
import { ReportView } from '@/components/console/report-view'
import { TimeReportView } from '@/components/console/time-report-view'

export const metadata: Metadata = {
  title: 'รายงาน | RAVENTA Back Office',
}

export const dynamic = 'force-dynamic'

// Back Office › Reports. Admins only.
// Sales (default): one period's sales, split the ways the accounts are
// checked — by payment (cash drawer, bank, card machine), by kind of sale
// (revenue lines), packages paid in advance, visits, and an audit of receipt
// numbers and voided bills.
// Time (?tab=time, v0.28; ?r=time before v0.30): clock entries per person against their shifts,
// leave and holidays, for pay — monthly and daily staff apart.
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; r?: string; p?: string; from?: string; to?: string; pay?: string }>
}) {
  const { user, role } = await getConsoleSession()
  if (!user) redirect(`/login?next=${REPORTS_PATH}`)
  if (!isAdmin(role)) redirect(DESK_PATH)
  const q = await searchParams

  if (q.tab === 'time' || q.r === 'time') {
    const settings = await getAppSettings()
    const period = resolveTimePeriod(q, settings.pay)
    const report = await loadTimeReport(period.from, period.to).catch((err: Error) => {
      console.error('time report failed', err.message)
      return null
    })
    return (
      <main>
        <TimeReportView period={period} report={report} paySetUp={report ? report.paySetUp : settings.paySetUp} />
      </main>
    )
  }

  const period = resolvePeriod(q)
  const report = await loadSalesReport(period.from, period.to).catch((err: Error) => {
    console.error('sales report failed', err.message)
    return null
  })
  return (
    <main>
      <ReportView period={period} report={report} />
    </main>
  )
}

import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getConsoleSession } from '@/lib/console/session'
import { canUseDesk, canViewReports, DESK_PATH, isAdmin, REPORTS_PATH } from '@/lib/auth/roles'
import { loadSalesReport } from '@/lib/console/reports'
import { resolvePeriod } from '@/lib/console/report-period'
import { resolveTimePeriod } from '@/lib/console/time-period'
import { loadTimeReport } from '@/lib/console/time-report'
import { getAppSettings } from '@/lib/console/settings'
import { ReportView } from '@/components/console/report-view'
import { TimeReportView } from '@/components/console/time-report-view'
import { CommissionReportView } from '@/components/console/commission-report-view'
import { loadCommissionReport } from '@/lib/console/commission'
import { BRAND } from '@/lib/brand/config'

export const metadata: Metadata = {
  title: `รายงาน | ${BRAND.backOfficeName}`,
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
  if (!canViewReports(role)) redirect(canUseDesk(role) ? DESK_PATH : '/account')
  const q = await searchParams
  // Time and commission are payroll — admins only. An accountant who lands on
  // those tabs is sent back to the sales report.
  if (!isAdmin(role) && (q.tab === 'time' || q.tab === 'commission' || q.r === 'time')) redirect(REPORTS_PATH)

  // Commission (?tab=commission, v0.34): per person, from the bills' kept amounts.
  if (q.tab === 'commission') {
    const settings = await getAppSettings()
    const period = resolveTimePeriod({ ...q, pay: 'monthly' }, settings.pay)
    const people = await loadCommissionReport(period.from, period.to)
      .then((r) => r ?? ('not_set_up' as const))
      .catch((err: Error) => {
        console.error('commission report failed', err.message)
        return null
      })
    return (
      <main>
        <CommissionReportView period={period} people={people} />
      </main>
    )
  }

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

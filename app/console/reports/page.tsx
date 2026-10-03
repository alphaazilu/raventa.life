import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getConsoleSession } from '@/lib/console/session'
import { DESK_PATH, isAdmin, REPORTS_PATH } from '@/lib/auth/roles'
import { loadSalesReport } from '@/lib/console/reports'
import { resolvePeriod } from '@/lib/console/report-period'
import { ReportView } from '@/components/console/report-view'

export const metadata: Metadata = {
  title: 'รายงานการขาย | RAVENTA Back Office',
}

export const dynamic = 'force-dynamic'

// Back Office › Reports: one period's sales, split the ways the accounts
// are checked — by payment (cash drawer, bank, card machine), by kind of
// sale (revenue lines), packages paid in advance, visits, and an audit of
// receipt numbers and voided bills. Admins only.
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string; from?: string; to?: string }>
}) {
  const { user, role } = await getConsoleSession()
  if (!user) redirect(`/login?next=${REPORTS_PATH}`)
  if (!isAdmin(role)) redirect(DESK_PATH)

  const period = resolvePeriod(await searchParams)
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

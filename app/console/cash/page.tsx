import { addDays } from '@/lib/date'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getConsoleSession } from '@/lib/console/session'
import { getCurrentDevice } from '@/lib/console/device'
import { deskAllowed } from '@/lib/console/settings'
import { CASH_PATH, canUseDesk, isAdmin } from '@/lib/auth/roles'
import { bangkokToday } from '@/lib/check-in/day'
import { getCashRules, getCurrentSession, listSessions, mainBranchId } from '@/lib/console/cash'
import { dayBounds } from '@/lib/console/checklist'
import type { CashSession } from '@/lib/cash'
import { CashView } from '@/components/console/cash-view'
import { DeskTabletOnly } from '@/components/console/desk-tablet-only'

export const metadata: Metadata = {
  title: 'ปิดกะ | RAVENTA Back Office',
}

export const dynamic = 'force-dynamic'

const ISO = /^\d{4}-\d{2}-\d{2}$/

// Staff never see what the drawer should hold or the day's takings (B7):
// after the count they get only the difference.
const forStaff = (s: CashSession): CashSession => ({ ...s, expected: null, cashIn: null, cashOut: null, transfer: null, card: null })

// Front desk › Shift close (§30, v0.31).
//   (default)     the drawer: open with the float → blind count → confirm
//   ?tab=history  admins: every drawer in a date range (?from&to), review, CSV
export default async function CashPage({ searchParams }: { searchParams: Promise<{ tab?: string; from?: string; to?: string }> }) {
  const { user, role } = await getConsoleSession()
  if (!user) redirect(`/login?next=${CASH_PATH}`)
  if (!canUseDesk(role)) redirect('/account')
  const admin = isAdmin(role)
  const device = await getCurrentDevice().catch(() => null)
  const onTablet = Boolean(device)
  if (!(await deskAllowed({ userId: user.id, admin, onTablet }))) return <DeskTabletOnly />

  const q = await searchParams
  const tab = admin && q.tab === 'history' ? 'history' : 'drawer'
  const today = bangkokToday()
  let from = q.from && ISO.test(q.from) ? q.from : addDays(today, -13)
  let to = q.to && ISO.test(q.to) ? q.to : today
  if (to < from) [from, to] = [to, from]
  if (addDays(from, 92) < to) to = addDays(from, 92)

  // The drawer this tablet shows is its own branch's (§47); off a tablet, the
  // admin sees the main branch's drawer.
  const branchId = device?.branchId ?? (await mainBranchId())
  const [rules, current, history] = await Promise.all([
    getCashRules(),
    getCurrentSession(branchId).catch(() => undefined),
    tab === 'history' ? listSessions(dayBounds(from).from, dayBounds(to).to).catch(() => null) : Promise.resolve(null),
  ])
  const setUp = rules.setUp && current !== undefined

  return (
    <main>
      <CashView
        tab={tab}
        admin={admin}
        setUp={setUp}
        rules={{ float: rules.float, alert: rules.alert }}
        current={current ? (admin ? current : forStaff(current)) : null}
        history={history ?? []}
        range={{ from, to }}
      />
    </main>
  )
}

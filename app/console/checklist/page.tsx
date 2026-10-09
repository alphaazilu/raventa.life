import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getConsoleSession } from '@/lib/console/session'
import { CHECKLIST_PATH, DESK_PATH, isAdmin } from '@/lib/auth/roles'
import { bangkokToday } from '@/lib/check-in/day'
import { dayBounds, listPoints, listRounds, listScans } from '@/lib/console/checklist'
import { listStaff } from '@/lib/console/time'
import { ChecklistAdmin, type ChecklistTab } from '@/components/console/checklist-admin'

export const metadata: Metadata = {
  title: 'เช็คลิสต์ | RAVENTA Back Office',
}

export const dynamic = 'force-dynamic'

const ISO = /^\d{4}-\d{2}-\d{2}$/
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)

// Back Office › Checklists (§29, v0.29). Admins only.
//   ?tab=board  today (or ?date=) — each round's windows, done / missed, problems
//   ?tab=log    every scan in a date range (?from&to, ?point, ?staff), CSV
//   ?tab=setup  check points (with their QR stickers) and rounds
export default async function ChecklistPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; date?: string; from?: string; to?: string; point?: string; staff?: string }>
}) {
  const { user, role } = await getConsoleSession()
  if (!user) redirect(`/login?next=${CHECKLIST_PATH}`)
  if (!isAdmin(role)) redirect(DESK_PATH)
  const q = await searchParams
  const tab: ChecklistTab = q.tab === 'log' || q.tab === 'setup' ? q.tab : 'board'
  const today = bangkokToday()

  const [points, rounds, staff] = await Promise.all([listPoints(), listRounds(), listStaff().catch(() => [])])
  const date = q.date && ISO.test(q.date) ? q.date : today
  let from = q.from && ISO.test(q.from) ? q.from : addDays(today, -6)
  let to = q.to && ISO.test(q.to) ? q.to : today
  if (to < from) [from, to] = [to, from]
  if (addDays(from, 92) < to) to = addDays(from, 92)

  let scans: Awaited<ReturnType<typeof listScans>> = []
  if (points !== null && tab !== 'setup') {
    const range = tab === 'board' ? dayBounds(date) : { from: dayBounds(from).from, to: dayBounds(to).to }
    scans = await listScans(range.from, range.to, {
      pointId: tab === 'log' && q.point ? q.point : undefined,
      staffId: tab === 'log' && q.staff ? q.staff : undefined,
      limit: tab === 'log' ? 1000 : 3000,
    })
  }

  return (
    <main>
      <ChecklistAdmin
        tab={tab}
        today={today}
        date={date}
        range={{ from, to, point: q.point ?? '', staff: q.staff ?? '' }}
        setUp={points !== null}
        points={points ?? []}
        rounds={rounds}
        scans={scans}
        staff={staff}
      />
    </main>
  )
}

import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getConsoleSession } from '@/lib/console/session'
import { CALENDAR_PATH, isAdmin } from '@/lib/auth/roles'
import { gatePage } from '@/lib/console/guard'
import { can } from '@/lib/auth/permissions'
import { bangkokToday } from '@/lib/check-in/day'
import { listItems, loadExtras, visibleOccurrences } from '@/lib/console/calendar'
import { listStaff } from '@/lib/console/time'
import { addDays } from '@/lib/calendar'
import { CalendarView } from '@/components/console/calendar-view'
import { getBrandInfo } from '@/lib/brand/settings'
import { backOfficeName } from '@/lib/brand/info'

export async function generateMetadata(): Promise<Metadata> {
  const brand = await getBrandInfo()
  return {
    title: `ปฏิทิน | ${backOfficeName(brand)}`,
  }
}

export const dynamic = 'force-dynamic'

// Team › Calendar (§31, v0.32).
//   ?month=YYYY-MM   the month shown (default: this month)
//   ?view=list       a plain list (default on phones is decided on screen)
// Admins see and edit everything (+ holidays, promotions, leave, who's on
// shift); staff (on the tablet) see team items and add team notes.
export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ month?: string; view?: string }> }) {
  const { user, role } = await getConsoleSession()
  if (!user) redirect(`/login?next=${CALENDAR_PATH}`)
  // RBAC 3b: ROUTE_RULES with the person's real roles (the middleware no longer checks per page).
  await gatePage(CALENDAR_PATH)
  if (!(await can(user.id, 'access:team.calendar'))) redirect('/account')
  const admin = isAdmin(role)
  const q = await searchParams
  const today = bangkokToday()
  const month = q.month && /^\d{4}-(0[1-9]|1[0-2])$/.test(q.month) ? q.month : today.slice(0, 7)
  const first = `${month}-01`
  // The grid runs Monday → Sunday, whole weeks.
  const dow = (new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7
  const from = addDays(first, -dow)
  const to = addDays(from, 41)

  const items = await listItems(from, to).catch(() => null)
  const viewer = { id: user.id, role: admin ? ('admin' as const) : ('staff' as const) }
  const [extras, staff] = await Promise.all([
    items === null ? Promise.resolve([]) : loadExtras(from, to).catch(() => []),
    admin ? listStaff().catch(() => []) : Promise.resolve([]),
  ])

  return (
    <main>
      <CalendarView
        setUp={items !== null}
        admin={admin}
        meId={user.id}
        today={today}
        month={month}
        range={{ from, to }}
        listView={q.view === 'list'}
        occurrences={items ? visibleOccurrences(items, viewer, from, to) : []}
        // Staff see holidays and promotions; leave and the roster stay with admins.
        extras={admin ? extras : extras.filter((e) => e.type === 'holiday' || e.type === 'promo')}
        staff={staff}
      />
    </main>
  )
}

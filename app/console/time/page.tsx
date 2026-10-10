import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { TimeView } from '@/components/console/time-view'
import { approvedLeaveBetween, checkLeaveDays, countPendingLeave, listLeaveForAdmin, pendingLeaveBetween, type LeaveDayCheck } from '@/lib/leave-server'
import type { LeaveRequest } from '@/lib/leave'
import { getConsoleSession } from '@/lib/console/session'
import { getCurrentDevice } from '@/lib/console/device'
import { addDays, getOpenEntry, listEntries, listOpenEntries, listStaff, weekStart } from '@/lib/console/time'
import { bangkokToday } from '@/lib/check-in/day'
import { DEFAULT_SETTINGS, getTimeSettings, listAssignments, listHolidays, listTemplates } from '@/lib/console/shifts'
import { canUseDesk, DESK_PATH, isAdmin, TIME_PATH } from '@/lib/auth/roles'

export const metadata: Metadata = {
  title: 'ลงเวลา | RAVENTA Back Office',
}

export const dynamic = 'force-dynamic'

// Back Office → Time clock (schema.sql §16).
// Staff: on a registered tablet only — their own status, "clock out", and
// their week. Admins: everyone's week, who's in now, fix or add entries.
export default async function TimePage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; tab?: string; view?: string; mode?: string; month?: string }>
}) {
  const { user, role } = await getConsoleSession()
  if (!user) redirect(`/login?next=${TIME_PATH}`)
  const admin = isAdmin(role)
  const device = await getCurrentDevice().catch(() => null)
  if (!admin && !(canUseDesk(role) && device)) redirect(DESK_PATH)

  const q = await searchParams
  const { week, mode, month: rawMonth } = q
  const rawView = q.tab ?? q.view // ?view= = links from before v0.30
  const view = admin && (rawView === 'roster' || rawView === 'shifts' || rawView === 'leave') ? rawView : 'entries'
  const start = weekStart(week && /^\d{4}-\d{2}-\d{2}$/.test(week) ? week : bangkokToday())
  const end = addDays(start, 7)

  try {
    const [mine, myWeek, entries, open, staff] = await Promise.all([
      getOpenEntry(user.id),
      listEntries(start, end, user.id),
      admin ? listEntries(start, end) : Promise.resolve([]),
      admin ? listOpenEntries() : Promise.resolve([]),
      admin ? listStaff() : Promise.resolve([]),
    ])
    // Shifts (§17) are optional: before that SQL is run the clock still works.
    const [templates, assignments, settings, pendingLeave] = await Promise.all([
      listTemplates().catch(() => null),
      listAssignments(start, end, admin ? undefined : user.id).catch(() => []),
      getTimeSettings().catch(() => DEFAULT_SETTINGS),
      admin ? countPendingLeave() : Promise.resolve(0),
    ])
    // Roster as a month (v0.25, the default): ?month=YYYY-MM, else the month
    // of ?week, else this month. ?mode=week keeps the weekly grid.
    let month: {
      start: string
      assignments: Awaited<ReturnType<typeof listAssignments>>
      approved: Awaited<ReturnType<typeof approvedLeaveBetween>>
      pending: Awaited<ReturnType<typeof pendingLeaveBetween>>
      holidays: { day: string; name: string }[]
    } | null = null
    if (admin && view === 'roster' && mode !== 'week' && templates !== null) {
      const ym = rawMonth && /^\d{4}-(0[1-9]|1[0-2])$/.test(rawMonth) ? rawMonth : (week && /^\d{4}-\d{2}-\d{2}$/.test(week) ? week : bangkokToday()).slice(0, 7)
      const mStart = `${ym}-01`
      const d = new Date(`${mStart}T00:00:00Z`)
      d.setUTCMonth(d.getUTCMonth() + 1)
      const mEnd = d.toISOString().slice(0, 10)
      const last = addDays(mEnd, -1)
      const [mAssign, approved, pending, holidays] = await Promise.all([
        listAssignments(mStart, mEnd).catch(() => []),
        approvedLeaveBetween(mStart, last),
        pendingLeaveBetween(mStart, last),
        listHolidays(mStart, mEnd),
      ])
      month = { start: mStart, assignments: mAssign, approved, pending, holidays }
    }
    // Leave requests (§25): only loaded on that tab.
    let leave: { pending: LeaveRequest[]; decided: LeaveRequest[]; checks: Record<string, LeaveDayCheck[]> } | null = null
    if (admin && view === 'leave') {
      const { pending, decided } = await listLeaveForAdmin()
      leave = { pending, decided, checks: await checkLeaveDays(pending, staff).catch(() => ({})) }
    }
    return (
      <main>
        <TimeView
          admin={admin}
          onTablet={Boolean(device)}
          weekStart={start}
          today={bangkokToday()}
          mine={mine}
          myWeek={myWeek}
          entries={entries}
          open={open}
          staff={staff}
          loadError={false}
          view={view}
          templates={templates ?? []}
          shiftsReady={templates !== null}
          assignments={assignments}
          settings={settings}
          pendingLeave={pendingLeave}
          leave={leave}
          month={month}
        />
      </main>
    )
  } catch (err) {
    console.error('time page failed', err)
    return (
      <main>
        <TimeView admin={admin} onTablet={Boolean(device)} weekStart={start} today={bangkokToday()} mine={null} myWeek={[]} entries={[]} open={[]} staff={[]} loadError view={view} templates={[]} shiftsReady={false} assignments={[]} settings={DEFAULT_SETTINGS} />
      </main>
    )
  }
}

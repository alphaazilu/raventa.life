import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { TimeView } from '@/components/console/time-view'
import { getConsoleSession } from '@/lib/console/session'
import { getCurrentDevice } from '@/lib/console/device'
import { addDays, getOpenEntry, listEntries, listOpenEntries, listStaff, weekStart } from '@/lib/console/time'
import { bangkokToday } from '@/lib/check-in/day'
import { DEFAULT_SETTINGS, getTimeSettings, listAssignments, listTemplates } from '@/lib/console/shifts'
import { canUseDesk, DESK_PATH, isAdmin, TIME_PATH } from '@/lib/auth/roles'

export const metadata: Metadata = {
  title: 'ลงเวลา | RAVENTA Back Office',
}

export const dynamic = 'force-dynamic'

// Back Office → Time clock (schema.sql §16).
// Staff: on a registered tablet only — their own status, "clock out", and
// their week. Admins: everyone's week, who's in now, fix or add entries.
export default async function TimePage({ searchParams }: { searchParams: Promise<{ week?: string; view?: string }> }) {
  const { user, role } = await getConsoleSession()
  if (!user) redirect(`/login?next=${TIME_PATH}`)
  const admin = isAdmin(role)
  const device = await getCurrentDevice().catch(() => null)
  if (!admin && !(canUseDesk(role) && device)) redirect(DESK_PATH)

  const { week, view: rawView } = await searchParams
  const view = admin && (rawView === 'roster' || rawView === 'shifts') ? rawView : 'entries'
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
    const [templates, assignments, settings] = await Promise.all([
      listTemplates().catch(() => null),
      listAssignments(start, end, admin ? undefined : user.id).catch(() => []),
      getTimeSettings().catch(() => DEFAULT_SETTINGS),
    ])
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

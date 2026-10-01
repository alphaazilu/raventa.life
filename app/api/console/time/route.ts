import { NextResponse, type NextRequest } from 'next/server'
import { getConsoleSession } from '@/lib/console/session'
import { addDays, isoToBangkokLocal, listEntries, minutesOf, isForgotten, weekStart } from '@/lib/console/time'
import { bangkokToday } from '@/lib/check-in/day'
import { isAdmin } from '@/lib/auth/roles'
import { DEFAULT_SETTINGS, entryStats, getTimeSettings, listAssignments, listTemplates } from '@/lib/console/shifts'

export const dynamic = 'force-dynamic'

// Admin: the week's time entries as CSV (opens in Excel / Google Sheets),
// for payroll. ?week=YYYY-MM-DD (any day in the week).
export async function GET(request: NextRequest) {
  const { user, role } = await getConsoleSession()
  if (!user || !isAdmin(role)) return NextResponse.json({ error: 'not_admin' }, { status: 403 })

  const week = request.nextUrl.searchParams.get('week') ?? ''
  const start = weekStart(/^\d{4}-\d{2}-\d{2}$/.test(week) ? week : bangkokToday())
  const end = addDays(start, 7)
  const [entries, templates, assignments, rules] = await Promise.all([
    listEntries(start, end),
    listTemplates().catch(() => []),
    listAssignments(start, end).catch(() => []),
    getTimeSettings().catch(() => DEFAULT_SETTINGS),
  ])
  const tmap = new Map(templates.map((t) => [t.id, t]))
  const amap = new Map(assignments.map((a) => [`${a.staffId}|${a.date}`, a]))
  const now = Date.now()

  const cell = (v: string | number) => {
    const s = String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [['date', 'staff', 'shift', 'clock_in', 'clock_out', 'worked_minutes', 'paid_hours', 'paid_minutes', 'late_minutes', 'left_early_minutes', 'ot_minutes', 'note'].join(',')]
  for (const e of [...entries].reverse()) {
    const lost = isForgotten(e, now)
    const mins = lost ? 0 : minutesOf(e, now)
    const date = isoToBangkokLocal(e.clockIn).slice(0, 10)
    const st = entryStats(e, mins, date, amap.get(`${e.staffId}|${date}`), tmap, rules)
    const note = lost ? 'forgot clock-out' : !e.clockOut ? 'still in' : e.inMethod === 'admin' ? 'added by admin' : e.edited ? 'edited' : ''
    lines.push(
      [
        date,
        e.name,
        st.shiftName === 'off' ? 'day off' : (st.shiftName ?? ''),
        isoToBangkokLocal(e.clockIn).replace('T', ' '),
        e.clockOut ? isoToBangkokLocal(e.clockOut).replace('T', ' ') : '',
        mins,
        (st.paidMinutes / 60).toFixed(2),
        lost ? 0 : st.paidMinutes,
        st.lateMinutes,
        st.earlyMinutes,
        st.otMinutes,
        note,
      ]
        .map(cell)
        .join(','),
    )
  }
  // BOM so Excel reads Thai names correctly.
  return new NextResponse('\uFEFF' + lines.join('\r\n') + '\r\n', {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="raventa-time-${start}.csv"`,
      'Cache-Control': 'no-store',
    },
  })
}

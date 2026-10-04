import { createAdminClient } from '@/lib/supabase/admin'
import { listAssignments, listTemplates } from '@/lib/console/shifts'
import { addDays, weekStart } from '@/lib/console/time'
import { getAppSettings } from '@/lib/console/settings'
import { leaveBalance, listMyLeave } from '@/lib/leave-server'
import type { LeaveBalance, LeaveRequest, LeaveRules } from '@/lib/leave'

// My account › My shifts (staff only): this week and next on the roster,
// who else works today, and the person's leave requests (§17, §25).

export type MyShift = { name: string; start: string; end: string; color: number; hex: string }

export type MyShiftDay = {
  date: string
  shift: MyShift | null // the first (earliest) of the day
  shifts: MyShift[] // all of the day's shifts, earliest first (v0.26)
  dayOff: boolean
}

export type MyShifts = {
  today: string
  days: MyShiftDay[] // 14 days from this Monday
  todayWith: string[] // others with a shift today
  next: MyShiftDay | null // first working day from tomorrow
  leave: LeaveRequest[]
  balance: LeaveBalance
  rules: LeaveRules
}

export async function loadMyShifts(staffId: string, today: string): Promise<MyShifts | null> {
  try {
    const from = weekStart(today)
    const to = addDays(from, 14)
    const [templates, mine, everyoneToday, leave, settings] = await Promise.all([
      listTemplates(),
      listAssignments(from, to, staffId),
      listAssignments(today, addDays(today, 1)),
      listMyLeave(staffId, today),
      getAppSettings(),
    ])
    const tIndex = new Map(templates.map((t, i) => [t.id, { t, i }]))
    const days: MyShiftDay[] = Array.from({ length: 14 }, (_, i) => {
      const date = addDays(from, i)
      const list = mine.filter((a) => a.date === date)
      const shifts = list
        .map((a) => (a.templateId ? tIndex.get(a.templateId) : undefined))
        .filter((h): h is NonNullable<typeof h> => Boolean(h))
        .map((h) => ({ name: h.t.name, start: h.t.start, end: h.t.end, color: h.i, hex: h.t.color }))
        .sort((x, y) => x.start.localeCompare(y.start))
      return { date, shift: shifts[0] ?? null, shifts, dayOff: list.some((a) => a.dayOff) }
    })

    const others = [...new Set(everyoneToday.filter((a) => a.staffId !== staffId && a.templateId).map((a) => a.staffId))]
    let todayWith: string[] = []
    if (others.length) {
      const { data } = await createAdminClient().from('profiles').select('id, first_name').in('id', others)
      todayWith = (data ?? []).map((p) => (p.first_name as string) || '—')
    }
    const balance = await leaveBalance(staffId, today.slice(0, 4), settings.leave)
    return {
      today,
      days,
      todayWith,
      next: days.find((d) => d.date > today && d.shift) ?? null,
      leave,
      balance,
      rules: settings.leave,
    }
  } catch (err) {
    console.error('my shifts failed', err)
    return null
  }
}

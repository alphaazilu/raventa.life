// Back Office › Reports › Time (v0.28): one period of clock entries per
// person, against their shifts, leave and public holidays. Pure — the
// loader in time-report.ts reads the database and calls buildTimeReport.
//
// Counting follows the time clock screen, so both show the same numbers:
// a clock-in belongs to the shift that starts nearest to it, late / early /
// OT use the late-grace and OT-minimum rules, an entry left open for more
// than 14 hours is "forgot to clock out" and earns no hours.

import { LEAVE_KINDS, type LeaveKind } from '@/lib/leave'
import {
  entryStats,
  groupAssignments,
  isForgotten,
  minutesOf,
  paidMinutes,
  pickAssignment,
  shiftLengthMinutes,
  type ShiftAssignment,
  type ShiftTemplate,
  type TimeSettings,
} from './shift-math'
import { plusDays, type PayType } from './pay-cycle'

export type TRStaff = { id: string; name: string; memberNo: string | null; payType: PayType | null }
export type TREntry = { id: string; staffId: string; clockIn: string; clockOut: string | null; outMethod: string | null; edited: boolean }
export type TRLeave = { staffId: string; start: string; end: string; kind: LeaveKind }

export type TimeReportInput = {
  from: string
  to: string // inclusive
  now: number
  staff: TRStaff[]
  entries: TREntry[]
  assignments: ShiftAssignment[]
  templates: ShiftTemplate[]
  rules: TimeSettings
  leave: TRLeave[]
  holidays: { day: string; name: string }[]
}

export type DayStatus = 'worked' | 'partial' | 'absent' | 'leave' | 'off' | 'upcoming' | 'none'

export type DayRow = {
  date: string
  shifts: string[] // shift names planned that day
  holiday: string | null
  leave: LeaveKind | null
  status: DayStatus
  entries: { clockIn: string; clockOut: string | null; forgotten: boolean; adminOut: boolean; edited: boolean }[]
  workedMinutes: number
  lateMinutes: number
  earlyMinutes: number
  otMinutes: number
  missedShifts: number
}

export type PersonTime = TRStaff & {
  scheduledDays: number
  scheduledShifts: number
  scheduledMinutes: number
  daysWorked: number
  workedMinutes: number
  absentDays: number
  missedShifts: number // planned shifts not worked (whole days and part days), no leave
  leave: Record<LeaveKind, number>
  lateCount: number
  lateMinutes: number
  earlyCount: number
  earlyMinutes: number
  otMinutes: number
  holidayDays: number
  holidayMinutes: number
  forgotten: number
  adminOut: number
  edited: number
  days: DayRow[]
}

export type TimeReport = { from: string; to: string; people: PersonTime[] }

const bangkokDate = (iso: string) => new Date(Date.parse(iso) + 7 * 3600_000).toISOString().slice(0, 10)

function shiftEnded(date: string, t: ShiftTemplate, now: number): boolean {
  return Date.parse(`${date}T${t.start}:00+07:00`) + shiftLengthMinutes(t) * 60_000 <= now
}

export function buildTimeReport(input: TimeReportInput): TimeReport {
  const { from, to, now, rules } = input
  const tmap = new Map(input.templates.map((t) => [t.id, t]))
  const plan = groupAssignments(input.assignments)
  const holidays = new Map(input.holidays.map((h) => [h.day, h.name]))
  const days: string[] = []
  for (let d = from; d <= to; d = plusDays(d, 1)) days.push(d)

  const entriesBy = new Map<string, TREntry[]>()
  for (const e of input.entries) {
    const k = `${e.staffId}|${bangkokDate(e.clockIn)}`
    const l = entriesBy.get(k)
    if (l) l.push(e)
    else entriesBy.set(k, [e])
  }

  const people = input.staff.map((s): PersonTime => {
    const p: PersonTime = {
      ...s,
      scheduledDays: 0,
      scheduledShifts: 0,
      scheduledMinutes: 0,
      daysWorked: 0,
      workedMinutes: 0,
      absentDays: 0,
      missedShifts: 0,
      leave: { vacation: 0, sick: 0, personal: 0 },
      lateCount: 0,
      lateMinutes: 0,
      earlyCount: 0,
      earlyMinutes: 0,
      otMinutes: 0,
      holidayDays: 0,
      holidayMinutes: 0,
      forgotten: 0,
      adminOut: 0,
      edited: 0,
      days: [],
    }
    const myLeave = input.leave.filter((l) => l.staffId === s.id)

    for (const date of days) {
      const planned = plan.get(`${s.id}|${date}`) ?? []
      const shifts = planned.filter((a) => a.templateId && tmap.has(a.templateId))
      const dayOff = planned.some((a) => a.dayOff)
      const leave = myLeave.find((l) => l.start <= date && l.end >= date)?.kind ?? null
      const holiday = holidays.get(date) ?? null
      const entries = (entriesBy.get(`${s.id}|${date}`) ?? []).sort((a, b) => a.clockIn.localeCompare(b.clockIn))

      const row: DayRow = {
        date,
        shifts: shifts.map((a) => tmap.get(a.templateId as string)!.name),
        holiday,
        leave: leave && !dayOff ? leave : null,
        status: 'none',
        entries: [],
        workedMinutes: 0,
        lateMinutes: 0,
        earlyMinutes: 0,
        otMinutes: 0,
        missedShifts: 0,
      }

      if (shifts.length) {
        p.scheduledDays += 1
        p.scheduledShifts += shifts.length
        p.scheduledMinutes += shifts.reduce((n, a) => n + paidMinutes(tmap.get(a.templateId as string)!), 0)
      }
      if (row.leave) p.leave[row.leave] += 1

      const matched = new Set<string>()
      for (const e of entries) {
        const lost = isForgotten(e, now)
        const st = entryStats(e, minutesOf(e, now), date, shifts, tmap, rules)
        const picked = pickAssignment(shifts, e.clockIn, date, tmap)
        if (picked?.templateId) matched.add(picked.templateId)
        const adminOut = e.outMethod === 'admin'
        row.entries.push({ clockIn: e.clockIn, clockOut: e.clockOut, forgotten: lost, adminOut, edited: e.edited })
        if (lost) p.forgotten += 1
        if (adminOut) p.adminOut += 1
        if (e.edited && !adminOut) p.edited += 1
        if (!lost) row.workedMinutes += st.paidMinutes
        if (st.lateMinutes > 0) {
          row.lateMinutes += st.lateMinutes
          p.lateCount += 1
        }
        if (st.earlyMinutes > 0) {
          row.earlyMinutes += st.earlyMinutes
          p.earlyCount += 1
        }
        row.otMinutes += st.otMinutes
      }

      // Planned shifts that are over and nobody clocked in for (leave excused).
      if (!row.leave) {
        row.missedShifts = shifts.filter((a) => !matched.has(a.templateId as string) && shiftEnded(date, tmap.get(a.templateId as string)!, now)).length
      }
      const allEnded = shifts.every((a) => shiftEnded(date, tmap.get(a.templateId as string)!, now))

      if (entries.length) row.status = row.missedShifts ? 'partial' : 'worked'
      else if (row.leave) row.status = 'leave'
      else if (shifts.length) row.status = allEnded ? 'absent' : 'upcoming'
      else if (dayOff) row.status = 'off'

      if (entries.length) {
        p.daysWorked += 1 // part of a day counts as a day (hours are beside it)
        p.workedMinutes += row.workedMinutes
        if (holiday) {
          p.holidayDays += 1
          p.holidayMinutes += row.workedMinutes
        }
      }
      if (row.status === 'absent') p.absentDays += 1
      p.missedShifts += row.missedShifts
      p.lateMinutes += row.lateMinutes
      p.earlyMinutes += row.earlyMinutes
      p.otMinutes += row.otMinutes
      p.days.push(row)
    }
    return p
  })

  people.sort((a, b) => a.name.localeCompare(b.name, 'th'))
  return { from, to, people }
}

export const leaveTotal = (p: Pick<PersonTime, 'leave'>) => LEAVE_KINDS.reduce((n, k) => n + p.leave[k], 0)
export const needsCheck = (p: Pick<PersonTime, 'forgotten' | 'adminOut' | 'edited'>) => p.forgotten + p.adminOut + p.edited

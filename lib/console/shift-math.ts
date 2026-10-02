// Shift maths shared by the server and the time-clock screen (no database).

export type ShiftTemplate = {
  id: string
  name: string
  start: string // "08:00"
  end: string // "17:00" — earlier than start means the next day
  breakMinutes: number
  active: boolean
}

export type ShiftAssignment = {
  staffId: string
  date: string // YYYY-MM-DD (Bangkok)
  templateId: string | null
  dayOff: boolean
}

export type TimeSettings = { lateGraceMinutes: number; otMinMinutes: number }

export const DEFAULT_SETTINGS: TimeSettings = { lateGraceMinutes: 5, otMinMinutes: 30 }

// ---- pure helpers (also used in the browser) ----

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))

export function shiftLengthMinutes(t: Pick<ShiftTemplate, 'start' | 'end'>): number {
  const d = toMin(t.end) - toMin(t.start)
  return d > 0 ? d : d + 24 * 60
}

// Scheduled start/end instants for a shift on a Bangkok date.
function shiftWindow(date: string, t: Pick<ShiftTemplate, 'start' | 'end'>): { start: number; end: number } {
  const start = Date.parse(`${date}T${t.start}:00+07:00`)
  return { start, end: start + shiftLengthMinutes(t) * 60000 }
}

export type EntryStats = {
  shiftName: string | null
  scheduled: boolean
  lateMinutes: number
  earlyMinutes: number
  otMinutes: number
  paidMinutes: number // worked minus the shift's unpaid break
}

// Compare one clock entry with the person's shift that day. Open entries
// only get "late" (the rest isn't known yet).
export function entryStats(
  e: { clockIn: string; clockOut: string | null },
  workedMinutes: number,
  date: string,
  assignment: ShiftAssignment | undefined,
  templates: Map<string, ShiftTemplate>,
  rules: TimeSettings,
): EntryStats {
  const t = assignment?.templateId ? templates.get(assignment.templateId) : undefined
  if (!t) return { shiftName: assignment?.dayOff ? 'off' : null, scheduled: false, lateMinutes: 0, earlyMinutes: 0, otMinutes: 0, paidMinutes: workedMinutes }
  const w = shiftWindow(date, t)
  const inAt = Date.parse(e.clockIn)
  const lateRaw = Math.round((inAt - w.start) / 60000)
  const lateMinutes = lateRaw > rules.lateGraceMinutes ? lateRaw : 0
  let earlyMinutes = 0
  let otMinutes = 0
  if (e.clockOut) {
    const outAt = Date.parse(e.clockOut)
    const early = Math.round((w.end - outAt) / 60000)
    earlyMinutes = early > 0 ? early : 0
    const over = Math.round((outAt - w.end) / 60000)
    otMinutes = over >= rules.otMinMinutes ? over : 0
  }
  const breakTaken = workedMinutes > t.breakMinutes * 2 ? t.breakMinutes : 0
  return { shiftName: t.name, scheduled: true, lateMinutes, earlyMinutes, otMinutes, paidMinutes: Math.max(0, workedMinutes - breakTaken) }
}

// An entry still open after this long is almost certainly a forgotten
// clock-out; it is flagged for an admin and not counted as hours.
const FORGOT_AFTER_MS = 14 * 60 * 60 * 1000

type Span = { clockIn: string; clockOut: string | null }

export function minutesOf(e: Span, now = Date.now()): number {
  const end = e.clockOut ? Date.parse(e.clockOut) : now
  return Math.max(0, Math.round((end - Date.parse(e.clockIn)) / 60000))
}

export function isForgotten(e: Span, now = Date.now()): boolean {
  return !e.clockOut && now - Date.parse(e.clockIn) > FORGOT_AFTER_MS
}

'use server'

import { isMissingTable, requireAdmin } from '@/lib/console/guard'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { TIME_PATH } from '@/lib/auth/roles'

// Admin: shift templates, the weekly roster and the late/OT rules (§17).

export type ShiftResult = { ok: true } | { ok: false; error: string }

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const missing = isMissingTable

export async function saveTemplate(input: {
  id?: string
  name: string
  start: string
  end: string
  breakMinutes: number
  active: boolean
  shortCode?: string // §26 — '' = automatic
  color?: string // §26 — '' = automatic
}): Promise<ShiftResult> {
  const ctx = await requireAdmin()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  const name = input.name.trim()
  if (!name || name.length > 40) return { ok: false, error: 'need_name' }
  if (!TIME_RE.test(input.start) || !TIME_RE.test(input.end)) return { ok: false, error: 'bad_time' }
  if (input.start === input.end) return { ok: false, error: 'same_time' }
  const breakMinutes = Math.round(Number(input.breakMinutes) || 0)
  if (breakMinutes < 0 || breakMinutes > 240) return { ok: false, error: 'bad_break' }

  const shortCode = (input.shortCode ?? '').trim()
  if ([...shortCode].length > 3) return { ok: false, error: 'bad_code' }
  const color = (input.color ?? '').trim()
  if (color && !/^#[0-9A-Fa-f]{6}$/.test(color)) return { ok: false, error: 'bad_code' }
  const row: Record<string, unknown> = { name, start_time: input.start, end_time: input.end, break_minutes: breakMinutes, is_active: input.active }
  // Only sent when set, so saving still works before §26 is run.
  if (input.shortCode !== undefined) row.short_code = shortCode || null
  if (input.color !== undefined) row.color = color || null
  const admin = createAdminClient()
  const write = (r: Record<string, unknown>) =>
    input.id ? admin.from('shift_templates').update(r).eq('id', input.id) : admin.from('shift_templates').insert(r)
  let { error } = await write(row)
  if (error?.code === '42703') {
    // Before §26: no code/colour columns yet — save the rest.
    delete row.short_code
    delete row.color
    ;({ error } = await write(row))
  }
  if (error) return { ok: false, error: missing(error) ? 'not_set_up' : 'failed' }
  revalidatePath(TIME_PATH)
  return { ok: true }
}

export async function saveTimeSettings(lateGraceMinutes: number, otMinMinutes: number, minStaffPerDay?: number): Promise<ShiftResult> {
  const ctx = await requireAdmin()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  const grace = Math.round(Number(lateGraceMinutes))
  const ot = Math.round(Number(otMinMinutes))
  if (!(grace >= 0 && grace <= 120) || !(ot >= 0 && ot <= 240)) return { ok: false, error: 'bad_rule' }
  const row: Record<string, unknown> = { id: 1, late_grace_minutes: grace, ot_min_minutes: ot, updated_by: ctx.userId, updated_at: new Date().toISOString() }
  if (minStaffPerDay !== undefined) {
    const min = Math.round(Number(minStaffPerDay))
    if (!(min >= 0 && min <= 50)) return { ok: false, error: 'bad_rule' }
    row.min_staff_per_day = min
  }
  const { error } = await createAdminClient()
    .from('time_settings')
    .upsert(row)
  if (error) return { ok: false, error: missing(error) ? 'not_set_up' : 'failed' }
  revalidatePath(TIME_PATH)
  return { ok: true }
}

// One day of one person's plan, replaced as a whole (v0.26: a day may hold
// several shifts). Delete then insert — the unique index is per shift.
async function replaceDay(staffId: string, date: string, templateIds: string[], off: boolean, userId: string): Promise<ShiftResult> {
  const admin = createAdminClient()
  const { error } = await admin.from('shift_assignments').delete().eq('staff_id', staffId).eq('work_date', date)
  if (error) return { ok: false, error: missing(error) ? 'not_set_up' : 'failed' }
  const now = new Date().toISOString()
  type Row = { staff_id: string; work_date: string; template_id: string | null; day_off: boolean; updated_by: string; updated_at: string }
  const rows: Row[] = off
    ? [{ staff_id: staffId, work_date: date, template_id: null, day_off: true, updated_by: userId, updated_at: now }]
    : templateIds.map((id) => ({ staff_id: staffId, work_date: date, template_id: id, day_off: false, updated_by: userId, updated_at: now }))
  if (rows.length) {
    const { error: insErr } = await admin.from('shift_assignments').insert(rows)
    if (insErr) return { ok: false, error: 'failed' }
  }
  return { ok: true }
}

const UUID_RE = /^[0-9a-f-]{36}$/i
const MAX_SHIFTS_A_DAY = 3

// value: a template id, 'off' (day off) or '' (nothing planned) — the day
// becomes just that (the weekly grid's dropdown).
export async function setAssignment(staffId: string, date: string, value: string): Promise<ShiftResult> {
  const ctx = await requireAdmin()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  if (!DATE_RE.test(date) || !UUID_RE.test(staffId)) return { ok: false, error: 'bad_time' }
  if (value && value !== 'off' && !UUID_RE.test(value)) return { ok: false, error: 'bad_time' }
  const r = await replaceDay(staffId, date, value && value !== 'off' ? [value] : [], value === 'off', ctx.userId)
  if (r.ok) revalidatePath(TIME_PATH)
  return r
}

// The monthly roster's day menu: the day's shifts as a set (several
// allowed), or a day off, or nothing.
export async function setDayShifts(staffId: string, date: string, value: { off: true } | { shifts: string[] }): Promise<ShiftResult> {
  const ctx = await requireAdmin()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  if (!DATE_RE.test(date) || !UUID_RE.test(staffId)) return { ok: false, error: 'bad_time' }
  const ids = 'off' in value ? [] : [...new Set(value.shifts)].filter((id) => UUID_RE.test(id))
  if (ids.length > MAX_SHIFTS_A_DAY) return { ok: false, error: 'too_many_shifts' }
  const r = await replaceDay(staffId, date, ids, 'off' in value, ctx.userId)
  if (r.ok) revalidatePath(TIME_PATH)
  return r
}

// Copy last week's roster onto this week (only days still empty).
export async function copyPreviousWeek(weekStart: string): Promise<ShiftResult> {
  const ctx = await requireAdmin()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  if (!DATE_RE.test(weekStart)) return { ok: false, error: 'bad_time' }
  const shift = (iso: string, n: number) => {
    const d = new Date(`${iso}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() + n)
    return d.toISOString().slice(0, 10)
  }
  const admin = createAdminClient()
  const [{ data: prev, error: e1 }, { data: cur, error: e2 }] = await Promise.all([
    admin.from('shift_assignments').select('staff_id, work_date, template_id, day_off').gte('work_date', shift(weekStart, -7)).lt('work_date', weekStart),
    admin.from('shift_assignments').select('staff_id, work_date').gte('work_date', weekStart).lt('work_date', shift(weekStart, 7)),
  ])
  if (e1 || e2) return { ok: false, error: missing(e1 ?? e2) ? 'not_set_up' : 'failed' }
  const taken = new Set((cur ?? []).map((r) => `${r.staff_id}|${r.work_date}`))
  const rows = (prev ?? [])
    .map((r) => ({ ...r, work_date: shift(r.work_date as string, 7) }))
    .filter((r) => !taken.has(`${r.staff_id}|${r.work_date}`))
    .map((r) => ({ ...r, updated_by: ctx.userId, updated_at: new Date().toISOString() }))
  if (rows.length === 0) return { ok: false, error: 'nothing_to_copy' }
  const { error } = await admin.from('shift_assignments').insert(rows)
  if (error) return { ok: false, error: 'failed' }
  revalidatePath(TIME_PATH)
  return { ok: true }
}

// Monthly roster: fill the month's empty days by repeating the pattern of
// four weeks earlier (same weekday), day by day — so a regular weekly
// rotation carries on. Days already planned are left alone.
export async function copyMonthPattern(monthStart: string): Promise<ShiftResult & { count?: number }> {
  const ctx = await requireAdmin()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  if (!/^\d{4}-\d{2}-01$/.test(monthStart)) return { ok: false, error: 'bad_time' }
  const shift = (iso: string, n: number) => {
    const d = new Date(`${iso}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() + n)
    return d.toISOString().slice(0, 10)
  }
  const next = (() => {
    const d = new Date(`${monthStart}T00:00:00Z`)
    d.setUTCMonth(d.getUTCMonth() + 1)
    return d.toISOString().slice(0, 10)
  })()
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('shift_assignments')
    .select('staff_id, work_date, template_id, day_off')
    .gte('work_date', shift(monthStart, -28))
    .lt('work_date', next)
  if (error) return { ok: false, error: missing(error) ? 'not_set_up' : 'failed' }
  type A = { template_id: string | null; day_off: boolean }
  const plan = new Map<string, A[]>()
  for (const r of data ?? []) {
    const k = `${r.staff_id}|${r.work_date}`
    plan.set(k, [...(plan.get(k) ?? []), { template_id: r.template_id, day_off: r.day_off }])
  }
  const staffIds = [...new Set((data ?? []).map((r) => r.staff_id as string))]
  const now = new Date().toISOString()
  const rows: Record<string, unknown>[] = []
  let days = 0
  for (let d = monthStart; d < next; d = shift(d, 1)) {
    for (const s of staffIds) {
      if (plan.has(`${s}|${d}`)) continue
      const src = plan.get(`${s}|${shift(d, -28)}`)
      if (!src) continue
      plan.set(`${s}|${d}`, src)
      days += 1
      for (const a of src) rows.push({ staff_id: s, work_date: d, template_id: a.template_id, day_off: a.day_off, updated_by: ctx.userId, updated_at: now })
    }
  }
  if (rows.length === 0) return { ok: false, error: 'nothing_to_copy_month' }
  const { error: insErr } = await admin.from('shift_assignments').insert(rows)
  if (insErr) return { ok: false, error: 'failed' }
  revalidatePath(TIME_PATH)
  return { ok: true, count: days }
}

// Plan several days at once (Roster › "Plan a date range"): the same shift,
// day off or "clear" for each chosen person on each chosen weekday between
// two dates. weekdays: 0 = Sunday … 6 = Saturday. Up to ~3 months per go.
export async function setAssignmentRange(input: {
  staffIds: string[]
  from: string
  to: string
  weekdays: number[]
  value: string
  // replace = the day becomes this; empty = only days with nothing planned;
  // add = put this shift alongside the day's others (v0.26)
  mode?: 'replace' | 'empty' | 'add'
  overwrite?: boolean // older callers: true = replace, false = empty
}): Promise<ShiftResult & { count?: number }> {
  const ctx = await requireAdmin()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  const { from, to } = input
  if (!DATE_RE.test(from) || !DATE_RE.test(to) || from > to) return { ok: false, error: 'bad_range' }
  const staffIds = [...new Set(input.staffIds)].filter((id) => UUID_RE.test(id))
  if (staffIds.length === 0) return { ok: false, error: 'need_staff' }
  const days = new Set(input.weekdays.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))
  const value = input.value
  if (value && value !== 'off' && !UUID_RE.test(value)) return { ok: false, error: 'bad_range' }
  let mode = input.mode ?? (input.overwrite === false ? 'empty' : 'replace')
  if (mode === 'add' && (!value || value === 'off')) mode = 'replace' // "add" only makes sense for a shift

  const dates: string[] = []
  for (let d = new Date(`${from}T00:00:00Z`); d.toISOString().slice(0, 10) <= to; d.setUTCDate(d.getUTCDate() + 1)) {
    if (days.has(d.getUTCDay())) dates.push(d.toISOString().slice(0, 10))
    if (dates.length > 100) return { ok: false, error: 'range_too_long' }
  }
  if (dates.length === 0) return { ok: false, error: 'bad_range' }

  const admin = createAdminClient()
  const { data: cur, error: curErr } = await admin
    .from('shift_assignments')
    .select('staff_id, work_date, template_id, day_off')
    .in('staff_id', staffIds)
    .gte('work_date', dates[0])
    .lte('work_date', dates[dates.length - 1])
  if (curErr) return { ok: false, error: missing(curErr) ? 'not_set_up' : 'failed' }
  const byDay = new Map<string, { template_id: string | null; day_off: boolean }[]>()
  for (const r of cur ?? []) {
    const k = `${r.staff_id}|${r.work_date}`
    byDay.set(k, [...(byDay.get(k) ?? []), r])
  }

  let targets = staffIds.flatMap((staff_id) => dates.map((work_date) => ({ staff_id, work_date })))
  if (mode === 'empty') targets = targets.filter((t) => !byDay.has(`${t.staff_id}|${t.work_date}`))
  if (mode === 'add') {
    targets = targets.filter((t) => {
      const day = byDay.get(`${t.staff_id}|${t.work_date}`) ?? []
      const shifts = day.filter((a) => a.template_id)
      return !shifts.some((a) => a.template_id === value) && shifts.length < MAX_SHIFTS_A_DAY
    })
  }
  if (targets.length === 0) return { ok: true, count: 0 }

  // Days being replaced (or a day off being turned into a shift) are
  // cleared first, one delete per person.
  for (const staffId of staffIds) {
    const mine = targets
      .filter((t) => t.staff_id === staffId)
      .filter((t) => mode !== 'add' || (byDay.get(`${t.staff_id}|${t.work_date}`) ?? []).some((a) => a.day_off))
      .map((t) => t.work_date)
    if (mine.length === 0) continue
    let q = admin.from('shift_assignments').delete().eq('staff_id', staffId).in('work_date', mine)
    if (mode === 'add') q = q.eq('day_off', true)
    const { error } = await q
    if (error) return { ok: false, error: missing(error) ? 'not_set_up' : 'failed' }
  }
  if (value) {
    const now = new Date().toISOString()
    const rows = targets.map((t) => ({
      ...t,
      template_id: value === 'off' ? null : value,
      day_off: value === 'off',
      updated_by: ctx.userId,
      updated_at: now,
    }))
    const { error } = await admin.from('shift_assignments').insert(rows)
    if (error) return { ok: false, error: missing(error) ? 'not_set_up' : 'failed' }
  }
  revalidatePath(TIME_PATH)
  return { ok: true, count: targets.length }
}

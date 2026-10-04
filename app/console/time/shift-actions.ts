'use server'

import { isMissingTable, requireAdmin } from '@/lib/console/guard'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { TIME_PATH } from '@/lib/auth/roles'
import { applyPlans, MAX_SHIFTS_A_DAY, readDays, withShift, type CellPlan } from '@/lib/console/roster-write'

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

const UUID_RE = /^[0-9a-f-]{36}$/i

// One day of one person's plan, set as a whole — written safely (see
// lib/console/roster-write: nothing is removed before the new rows exist).
async function replaceDay(staffId: string, date: string, templateIds: string[], off: boolean, userId: string): Promise<ShiftResult> {
  const r = await applyPlans([{ staffId, date, plan: off ? { off: true } : { shifts: templateIds } }], userId)
  return r.ok ? { ok: true } : r
}

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

// Monthly roster, many cells at once (drag-select, v0.26.1): each chosen
// day becomes a shift / a day off / nothing, or gets a shift added.
export type BulkAction = { set: string } | { add: string } | { off: true } | { clear: true }

export async function setCells(cells: { staffId: string; date: string }[], action: BulkAction): Promise<ShiftResult & { count?: number }> {
  const ctx = await requireAdmin()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  const uniq = [...new Map(cells.filter((c) => UUID_RE.test(c.staffId) && DATE_RE.test(c.date)).map((c) => [`${c.staffId}|${c.date}`, c])).values()]
  if (uniq.length === 0) return { ok: false, error: 'bad_range' }
  if (uniq.length > 600) return { ok: false, error: 'range_too_long' }
  const tid = 'set' in action ? action.set : 'add' in action ? action.add : null
  if (tid !== null && !UUID_RE.test(tid)) return { ok: false, error: 'bad_range' }
  let existing
  try {
    existing = await readDays(uniq)
  } catch {
    return { ok: false, error: 'failed' }
  }
  const plans: CellPlan[] = uniq.map((c) => ({
    ...c,
    plan:
      'off' in action
        ? { off: true }
        : 'clear' in action
          ? { shifts: [] }
          : 'set' in action
            ? { shifts: [action.set] }
            : withShift(existing.get(`${c.staffId}|${c.date}`) ?? [], action.add),
  }))
  const r = await applyPlans(plans, ctx.userId, existing)
  if (!r.ok) return r
  revalidatePath(TIME_PATH)
  return { ok: true, count: r.changed }
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

  const cells = staffIds.flatMap((staffId) => dates.map((date) => ({ staffId, date })))
  let existing
  try {
    existing = await readDays(cells)
  } catch (err) {
    return { ok: false, error: missing(err as { code?: string }) ? 'not_set_up' : 'failed' }
  }
  const plans: CellPlan[] = []
  for (const c of cells) {
    const day = existing.get(`${c.staffId}|${c.date}`) ?? []
    if (mode === 'empty' && day.length) continue
    if (mode === 'add') {
      const shifts = day.filter((a) => a.template_id)
      if (shifts.some((a) => a.template_id === value) || shifts.length >= MAX_SHIFTS_A_DAY) continue
      plans.push({ ...c, plan: withShift(day, value) })
      continue
    }
    plans.push({ ...c, plan: value === 'off' ? { off: true } : { shifts: value ? [value] : [] } })
  }
  if (plans.length === 0) return { ok: true, count: 0 }
  const r = await applyPlans(plans, ctx.userId, existing)
  if (!r.ok) return r
  revalidatePath(TIME_PATH)
  return { ok: true, count: plans.length }
}

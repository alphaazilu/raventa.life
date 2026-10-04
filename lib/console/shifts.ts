import { createAdminClient } from '@/lib/supabase/admin'

// Shifts (supabase/schema.sql §17). SERVER ONLY for the loaders; the
// pure helpers at the bottom are shared with the time-clock screen.

import type { ShiftAssignment, ShiftTemplate, TimeSettings } from './shift-math'
import { autoShortCode, DEFAULT_SETTINGS, SHIFT_COLORS } from './shift-math'
export * from './shift-math'

const hhmm = (t: string) => t.slice(0, 5)

export async function listTemplates(includeInactive = true): Promise<ShiftTemplate[]> {
  const run = (cols: string) => {
    let q = createAdminClient()
      .from('shift_templates')
      .select(cols)
      .order('sort', { ascending: true })
      .order('start_time', { ascending: true })
    if (!includeInactive) q = q.eq('is_active', true)
    return q
  }
  const base = 'id, name, start_time, end_time, break_minutes, is_active, sort'
  // short_code / color arrive with §26; read without them before that.
  let res = await run(`${base}, short_code, color`)
  if (res.error?.code === '42703') res = await run(base)
  if (res.error) throw res.error
  const rows = (res.data ?? []) as unknown as Record<string, unknown>[]
  return rows.map((r, i) => ({
    id: r.id as string,
    name: r.name as string,
    start: hhmm(r.start_time as string),
    end: hhmm(r.end_time as string),
    breakMinutes: r.break_minutes as number,
    active: r.is_active as boolean,
    shortCode: ((r.short_code as string | null) ?? '').trim() || autoShortCode(r.name as string),
    color: (r.color as string | null) || SHIFT_COLORS[i % SHIFT_COLORS.length],
  }))
}

export async function listAssignments(from: string, to: string, staffId?: string): Promise<ShiftAssignment[]> {
  let q = createAdminClient()
    .from('shift_assignments')
    .select('staff_id, work_date, template_id, day_off')
    .gte('work_date', from)
    .lt('work_date', to)
  if (staffId) q = q.eq('staff_id', staffId)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []).map((r) => ({
    staffId: r.staff_id as string,
    date: r.work_date as string,
    templateId: (r.template_id as string | null) ?? null,
    dayOff: r.day_off as boolean,
  }))
}

export async function getTimeSettings(): Promise<TimeSettings> {
  const read = (cols: string) => createAdminClient().from('time_settings').select(cols).eq('id', 1).maybeSingle()
  let res = await read('late_grace_minutes, ot_min_minutes, min_staff_per_day')
  if (res.error?.code === '42703') res = await read('late_grace_minutes, ot_min_minutes') // before §26
  const data = res.data as Record<string, unknown> | null
  if (!data) return DEFAULT_SETTINGS
  return {
    lateGraceMinutes: data.late_grace_minutes as number,
    otMinMinutes: data.ot_min_minutes as number,
    minStaffPerDay: Number(data.min_staff_per_day ?? 0),
  }
}

// Public holidays in a date range (Products › holidays, §18), for the roster.
export async function listHolidays(from: string, to: string): Promise<{ day: string; name: string }[]> {
  const { data, error } = await createAdminClient().from('holidays').select('day, name').gte('day', from).lt('day', to)
  if (error) return []
  return (data ?? []).map((h) => ({ day: h.day as string, name: h.name as string }))
}


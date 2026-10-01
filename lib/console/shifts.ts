import { createAdminClient } from '@/lib/supabase/admin'

// Shifts (supabase/schema.sql §17). SERVER ONLY for the loaders; the
// pure helpers at the bottom are shared with the time-clock screen.

import type { ShiftAssignment, ShiftTemplate, TimeSettings } from './shift-math'
import { DEFAULT_SETTINGS } from './shift-math'
export * from './shift-math'

const hhmm = (t: string) => t.slice(0, 5)

export async function listTemplates(includeInactive = true): Promise<ShiftTemplate[]> {
  let q = createAdminClient()
    .from('shift_templates')
    .select('id, name, start_time, end_time, break_minutes, is_active, sort')
    .order('sort', { ascending: true })
    .order('start_time', { ascending: true })
  if (!includeInactive) q = q.eq('is_active', true)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    start: hhmm(r.start_time as string),
    end: hhmm(r.end_time as string),
    breakMinutes: r.break_minutes as number,
    active: r.is_active as boolean,
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
  const { data } = await createAdminClient()
    .from('time_settings')
    .select('late_grace_minutes, ot_min_minutes')
    .eq('id', 1)
    .maybeSingle()
  if (!data) return DEFAULT_SETTINGS
  return { lateGraceMinutes: data.late_grace_minutes as number, otMinMinutes: data.ot_min_minutes as number }
}


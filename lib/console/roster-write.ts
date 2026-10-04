import { createAdminClient } from '@/lib/supabase/admin'
import { isMissingTable } from '@/lib/console/db-errors'

// Writing the roster safely (v0.26.1). A day of one person's plan is a set
// of shift rows, or one "day off" row. Changing days never deletes first:
// new rows are added, then changed rows are updated in place, then rows no
// longer wanted are removed — so a failed step leaves the old plan as it
// was (before, a refused insert after the delete emptied the day).

export type DayPlan = { off: true } | { shifts: string[] } // shifts: [] = nothing planned
export type CellPlan = { staffId: string; date: string; plan: DayPlan }
export type WriteResult = { ok: true; changed: number } | { ok: false; error: string }

type Row = { id: string; staff_id: string; work_date: string; template_id: string | null; day_off: boolean }

export const MAX_SHIFTS_A_DAY = 3

// What a day becomes when a shift is added to it (bulk "add as another shift").
export function withShift(current: Row[] | { templateId: string | null; dayOff: boolean }[], templateId: string): DayPlan {
  const ids = current
    .map((r) => ('template_id' in r ? r.template_id : r.templateId))
    .filter((v): v is string => Boolean(v))
  return { shifts: ids.includes(templateId) ? ids : [...ids, templateId].slice(0, MAX_SHIFTS_A_DAY) }
}

export async function readDays(cells: { staffId: string; date: string }[]): Promise<Map<string, Row[]>> {
  const out = new Map<string, Row[]>()
  if (!cells.length) return out
  const staffIds = [...new Set(cells.map((c) => c.staffId))]
  const dates = cells.map((c) => c.date).sort()
  const { data, error } = await createAdminClient()
    .from('shift_assignments')
    .select('id, staff_id, work_date, template_id, day_off')
    .in('staff_id', staffIds)
    .gte('work_date', dates[0])
    .lte('work_date', dates[dates.length - 1])
  if (error) throw error
  for (const r of (data ?? []) as Row[]) {
    const k = `${r.staff_id}|${r.work_date}`
    out.set(k, [...(out.get(k) ?? []), r])
  }
  return out
}

export async function applyPlans(cells: CellPlan[], userId: string, existing?: Map<string, Row[]>): Promise<WriteResult> {
  if (!cells.length) return { ok: true, changed: 0 }
  const db = createAdminClient()
  let current: Map<string, Row[]>
  try {
    current = existing ?? (await readDays(cells))
  } catch (err) {
    return { ok: false, error: isMissingTable(err as { code?: string }) ? 'not_set_up' : 'failed' }
  }
  const now = new Date().toISOString()
  const inserts: Record<string, unknown>[] = []
  const updates: { id: string; template_id: string | null; day_off: boolean }[] = []
  const deletes: string[] = []
  let changed = 0

  for (const c of cells) {
    const have = current.get(`${c.staffId}|${c.date}`) ?? []
    // The rows this day should have, as keys: a template id, or "off".
    const want = 'off' in c.plan ? ['off'] : [...new Set(c.plan.shifts)].slice(0, MAX_SHIFTS_A_DAY)
    const keyOf = (r: Row) => (r.day_off ? 'off' : (r.template_id as string))
    const keep = new Set(have.map(keyOf).filter((k) => want.includes(k)))
    const add = want.filter((k) => !keep.has(k))
    const drop = have.filter((r) => !want.includes(keyOf(r)))
    if (!add.length && !drop.length) continue
    changed += 1
    // Re-use rows being dropped for rows being added (an update in place
    // works on any schema); only the rest are inserted or deleted.
    const pairs = Math.min(add.length, drop.length)
    for (let i = 0; i < pairs; i++) {
      const k = add[i]
      updates.push({ id: drop[i].id, template_id: k === 'off' ? null : k, day_off: k === 'off' })
    }
    for (const k of add.slice(pairs)) {
      inserts.push({ staff_id: c.staffId, work_date: c.date, template_id: k === 'off' ? null : k, day_off: k === 'off', updated_by: userId, updated_at: now })
    }
    deletes.push(...drop.slice(pairs).map((r) => r.id))
  }

  // 1. Add (nothing lost if this is refused).
  if (inserts.length) {
    const { error } = await db.from('shift_assignments').insert(inserts)
    if (error) return { ok: false, error: error.code === '23505' ? 'needs_multi_sql' : isMissingTable(error) ? 'not_set_up' : 'failed' }
  }
  // 2. Change in place.
  for (let i = 0; i < updates.length; i += 25) {
    const batch = updates.slice(i, i + 25)
    const results = await Promise.all(
      batch.map((u) =>
        db
          .from('shift_assignments')
          .update({ template_id: u.template_id, day_off: u.day_off, updated_by: userId, updated_at: now })
          .eq('id', u.id),
      ),
    )
    const bad = results.find((r) => r.error)
    if (bad?.error) return { ok: false, error: bad.error.code === '23505' ? 'needs_multi_sql' : 'failed' }
  }
  // 3. Remove what's no longer wanted.
  for (let i = 0; i < deletes.length; i += 200) {
    const { error } = await db.from('shift_assignments').delete().in('id', deletes.slice(i, i + 200))
    if (error) return { ok: false, error: 'failed' }
  }
  return { ok: true, changed }
}

import { createAdminClient } from '@/lib/supabase/admin'
import { isMissingTable } from '@/lib/console/db-errors'
import { slotsOn, slotState, withLivePoints, type Answer, type ChecklistItem, type CheckPoint, type CheckRound, type CheckScan, type RoundKind } from '@/lib/checklist'

// Staff checklists (§29, v0.29). SERVER ONLY — service role; callers check
// who is asking first.

type PointRow = { id: string; name: string; place: string | null; items: unknown; code_version: number; is_active: boolean; sort: number }
type RoundRow = {
  id: string
  name: string
  point_ids: string[] | null
  kind: RoundKind
  start_time: string | null
  end_time: string | null
  every_minutes: number | null
  days: number[] | null
  is_active: boolean
  sort: number
}

export const toPoint = (r: PointRow): CheckPoint => ({
  id: r.id,
  name: r.name,
  place: r.place,
  items: Array.isArray(r.items) ? (r.items as ChecklistItem[]) : [],
  codeVersion: r.code_version,
  active: r.is_active,
  sort: r.sort,
})

const toRound = (r: RoundRow): CheckRound => ({
  id: r.id,
  name: r.name,
  pointIds: r.point_ids ?? [],
  kind: r.kind,
  start: r.start_time ? r.start_time.slice(0, 5) : null,
  end: r.end_time ? r.end_time.slice(0, 5) : null,
  everyMinutes: r.every_minutes,
  days: (r.days ?? []).map(Number),
  active: r.is_active,
  sort: r.sort,
})

// null = §29 not run yet.
export async function listPoints(): Promise<CheckPoint[] | null> {
  const { data, error } = await createAdminClient().from('checklist_points').select('*').order('sort').order('created_at')
  if (error) {
    if (isMissingTable(error)) return null
    throw error
  }
  return (data as PointRow[]).map(toPoint)
}

export async function listRounds(): Promise<CheckRound[]> {
  const { data, error } = await createAdminClient().from('checklist_rounds').select('*').order('sort').order('created_at')
  if (error) {
    if (isMissingTable(error)) return []
    throw error
  }
  return (data as RoundRow[]).map(toRound)
}

export async function getPoint(id: string): Promise<CheckPoint | null> {
  const { data } = await createAdminClient().from('checklist_points').select('*').eq('id', id).maybeSingle()
  return data ? toPoint(data as PointRow) : null
}

// Scans between two instants (ISO), newest first, with who made them.
export async function listScans(fromIso: string, toIso: string, opts: { pointId?: string; staffId?: string; limit?: number } = {}): Promise<CheckScan[]> {
  const db = createAdminClient()
  let q = db
    .from('checklist_scans')
    .select('id, point_id, staff_id, scanned_at, results, note, issue, flags')
    .gte('scanned_at', fromIso)
    .lt('scanned_at', toIso)
    .order('scanned_at', { ascending: false })
    .limit(opts.limit ?? 3000)
  if (opts.pointId) q = q.eq('point_id', opts.pointId)
  if (opts.staffId) q = q.eq('staff_id', opts.staffId)
  const { data, error } = await q
  if (error) {
    if (isMissingTable(error)) return []
    throw error
  }
  const rows = data ?? []
  const ids = [...new Set(rows.map((r) => r.staff_id as string))]
  const names = new Map<string, string>()
  if (ids.length) {
    const { data: people } = await db.from('profiles').select('id, first_name, last_name, email').in('id', ids)
    for (const p of people ?? []) names.set(p.id, [p.first_name, p.last_name].filter(Boolean).join(' ') || p.email || '—')
  }
  return rows.map((r) => ({
    id: r.id as string,
    pointId: r.point_id as string,
    staffId: r.staff_id as string,
    staffName: names.get(r.staff_id as string) ?? '—',
    at: r.scanned_at as string,
    results: (Array.isArray(r.results) ? r.results : []) as Answer[],
    note: (r.note as string | null) ?? null,
    issue: Boolean(r.issue),
    flags: (r.flags as string[] | null) ?? [],
  }))
}

// Bangkok day → [start, end) as ISO instants.
export function dayBounds(date: string, days = 1): { from: string; to: string } {
  const from = Date.parse(`${date}T00:00:00+07:00`)
  return { from: new Date(from).toISOString(), to: new Date(from + days * 86_400_000).toISOString() }
}

// For the staff's account page: rounds due right now and the points still
// to scan in them (null = not set up, or no rounds at all).
export async function dueNow(today: string, now = Date.now()): Promise<{ rounds: number; left: number } | null> {
  const [points, rounds] = await Promise.all([listPoints().catch(() => null), listRounds().catch(() => [])])
  if (!points || !rounds.some((r) => r.active)) return null
  const { from, to } = dayBounds(today)
  const scans = await listScans(from, to).catch(() => [])
  let n = 0
  let left = 0
  for (const r of withLivePoints(rounds, points)) {
    for (const s of slotsOn(r, today)) {
      const st = slotState(s, r, scans, now)
      if (st.status !== 'open') continue
      n += 1
      left += r.pointIds.filter((p) => !st.done[p]).length
    }
  }
  return { rounds: n, left }
}

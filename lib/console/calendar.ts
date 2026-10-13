import { createAdminClient } from '@/lib/supabase/admin'
import { isMissingTable } from '@/lib/console/db-errors'
import { addDays, canSee, forOutside, occurrences, type CalExtra, type CalItem, type Occurrence, type Viewer } from '@/lib/calendar'

// Calendar (§31, v0.32). SERVER ONLY (service role).

type Row = Record<string, unknown>
const t5 = (v: unknown) => (v ? String(v).slice(0, 5) : null)

async function nameMap(ids: string[]): Promise<Map<string, string>> {
  const want = [...new Set(ids.filter(Boolean))]
  if (!want.length) return new Map()
  const { data } = await createAdminClient().from('profiles').select('id, first_name, last_name, email').in('id', want)
  return new Map((data ?? []).map((p) => [p.id as string, [p.first_name, p.last_name].filter(Boolean).join(' ') || (p.email as string) || '—']))
}

function toItem(r: Row, names: Map<string, string>): CalItem {
  return {
    id: r.id as string,
    kind: r.kind as CalItem['kind'],
    title: r.title as string,
    titleEn: (r.title_en as string | null) || null,
    body: (r.body as string | null) || null,
    bodyEn: (r.body_en as string | null) || null,
    internalNote: (r.internal_note as string | null) || null,
    place: (r.place as string | null) || null,
    startsOn: r.starts_on as string,
    endsOn: r.ends_on as string,
    startTime: t5(r.start_time),
    endTime: t5(r.end_time),
    visibility: r.visibility as CalItem['visibility'],
    staffIds: (r.staff_ids as string[] | null) ?? [],
    repeat: r.repeat as CalItem['repeat'],
    repeatUntil: (r.repeat_until as string | null) ?? null,
    createdBy: (r.created_by as string | null) ?? null,
    createdByName: r.created_by ? (names.get(r.created_by as string) ?? null) : null,
  }
}

// Items that may show between two days (repeats included). null = §31 not run.
export async function listItems(from: string, to: string): Promise<CalItem[] | null> {
  const { data, error } = await createAdminClient()
    .from('calendar_items')
    .select('*')
    .lte('starts_on', to)
    .or(`ends_on.gte.${from},repeat.neq.none`)
    .order('starts_on')
    .limit(2000)
  if (error) {
    if (isMissingTable(error)) return null
    throw error
  }
  const rows = (data ?? []) as Row[]
  const names = await nameMap(rows.map((r) => r.created_by as string))
  return rows.map((r) => toItem(r, names))
}

export async function getItem(id: string): Promise<CalItem | null> {
  const { data } = await createAdminClient().from('calendar_items').select('*').eq('id', id).maybeSingle()
  return data ? toItem(data as Row, new Map()) : null
}

// Showings a viewer may see, sorted by start (then all-day first, then time).
export function visibleOccurrences(items: CalItem[], v: Viewer, from: string, to: string, outside = false): Occurrence[] {
  return items
    .filter((i) => canSee(i, v))
    .flatMap((i) => occurrences(outside ? forOutside(i) : i, from, to))
    .sort((a, b) => a.start.localeCompare(b.start) || (a.item.startTime ?? '').localeCompare(b.item.startTime ?? ''))
}

// What other parts of the system put on the team calendar.
export async function loadExtras(from: string, to: string): Promise<CalExtra[]> {
  const db = createAdminClient()
  const [hol, promo, leave, shifts, bookings] = await Promise.all([
    db.from('holidays').select('day, name').gte('day', from).lte('day', to),
    db.from('promotions').select('name, starts_on, ends_on, is_active').eq('is_active', true).not('starts_on', 'is', null).lte('starts_on', to),
    db.from('leave_requests').select('staff_id, start_date, end_date').eq('status', 'approved').lte('start_date', to).gte('end_date', from),
    db.from('shift_assignments').select('staff_id, work_date, template_id').gte('work_date', from).lte('work_date', to).not('template_id', 'is', null),
    db.from('bookings').select('day').gte('day', from).lte('day', to).in('status', ['booked', 'arrived']).limit(10000),
  ])
  const out: CalExtra[] = []
  for (const h of hol.error ? [] : (hol.data ?? [])) out.push({ type: 'holiday', day: h.day as string, name: h.name as string })
  for (const p of promo.error ? [] : (promo.data ?? [])) {
    const end = (p.ends_on as string | null) ?? addDays(p.starts_on as string, 0)
    if (end >= from) out.push({ type: 'promo', start: p.starts_on as string, end, name: p.name as string })
  }
  const leaveRows = leave.error ? [] : (leave.data ?? [])
  const names = await nameMap(leaveRows.map((l) => l.staff_id as string))
  for (const l of leaveRows) out.push({ type: 'leave', start: l.start_date as string, end: l.end_date as string, name: names.get(l.staff_id as string) ?? '—' })
  const perDay = new Map<string, Set<string>>()
  for (const s of shifts.error ? [] : (shifts.data ?? [])) {
    const d = s.work_date as string
    if (!perDay.has(d)) perDay.set(d, new Set())
    perDay.get(d)!.add(s.staff_id as string)
  }
  for (const [day, set] of perDay) out.push({ type: 'shifts', day, count: set.size })
  const bk = new Map<string, number>()
  for (const b of bookings.error ? [] : (bookings.data ?? [])) bk.set(b.day as string, (bk.get(b.day as string) ?? 0) + 1)
  for (const [day, count] of bk) out.push({ type: 'bookings', day, count })
  return out
}

// Members / website: what's coming up (members+public, or public only).
export async function upcomingOutside(viewer: Viewer, from: string, days: number, limit = 12): Promise<Occurrence[]> {
  const to = addDays(from, days)
  const items = await listItems(from, to).catch(() => null)
  if (!items) return []
  return visibleOccurrences(items, viewer, from, to, true).slice(0, limit)
}

// Team (My work / dashboard): items for staff or admins in the next days.
export async function upcomingTeam(viewer: Viewer, from: string, days: number, limit = 20): Promise<Occurrence[]> {
  const to = addDays(from, days)
  const items = await listItems(from, to).catch(() => null)
  if (!items) return []
  return visibleOccurrences(items, viewer, from, to).slice(0, limit)
}

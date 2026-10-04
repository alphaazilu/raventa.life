import { createAdminClient } from '@/lib/supabase/admin'
import type { LeaveBalance, LeaveKind, LeaveRequest, LeaveRules } from '@/lib/leave'
import { LEAVE_KINDS } from '@/lib/leave'

// Leave requests (schema.sql §25) — server-side reads with the service role.
// Callers decide who may see what (staff: their own; admins: everyone).

const COLS = 'id, staff_id, start_date, end_date, days, kind, reason, doc_path, status, decided_by, decided_at, decision_note, created_at'

type Row = {
  id: string
  staff_id: string
  start_date: string
  end_date: string
  days: number
  kind: LeaveKind
  reason: string | null
  doc_path: string | null
  status: LeaveRequest['status']
  decided_by: string | null
  decided_at: string | null
  decision_note: string | null
  created_at: string
}

async function names(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (!ids.length) return out
  const { data } = await createAdminClient().from('profiles').select('id, first_name, last_name').in('id', ids)
  for (const p of data ?? []) out.set(p.id, [p.first_name, p.last_name].filter(Boolean).join(' ') || '—')
  return out
}

async function toRequests(rows: Row[]): Promise<LeaveRequest[]> {
  const who = await names([...new Set(rows.flatMap((r) => [r.staff_id, r.decided_by]).filter((v): v is string => Boolean(v)))])
  return rows.map((r) => ({
    id: r.id,
    staffId: r.staff_id,
    staffName: who.get(r.staff_id) ?? '—',
    start: r.start_date,
    end: r.end_date,
    days: r.days,
    kind: r.kind,
    reason: r.reason,
    hasDoc: Boolean(r.doc_path),
    status: r.status,
    decidedBy: r.decided_by ? (who.get(r.decided_by) ?? '—') : null,
    decidedAt: r.decided_at,
    decisionNote: r.decision_note,
    createdAt: r.created_at,
  }))
}

// One person's requests: anything not finished yet plus this year's.
export async function listMyLeave(staffId: string, today: string): Promise<LeaveRequest[]> {
  const { data, error } = await createAdminClient()
    .from('leave_requests')
    .select(COLS)
    .eq('staff_id', staffId)
    .or(`end_date.gte.${today.slice(0, 4)}-01-01,status.eq.pending`)
    .order('start_date', { ascending: false })
    .limit(40)
  if (error) return []
  return toRequests((data ?? []) as Row[])
}

export async function leaveBalance(staffId: string, year: string, rules: LeaveRules): Promise<LeaveBalance> {
  const { data } = await createAdminClient()
    .from('leave_requests')
    .select('kind, days')
    .eq('staff_id', staffId)
    .in('status', ['pending', 'approved'])
    .gte('start_date', `${year}-01-01`)
    .lte('start_date', `${year}-12-31`)
  const out = Object.fromEntries(LEAVE_KINDS.map((k) => [k, { used: 0, quota: rules.quotas[k] }])) as LeaveBalance
  for (const r of data ?? []) out[r.kind as LeaveKind].used += Number(r.days)
  return out
}

// Admin: waiting requests first (soonest first), then the last 60 days of
// decided ones.
export async function listLeaveForAdmin(): Promise<{ pending: LeaveRequest[]; decided: LeaveRequest[] }> {
  const db = createAdminClient()
  const since = new Date(Date.now() - 60 * 86_400_000).toISOString()
  const [p, d] = await Promise.all([
    db.from('leave_requests').select(COLS).eq('status', 'pending').order('start_date').limit(100),
    db.from('leave_requests').select(COLS).neq('status', 'pending').gte('created_at', since).order('created_at', { ascending: false }).limit(100),
  ])
  if (p.error) return { pending: [], decided: [] }
  return { pending: await toRequests((p.data ?? []) as Row[]), decided: await toRequests((d.data ?? []) as Row[]) }
}

export async function countPendingLeave(): Promise<number> {
  const { count, error } = await createAdminClient()
    .from('leave_requests')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending')
  return error ? 0 : (count ?? 0)
}

// Approved leave of everyone overlapping a date range (for the roster and
// the "who else is off" check).
export async function approvedLeaveBetween(from: string, to: string): Promise<{ staffId: string; start: string; end: string; kind: LeaveKind }[]> {
  const { data, error } = await createAdminClient()
    .from('leave_requests')
    .select('staff_id, start_date, end_date, kind')
    .eq('status', 'approved')
    .lte('start_date', to)
    .gte('end_date', from)
  if (error) return []
  return (data ?? []).map((r) => ({ staffId: r.staff_id, start: r.start_date, end: r.end_date, kind: r.kind as LeaveKind }))
}

// Requests still waiting that overlap a date range (monthly roster).
export async function pendingLeaveBetween(from: string, to: string): Promise<{ staffId: string; start: string; end: string; kind: LeaveKind }[]> {
  const { data, error } = await createAdminClient()
    .from('leave_requests')
    .select('staff_id, start_date, end_date, kind')
    .eq('status', 'pending')
    .lte('start_date', to)
    .gte('end_date', from)
  if (error) return []
  return (data ?? []).map((r) => ({ staffId: r.staff_id, start: r.start_date, end: r.end_date, kind: r.kind as LeaveKind }))
}

// Admin view of one waiting request: per day, the shift they were down for,
// how many others are working, and who else is off.
export type LeaveDayCheck = { date: string; myShift: string | null; working: number; othersOff: string[] }

export async function checkLeaveDays(
  requests: LeaveRequest[],
  staff: { id: string; name: string }[],
): Promise<Record<string, LeaveDayCheck[]>> {
  const out: Record<string, LeaveDayCheck[]> = {}
  if (!requests.length) return out
  const from = requests.reduce((m, r) => (r.start < m ? r.start : m), requests[0].start)
  const to = requests.reduce((m, r) => (r.end > m ? r.end : m), requests[0].end)
  const db = createAdminClient()
  const [{ data: rows }, { data: tpl }, offLeave] = await Promise.all([
    db.from('shift_assignments').select('staff_id, work_date, template_id, day_off').gte('work_date', from).lte('work_date', to),
    db.from('shift_templates').select('id, name, start_time, end_time'),
    approvedLeaveBetween(from, to),
  ])
  const tName = new Map((tpl ?? []).map((t) => [t.id as string, `${t.name} ${String(t.start_time).slice(0, 5)}–${String(t.end_time).slice(0, 5)}`]))
  const nameOf = new Map(staff.map((s) => [s.id, s.name.split(' ')[0] || s.name]))
  for (const r of requests) {
    const list: LeaveDayCheck[] = []
    for (let d = r.start; d <= r.end && list.length < 60; d = new Date(Date.parse(`${d}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)) {
      const day = (rows ?? []).filter((a) => a.work_date === d)
      const mine = day.filter((a) => a.staff_id === r.staffId && a.template_id)
      const off = new Set<string>()
      for (const a of day) if (a.staff_id !== r.staffId && a.day_off) off.add(a.staff_id)
      for (const l of offLeave) if (l.staffId !== r.staffId && l.start <= d && l.end >= d) off.add(l.staffId)
      list.push({
        date: d,
        myShift: mine.length ? mine.map((a) => tName.get(a.template_id) ?? '?').join(' + ') : null,
        working: new Set(day.filter((a) => a.staff_id !== r.staffId && a.template_id && !off.has(a.staff_id)).map((a) => a.staff_id)).size,
        othersOff: [...off].map((id) => nameOf.get(id) ?? '—'),
      })
    }
    out[r.id] = list
  }
  return out
}

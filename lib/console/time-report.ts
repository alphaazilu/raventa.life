import { createAdminClient } from '@/lib/supabase/admin'
import { approvedLeaveBetween } from '@/lib/leave-server'
import { listEntries } from './time'
import { listPayTypes } from './team'
import { getTimeSettings, listAssignments, listHolidays, listTemplates } from './shifts'
import { DEFAULT_SETTINGS } from './shift-math'
import { plusDays } from './pay-cycle'
import { buildTimeReport, type TimeReport, type TRStaff } from './time-report-calc'

// Back Office › Reports › Time (v0.28). SERVER ONLY (service role) — the
// caller checks for an admin first.

const nameOf = (p: { first_name?: string | null; last_name?: string | null; email?: string | null }) =>
  [p.first_name, p.last_name].filter(Boolean).join(' ') || p.email || '—'

export async function loadTimeReport(from: string, to: string): Promise<TimeReport & { paySetUp: boolean }> {
  const after = plusDays(to, 1)
  const admin = createAdminClient()
  const [profiles, pay, entries, assignments, templates, rules, leave, holidays] = await Promise.all([
    admin.from('profiles').select('id, first_name, last_name, email, member_no, role').in('role', ['staff', 'admin']),
    listPayTypes(),
    listEntries(from, after),
    listAssignments(from, after).catch(() => []),
    listTemplates().catch(() => []),
    getTimeSettings().catch(() => DEFAULT_SETTINGS),
    approvedLeaveBetween(from, to),
    listHolidays(from, after),
  ])
  if (profiles.error) throw profiles.error

  // Staff always; admins only when they clocked in or were rostered.
  const active = new Set([...entries.map((e) => e.staffId), ...assignments.map((a) => a.staffId)])
  const staff: TRStaff[] = (profiles.data ?? [])
    .filter((p) => p.role === 'staff' || active.has(p.id as string))
    .map((p) => ({ id: p.id as string, name: nameOf(p), memberNo: (p.member_no as string | null) ?? null, payType: pay?.get(p.id as string) ?? null }))

  const report = buildTimeReport({
    from,
    to,
    now: Date.now(),
    staff,
    entries: entries.map((e) => ({ id: e.id, staffId: e.staffId, clockIn: e.clockIn, clockOut: e.clockOut, outMethod: e.outMethod, edited: e.edited })),
    assignments,
    templates,
    rules,
    leave,
    holidays,
  })
  return { ...report, paySetUp: pay !== null }
}

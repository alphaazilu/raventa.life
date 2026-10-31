import { createAdminClient } from '@/lib/supabase/admin'
import { isMissingTable } from '@/lib/console/db-errors'
import { addDays } from '@/lib/console/report-calc'
import { AUDIT_GROUPS, auditLabel, type AuditGroup } from '@/lib/console/copy'
import { isUuid } from '@/lib/console/audit-format'

// Audit log (v0.43.1): reading staff_actions — who did what, and when.
// SERVER ONLY (service role); the page and the export check for an admin
// first. Read only: nothing here writes or deletes a log row.

export type AuditFilters = {
  from: string // Bangkok day, inclusive
  to: string
  actor: string | null // profiles.id
  group: AuditGroup | null
  action: string | null // one code (wins over group)
  q: string
}

export type AuditRow = {
  id: number
  at: string
  action: string
  actorId: string | null
  actorName: string | null
  memberId: string | null
  memberName: string | null
  memberNo: string | null
  detail: Record<string, unknown>
}

export type AuditPage = { rows: AuditRow[]; hasMore: boolean }


const nameOf = (p: { first_name?: string | null; last_name?: string | null; email?: string | null }) =>
  [p.first_name, p.last_name].filter(Boolean).join(' ') || p.email || '—'

/** Strip what would break a PostgREST or() filter; keep it short. */
const clean = (q: string) => q.replace(/[,()*%:"'\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60)

/** People who can appear as "by": the team (anyone not a customer). */
export async function listActors(): Promise<{ id: string; name: string }[]> {
  const { data } = await createAdminClient()
    .from('profiles')
    .select('id, first_name, last_name, email, role')
    .neq('role', 'customer')
    .order('first_name', { ascending: true })
    .limit(500)
  return (data ?? []).map((p) => ({ id: p.id as string, name: nameOf(p) }))
}

/**
 * One page of the log, newest first. null = staff_actions can't be read
 * (not set up). The text search matches people (name, email, member no. —
 * as the one who did it or the member it was about), the action's label or
 * code, and the receipt no. / reason / name / title / note in its details.
 */
export async function listAudit(f: AuditFilters, offset: number, limit: number): Promise<AuditPage | null> {
  const db = createAdminClient()
  let query = db
    .from('staff_actions')
    .select('id, created_at, action, actor_id, member_id, detail')
    .gte('created_at', `${f.from}T00:00:00+07:00`)
    .lt('created_at', `${addDays(f.to, 1)}T00:00:00+07:00`)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })

  if (f.actor && isUuid(f.actor)) query = query.eq('actor_id', f.actor)
  if (f.action) query = query.eq('action', f.action)
  else if (f.group) query = query.in('action', Object.keys(AUDIT_GROUPS[f.group].actions))

  const q = clean(f.q)
  if (q) {
    const like = `*${q}*`
    const { data: people } = await db
      .from('profiles')
      .select('id')
      .or(`first_name.ilike.${like},last_name.ilike.${like},email.ilike.${like},member_no.ilike.${like}`)
      .limit(200)
    const ids = (people ?? []).map((p) => p.id as string)
    const lower = q.toLowerCase()
    const codes = Object.values(AUDIT_GROUPS)
      .flatMap((g) => Object.keys(g.actions))
      .filter((c) => c.includes(lower) || auditLabel(c).th.includes(q) || auditLabel(c).en.toLowerCase().includes(lower))
    const ors = [
      `action.ilike.${like}`,
      ...['receipt_no', 'reason', 'name', 'title', 'note'].map((k) => `detail->>${k}.ilike.${like}`),
    ]
    if (ids.length) ors.push(`actor_id.in.(${ids.join(',')})`, `member_id.in.(${ids.join(',')})`)
    if (codes.length) ors.push(`action.in.(${codes.join(',')})`)
    query = query.or(ors.join(','))
  }

  const { data, error } = await query.range(offset, offset + limit) // one extra → "older" exists
  if (error) {
    if (!isMissingTable(error)) console.error('audit read failed', error.message)
    return null
  }
  const list = data ?? []
  const page = list.slice(0, limit)

  // Names for the people on this page, in one request.
  const ids = [...new Set(page.flatMap((r) => [r.actor_id, r.member_id]).filter(isUuid))]
  const people = new Map<string, { name: string; memberNo: string | null }>()
  if (ids.length) {
    const { data: ps } = await db.from('profiles').select('id, first_name, last_name, email, member_no').in('id', ids)
    for (const p of ps ?? []) people.set(p.id as string, { name: nameOf(p), memberNo: (p.member_no as string | null) ?? null })
  }

  return {
    hasMore: list.length > limit,
    rows: page.map((r) => ({
      id: r.id as number,
      at: r.created_at as string,
      action: r.action as string,
      actorId: (r.actor_id as string | null) ?? null,
      actorName: r.actor_id ? (people.get(r.actor_id as string)?.name ?? null) : null,
      memberId: (r.member_id as string | null) ?? null,
      memberName: r.member_id ? (people.get(r.member_id as string)?.name ?? null) : null,
      memberNo: r.member_id ? (people.get(r.member_id as string)?.memberNo ?? null) : null,
      detail: r.detail && typeof r.detail === 'object' && !Array.isArray(r.detail) ? (r.detail as Record<string, unknown>) : {},
    })),
  }
}

/** The filters from the page's query string. */
export function auditFiltersFrom(q: Record<string, string | undefined>, period: { from: string; to: string }): AuditFilters {
  const t = q.t ?? ''
  const group = t.startsWith('g:') && t.slice(2) in AUDIT_GROUPS ? (t.slice(2) as AuditGroup) : null
  const action = t.startsWith('a:') && /^[a-z_]{1,60}$/.test(t.slice(2)) ? t.slice(2) : null
  return { from: period.from, to: period.to, actor: isUuid(q.actor) ? q.actor : null, group, action, q: (q.q ?? '').slice(0, 60) }
}

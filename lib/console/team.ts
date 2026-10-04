import { createAdminClient } from '@/lib/supabase/admin'
import type { Role } from '@/lib/auth/roles'

// Back Office › System › Team & roles (v0.27). Read with the service role;
// the page and actions check for an admin first.

export type Person = {
  id: string
  name: string
  email: string | null
  phone: string | null
  memberNo: string | null
  role: Role
  since: string | null // when they got this role (from the history), if known
}

export type RoleChange = { id: number; at: string; who: string; whom: string; whomId: string | null; from: Role; to: Role }

const nameOf = (p: { first_name?: string | null; last_name?: string | null; email?: string | null; member_no?: string | null }) =>
  [p.first_name, p.last_name].filter(Boolean).join(' ') || p.email || p.member_no || '—'

const COLS = 'id, first_name, last_name, email, phone, member_no, role'

type ProfileRow = { id: string; first_name: string | null; last_name: string | null; email: string | null; phone: string | null; member_no: string | null; role: Role }

const toPerson = (r: ProfileRow, since: string | null = null): Person => ({
  id: r.id,
  name: nameOf(r),
  email: r.email,
  phone: r.phone,
  memberNo: r.member_no,
  role: r.role,
  since,
})

export async function roleHistory(limit = 50): Promise<RoleChange[]> {
  const db = createAdminClient()
  const { data } = await db
    .from('staff_actions')
    .select('id, created_at, actor_id, member_id, detail')
    .eq('action', 'role_change')
    .order('created_at', { ascending: false })
    .limit(limit)
  const rows = data ?? []
  const ids = [...new Set(rows.flatMap((r) => [r.actor_id, r.member_id]).filter((v): v is string => Boolean(v)))]
  const names = new Map<string, string>()
  if (ids.length) {
    const { data: people } = await db.from('profiles').select('id, first_name, last_name, email, member_no').in('id', ids)
    for (const p of people ?? []) names.set(p.id, nameOf(p))
  }
  return rows.map((r) => {
    const d = (r.detail ?? {}) as { from?: Role; to?: Role }
    return {
      id: r.id as number,
      at: r.created_at as string,
      who: (r.actor_id && names.get(r.actor_id)) || '—',
      whom: (r.member_id && names.get(r.member_id)) || '—',
      whomId: r.member_id as string | null,
      from: d.from ?? 'customer',
      to: d.to ?? 'customer',
    }
  })
}

// Admins first, then staff.
export async function listTeam(history: RoleChange[]): Promise<Person[]> {
  const { data } = await createAdminClient().from('profiles').select(COLS).in('role', ['admin', 'staff']).order('first_name')
  const since = new Map<string, string>()
  for (const h of history) if (h.whomId && !since.has(h.whomId)) since.set(h.whomId, h.at)
  return ((data ?? []) as ProfileRow[])
    .map((r) => toPerson(r, since.get(r.id) ?? null))
    .sort((a, b) => (a.role === b.role ? a.name.localeCompare(b.name) : a.role === 'admin' ? -1 : 1))
}

// Find members to add to the team: name, email, phone or member number.
export async function searchPeople(raw: string): Promise<Person[]> {
  const q = raw.replace(/[,()*%\\]/g, ' ').trim()
  if (q.length < 2) return []
  const like = `%${q}%`
  const digits = q.replace(/\D/g, '')
  const ors = [`first_name.ilike.${like}`, `last_name.ilike.${like}`, `email.ilike.${like}`, `member_no.ilike.${like}`]
  if (digits.length >= 3) ors.push(`phone.ilike.%${digits}%`)
  const { data } = await createAdminClient().from('profiles').select(COLS).or(ors.join(',')).order('first_name').limit(12)
  return ((data ?? []) as ProfileRow[]).map((r) => toPerson(r))
}

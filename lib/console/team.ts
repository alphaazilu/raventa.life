import { createAdminClient } from '@/lib/supabase/admin'
import type { Role } from '@/lib/auth/roles'
import { resolveAvatarUrl } from '@/lib/supabase/avatar'
import { isMissingTable } from '@/lib/console/db-errors'
import type { PayType } from '@/lib/console/pay-cycle'

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
  avatarUrl?: string | null // look-ups only (the add-to-team station)
  payType?: PayType | null // §28: paid by the day or the month; null = not set yet
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

// Each person's pay type (§28); null until that SQL is run.
export async function listPayTypes(): Promise<Map<string, PayType> | null> {
  const { data, error } = await createAdminClient().from('staff_pay').select('staff_id, pay_type')
  if (error) {
    if (!isMissingTable(error)) console.error('staff_pay load failed', error.code)
    return null
  }
  return new Map((data ?? []).map((r) => [r.staff_id as string, r.pay_type as PayType]))
}

async function payTypeOf(id: string): Promise<PayType | null> {
  const { data } = await createAdminClient().from('staff_pay').select('pay_type').eq('staff_id', id).maybeSingle()
  return (data?.pay_type as PayType | undefined) ?? null
}

// Admins first, then staff.
export async function listTeam(history: RoleChange[], pay: Map<string, PayType> | null = null): Promise<Person[]> {
  const { data } = await createAdminClient().from('profiles').select(COLS).in('role', ['admin', 'staff']).order('first_name')
  const since = new Map<string, string>()
  for (const h of history) if (h.whomId && !since.has(h.whomId)) since.set(h.whomId, h.at)
  return ((data ?? []) as ProfileRow[])
    .map((r) => ({ ...toPerson(r, since.get(r.id) ?? null), payType: pay?.get(r.id) ?? null }))
    .sort((a, b) => (a.role === b.role ? a.name.localeCompare(b.name) : a.role === 'admin' ? -1 : 1))
}

// Contact details shown half-hidden in look-ups: k•••@gmail.com, 08•-•••-1234.
export function maskEmail(e: string | null): string | null {
  if (!e) return null
  const [u, d] = e.split('@')
  return d ? `${u.slice(0, 1)}•••@${d}` : '•••'
}
export function maskPhone(p: string | null): string | null {
  if (!p) return null
  const digits = p.replace(/\D/g, '')
  return digits.length >= 4 ? `${digits.slice(0, 2)}•-•••-${digits.slice(-4)}` : '•••'
}
const masked = (x: Person): Person => ({ ...x, email: maskEmail(x.email), phone: maskPhone(x.phone) })

// Local Thai number from whatever was typed or stored: +66 81… → 081…
const phoneKey = (v: string) => {
  const d = v.replace(/\D/g, '')
  return d.startsWith('66') && d.length === 11 ? `0${d.slice(2)}` : d
}

// Add-to-team look-up (v0.27.1): one exact member number, full email or
// full phone number — no partial names, so it can't be used to browse
// the members. At most one person comes back, contacts half-hidden.
export async function findExact(raw: string): Promise<Person | null> {
  const q = raw.trim()
  if (q.length < 4) return null
  const db = createAdminClient()
  let rows: ProfileRow[] = []
  if (q.includes('@')) {
    const { data } = await db.from('profiles').select(COLS).ilike('email', q.replace(/[%_\\]/g, '')).limit(2)
    rows = (data ?? []) as ProfileRow[]
  } else if (/^[+\d\s()-]+$/.test(q) && phoneKey(q).length >= 9) {
    const key = phoneKey(q)
    const { data } = await db.from('profiles').select(COLS).ilike('phone', `%${key.slice(-4)}%`).limit(50)
    rows = ((data ?? []) as ProfileRow[]).filter((r) => r.phone && phoneKey(r.phone) === key)
  } else {
    const { data } = await db.from('profiles').select(COLS).ilike('member_no', q.replace(/[%_\\]/g, '')).limit(2)
    rows = (data ?? []) as ProfileRow[]
  }
  return rows.length === 1 ? withAvatar(rows[0].id, masked(toPerson(rows[0]))) : null
}

// The person's photo for the round frame (uploaded, else LINE/Google).
async function withAvatar(id: string, p: Person): Promise<Person> {
  const db = createAdminClient()
  const { data } = await db.from('profiles').select('avatar_path, provider_avatar_url').eq('id', id).maybeSingle()
  const [avatarUrl, payType] = await Promise.all([
    resolveAvatarUrl(db as unknown as Parameters<typeof resolveAvatarUrl>[0], data).catch(() => null),
    payTypeOf(id).catch(() => null),
  ])
  return { ...p, avatarUrl, payType }
}

export async function personById(id: string): Promise<Person | null> {
  const { data } = await createAdminClient().from('profiles').select(COLS).eq('id', id).maybeSingle()
  return data ? withAvatar(id, masked(toPerson(data as ProfileRow))) : null
}

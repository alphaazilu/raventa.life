import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { AdminView, type AdminMember } from '@/components/admin/admin-view'
import { getConsoleSession } from '@/lib/console/session'
import { resolveAvatarUrls } from '@/lib/supabase/avatar'
import { canUseDesk, DESK_PATH, MEMBERS_PATH } from '@/lib/auth/roles'
import { getCurrentDevice } from '@/lib/console/device'
import { getAppSettings } from '@/lib/console/settings'
import { createAdminClient } from '@/lib/supabase/admin'

export const metadata: Metadata = {
  title: 'ข้อมูลลูกค้า | RAVENTA Back Office',
}

const RESULT_LIMIT = 50

// Members (v0.20.4): nothing is listed until someone searches — the page
// never sends the whole member list to a screen (or a tablet).
export default async function MembersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { supabase, user, role } = await getConsoleSession()

  if (!user) redirect(`/login?next=${MEMBERS_PATH}`)

  // Admins: search everything, editable. Staff: view only, and only on a
  // registered counter tablet (Vault R2) — profiles are admin-only under
  // RLS, so read them with the service-role client and leave out email.
  const admin = role === 'admin'
  if (!admin && !(canUseDesk(role) && (await getCurrentDevice().catch(() => null)))) redirect(DESK_PATH)
  if (!admin && !(await getAppSettings()).staffMembersOnTablet) redirect(DESK_PATH)
  const db = admin ? supabase : createAdminClient()

  const query = ((await searchParams).q ?? '').trim().slice(0, 60)
  const { count: total } = await db.from('profiles').select('id', { count: 'exact', head: true })

  let members: Record<string, unknown>[] = []
  const filter = searchFilter(query, admin)
  if (filter) {
    const { data } = await db
      .from('profiles')
      .select('id, member_no, first_name, last_name, email, phone, province, nationality, role, avatar_path, provider_avatar_url')
      .or(filter)
      .order('member_no', { ascending: true })
      .limit(RESULT_LIMIT)
    members = data ?? []
  }

  // Uploaded photos live in a private bucket — sign them in one request.
  const avatarUrls = await resolveAvatarUrls(db, members as { id: string; avatar_path: string | null; provider_avatar_url: string | null }[])
  const results = members.map(({ avatar_path: _a, provider_avatar_url: _p, ...m }) => ({
    ...(m as Omit<AdminMember, 'avatar_url'>),
    email: admin ? (m.email as string | null) : maskEmail(m.email as string | null),
    avatar_url: avatarUrls[m.id as string] ?? null,
  }))

  return (
    <main>
      <AdminView
        members={results}
        total={total ?? 0}
        query={query}
        searched={Boolean(filter)}
        limited={results.length >= RESULT_LIMIT}
        readOnly={!admin}
      />
    </main>
  )
}

// PostgREST "or" filter for a search box: phone / member number for digits,
// name (and email, admins only) for text. Only safe characters get through.
function searchFilter(q: string, withEmail: boolean): string | null {
  const digits = q.replace(/\D/g, '')
  if (digits && digits.length === q.replace(/[\s-]/g, '').length) {
    if (digits.length < 3) return null
    return [`phone.ilike.%${digits}%`, `member_no.ilike.%${digits}%`].join(',')
  }
  const text = q.replace(/[^\p{L}\p{N} @._-]/gu, '').trim()
  if (text.length < 2) return null
  const parts = [`first_name.ilike.%${text}%`, `last_name.ilike.%${text}%`]
  if (withEmail) parts.push(`email.ilike.%${text}%`)
  return parts.join(',')
}

function maskEmail(email: string | null): string | null {
  if (!email) return email
  const [local, domain] = email.split('@')
  if (!domain) return email
  return `${local.slice(0, 2)}${'•'.repeat(Math.max(local.length - 2, 3))}@${domain}`
}

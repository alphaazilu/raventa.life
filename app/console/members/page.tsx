import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { AdminView } from '@/components/admin/admin-view'
import { getConsoleSession } from '@/lib/console/session'
import { resolveAvatarUrls } from '@/lib/supabase/avatar'
import { canUseDesk, DESK_PATH, MEMBERS_PATH } from '@/lib/auth/roles'
import { getCurrentDevice } from '@/lib/console/device'
import { createAdminClient } from '@/lib/supabase/admin'

export const metadata: Metadata = {
  title: 'ข้อมูลลูกค้า | RAVENTA Back Office',
}

export default async function MembersPage() {
  const { supabase, user, role } = await getConsoleSession()

  if (!user) redirect(`/login?next=${MEMBERS_PATH}`)

  // Admins: everything, editable. Staff: the list, view only, and only on a
  // registered counter tablet (Vault R2) — profiles are admin-only under
  // RLS, so read them with the service-role client and leave out email.
  const admin = role === 'admin'
  if (!admin && !(canUseDesk(role) && (await getCurrentDevice().catch(() => null)))) redirect(DESK_PATH)
  const db = admin ? supabase : createAdminClient()

  const { data: members } = await db
    .from('profiles')
    .select('id, member_no, first_name, last_name, email, phone, province, nationality, role, avatar_path, provider_avatar_url')
    .order('member_no', { ascending: true })

  // Uploaded photos live in a private bucket — sign them all in one request
  // (admins are allowed to read every member's photo).
  const avatarUrls = await resolveAvatarUrls(db, members ?? [])
  const membersWithAvatars = (members ?? []).map(({ avatar_path, provider_avatar_url, ...m }) => ({
    ...m,
    email: admin ? m.email : maskEmail(m.email),
    avatar_url: avatarUrls[m.id] ?? null,
  }))

  return (
    <main>
      <AdminView members={membersWithAvatars} readOnly={!admin} />
    </main>
  )
}

function maskEmail(email: string | null): string | null {
  if (!email) return email
  const [local, domain] = email.split('@')
  if (!domain) return email
  return `${local.slice(0, 2)}${'•'.repeat(Math.max(local.length - 2, 3))}@${domain}`
}

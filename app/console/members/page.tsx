import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { AdminView } from '@/components/admin/admin-view'
import { createClient } from '@/lib/supabase/server'
import { resolveAvatarUrls } from '@/lib/supabase/avatar'
import { MEMBERS_PATH } from '@/lib/auth/roles'

export const metadata: Metadata = {
  title: 'ข้อมูลลูกค้า | RAVENTA Back Office',
}

export default async function MembersPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect(`/login?next=${MEMBERS_PATH}`)

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (profile?.role !== 'admin') redirect('/account')

  const { data: members } = await supabase
    .from('profiles')
    .select('id, member_no, first_name, last_name, email, phone, province, nationality, role, avatar_path, provider_avatar_url')
    .order('member_no', { ascending: true })

  // Uploaded photos live in a private bucket — sign them all in one request
  // (admins are allowed to read every member's photo).
  const avatarUrls = await resolveAvatarUrls(supabase, members ?? [])
  const membersWithAvatars = (members ?? []).map(({ avatar_path, provider_avatar_url, ...m }) => ({
    ...m,
    avatar_url: avatarUrls[m.id] ?? null,
  }))

  return (
    <main>
      <AdminView members={membersWithAvatars} />
    </main>
  )
}

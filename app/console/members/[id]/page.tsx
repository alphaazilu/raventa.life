import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { MemberEditForm } from '@/components/admin/member-edit-form'
import { getConsoleSession } from '@/lib/console/session'
import { DESK_PATH, MEMBERS_PATH } from '@/lib/auth/roles'

export const metadata: Metadata = {
  title: 'แก้ไขข้อมูลสมาชิก | RAVENTA Back Office',
}

export default async function EditMemberPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { supabase, user, role } = await getConsoleSession()

  if (!user) redirect(`/login?next=${MEMBERS_PATH}/${id}`)

  if (role !== 'admin') redirect(DESK_PATH)

  const { data: member } = await supabase
    .from('profiles')
    .select('id, member_no, first_name, last_name, email, phone, province, nationality')
    .eq('id', id)
    .single()

  if (!member) notFound()

  return (
    <main>
      <MemberEditForm member={member} />
    </main>
  )
}

import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { MemberEditForm } from '@/components/admin/member-edit-form'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = {
  title: 'Edit Member | RAVENTA Wellness Center',
}

export default async function EditMemberPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login?next=/admin')

  const { data: adminProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (adminProfile?.role !== 'admin') redirect('/account')

  const { data: member } = await supabase
    .from('profiles')
    .select('id, member_no, first_name, last_name, email, phone, province, nationality')
    .eq('id', id)
    .single()

  if (!member) notFound()

  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-background pt-24 md:pt-28">
        <MemberEditForm member={member} />
      </main>
      <SiteFooter />
    </>
  )
}

import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { AdminView } from '@/components/admin/admin-view'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = {
  title: 'Admin | RAVENTA Wellness Center',
}

export default async function AdminPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login?next=/admin')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/account')

  const { data: members } = await supabase
    .from('profiles')
    .select('id, member_no, first_name, last_name, email, phone, province, role')
    .order('member_no', { ascending: true })

  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-background pt-24 md:pt-28">
        <AdminView email={user.email ?? ''} members={members ?? []} />
      </main>
      <SiteFooter />
    </>
  )
}

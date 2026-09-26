import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { AccountView } from '@/components/account/account-view'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/login/actions'

export const metadata: Metadata = {
  title: 'My Account | RAVENTA Wellness Center',
}

export default async function AccountPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login?next=/account')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, first_name, last_name, phone, province, nationality, member_no')
    .eq('id', user.id)
    .single()

  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-background pt-24 md:pt-28">
        <AccountView
          email={user.email ?? ''}
          firstName={profile?.first_name ?? null}
          lastName={profile?.last_name ?? null}
          phone={profile?.phone ?? null}
          province={profile?.province ?? null}
          nationality={profile?.nationality ?? null}
          role={profile?.role ?? 'customer'}
          memberNo={profile?.member_no ?? null}
          signOutAction={signOut}
        />
      </main>
      <SiteFooter />
    </>
  )
}

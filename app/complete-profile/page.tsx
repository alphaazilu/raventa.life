import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { CompleteProfileForm } from '@/components/complete-profile/complete-profile-form'
import { createClient } from '@/lib/supabase/server'
import { isProfileComplete } from '@/lib/supabase/profile'

export const metadata: Metadata = {
  title: 'Complete Your Profile | RAVENTA Wellness Center',
}

export default async function CompleteProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const params = await searchParams
  const next = params.next && params.next.startsWith('/') ? params.next : '/account'

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login?next=/complete-profile')

  const { data: profile } = await supabase
    .from('profiles')
    .select('first_name, last_name, phone, province')
    .eq('id', user.id)
    .single()

  // Already filled in (e.g. they came back here by mistake) — nothing to do.
  if (isProfileComplete(profile)) redirect(next)

  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-background pt-24 md:pt-28">
        <CompleteProfileForm
          next={next}
          defaultFirstName={profile?.first_name ?? ''}
          defaultLastName={profile?.last_name ?? ''}
        />
      </main>
      <SiteFooter />
    </>
  )
}

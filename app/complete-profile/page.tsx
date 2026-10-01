import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { CompleteProfileForm } from '@/components/complete-profile/complete-profile-form'
import { createClient } from '@/lib/supabase/server'
import { isProfileComplete, PROFILE_COMPLETENESS_COLUMNS } from '@/lib/supabase/profile'

export const metadata: Metadata = {
  title: 'Complete Your Profile | RAVENTA Wellness Retreat',
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
    .select(PROFILE_COMPLETENESS_COLUMNS)
    .eq('id', user.id)
    .maybeSingle()

  // Only accounts that came in without an email (LINE, usually) are asked
  // for one. Everyone else's email is the one they log in with, which is
  // copied into profiles automatically — see completeProfile().
  const needsEmail = !user.email

  // Already filled in (e.g. they came back here by mistake) — nothing to do.
  if (isProfileComplete(profile)) redirect(next)

  // A LINE sign-in that isn't a membership yet (and hasn't started signing
  // up): ask whether they're already a member before creating a new one.
  const lineOnly = (user.identities ?? []).length > 0 && (user.identities ?? []).every((i) => i.provider === 'custom:line')
  const askExisting = needsEmail && lineOnly && !profile?.phone

  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-background pt-24 md:pt-28">
        <CompleteProfileForm
          next={next}
          needsEmail={needsEmail}
          askExisting={askExisting}
          defaultEmail={needsEmail ? (profile?.email ?? '') : ''}
          defaultFirstName={profile?.first_name ?? ''}
          defaultLastName={profile?.last_name ?? ''}
          defaultPhone={profile?.phone ?? ''}
          defaultProvince={profile?.province ?? ''}
          defaultNationality={profile?.nationality ?? ''}
        />
      </main>
      <SiteFooter />
    </>
  )
}

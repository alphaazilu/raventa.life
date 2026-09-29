import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { AccountView } from '@/components/account/account-view'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/login/actions'
import { lineUserIdOf } from '@/lib/supabase/line'
import { resolveAvatarUrl } from '@/lib/supabase/avatar'
import type { LinkLineResult } from '@/components/account/link-line'

export const metadata: Metadata = {
  title: 'My Account | RAVENTA Wellness Center',
}

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ linked?: string; link_error?: string; card?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect(`/login?next=${encodeURIComponent(params.card === '1' ? '/account?card=1' : '/account')}`)

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, email, first_name, last_name, phone, province, nationality, member_no, avatar_path, provider_avatar_url')
    .eq('id', user.id)
    .maybeSingle()

  const avatarUrl = await resolveAvatarUrl(supabase, profile)
  const lineLinked = lineUserIdOf(user) !== null
  // Only email/password sign-ups have a password to change; LINE- or
  // Google-only accounts would just be sent to a form that can't help.
  const hasPassword = user.identities?.some((i) => i.provider === 'email') ?? false
  // Outcome of the "link LINE" round trip (see components/account/link-line
  // and app/auth/callback). identity_already_exists = that LINE account
  // already belongs to a separate membership.
  const linkResult: LinkLineResult = params.link_error
    ? params.link_error === 'identity_already_exists'
      ? 'already_used'
      : 'failed'
    : params.linked === 'line' && lineLinked
      ? 'linked'
      : null

  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-background pt-24 md:pt-28">
        <AccountView
          // LINE members have no login email (Supabase gives ""), so fall
          // back to the one they typed on /complete-profile.
          email={user.email || profile?.email || ''}
          firstName={profile?.first_name ?? null}
          lastName={profile?.last_name ?? null}
          phone={profile?.phone ?? null}
          province={profile?.province ?? null}
          nationality={profile?.nationality ?? null}
          role={profile?.role ?? 'customer'}
          memberNo={profile?.member_no ?? null}
          signOutAction={signOut}
          lineLinked={lineLinked}
          hasPassword={hasPassword}
          userId={user.id}
          avatarUrl={avatarUrl}
          hasUploadedAvatar={Boolean(profile?.avatar_path)}
          lineLinkResult={linkResult}
          // /account?card=1 (the LINE rich menu's member card button) opens
          // the check-in QR straight away.
          openCardOnLoad={params.card === '1'}
        />
      </main>
      <SiteFooter />
    </>
  )
}

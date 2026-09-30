import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { AccountSettingsView } from '@/components/account/account-view'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/login/actions'
import { lineUserIdOf } from '@/lib/supabase/line'
import { resolveAvatarUrl } from '@/lib/supabase/avatar'
import type { LinkProvider, LinkResult } from '@/components/account/link-line'
import { headers } from 'next/headers'

export const metadata: Metadata = {
  title: 'Settings | RAVENTA Wellness Retreat',
}

export default async function AccountSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ linked?: string; link_error?: string; link?: string; setup?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect(`/login?next=${encodeURIComponent('/account/settings')}`)

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, email, first_name, last_name, phone, province, nationality, avatar_path, provider_avatar_url, created_at, has_password')
    .eq('id', user.id)
    .maybeSingle()

  const avatarUrl = await resolveAvatarUrl(supabase, profile)
  const lineLinked = lineUserIdOf(user) !== null
  // Only email/password sign-ups have a password to change; LINE- or
  // Google-only accounts would just be sent to a form that can't help.
  const hasPassword =
    (user.identities?.some((i) => i.provider === 'email') ?? false) || Boolean(profile?.has_password)
  const google = user.identities?.find((i) => i.provider === 'google')
  const googleEmail = typeof google?.identity_data?.email === 'string' ? google.identity_data.email : null
  // Outcome of the "link LINE" round trip (see components/account/link-line
  // and app/auth/callback). identity_already_exists = that LINE account
  // already belongs to a separate membership.
  const provider: LinkProvider = (params.link ?? params.linked) === 'google' ? 'google' : 'line'
  const linkedNow = provider === 'google' ? Boolean(google) : lineLinked
  const linkResult: LinkResult = params.link_error
    ? { provider, result: params.link_error === 'identity_already_exists' ? 'already_used' : 'failed' }
    : params.linked && linkedNow
      ? { provider, result: 'linked' }
      : null
  // Google won't sign in inside LINE's in-app browser (see app/login/page).
  const inLineApp = /\bLine\/\d/i.test((await headers()).get('user-agent') ?? '')

  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-background pt-20 md:pt-24">
        <AccountSettingsView
          // LINE members have no login email (Supabase gives ""), so fall
          // back to the one they typed on /complete-profile.
          email={user.email || profile?.email || ''}
          firstName={profile?.first_name ?? null}
          lastName={profile?.last_name ?? null}
          phone={profile?.phone ?? null}
          province={profile?.province ?? null}
          nationality={profile?.nationality ?? null}
          role={profile?.role ?? 'customer'}
          signOutAction={signOut}
          lineLinked={lineLinked}
          hasPassword={hasPassword}
          userId={user.id}
          avatarUrl={avatarUrl}
          hasUploadedAvatar={Boolean(profile?.avatar_path)}
          linkResult={linkResult}
          authEmail={user.email || null}
          inLineApp={inLineApp}
          openEmailSetup={params.setup === 'email'}
          googleLinked={Boolean(google)}
          googleEmail={googleEmail}
          joinedAt={profile?.created_at ?? null}
        />
      </main>
      <SiteFooter />
    </>
  )
}

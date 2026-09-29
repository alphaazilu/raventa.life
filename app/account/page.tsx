import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { AccountHome } from '@/components/account/account-home'
import { createClient } from '@/lib/supabase/server'
import { resolveAvatarUrl } from '@/lib/supabase/avatar'

export const metadata: Metadata = {
  title: 'My Account | RAVENTA Wellness Center',
}

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ linked?: string; link_error?: string; card?: string }>
}) {
  const params = await searchParams

  // The "link LINE" round trip used to land here; it now belongs on the
  // settings page (older links, and the merge flow, still say /account).
  if (params.linked || params.link_error) {
    const qs = new URLSearchParams()
    if (params.linked) qs.set('linked', params.linked)
    if (params.link_error) qs.set('link_error', params.link_error)
    redirect(`/account/settings?${qs.toString()}`)
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect(`/login?next=${encodeURIComponent(params.card === '1' ? '/account?card=1' : '/account')}`)

  const { data: profile } = await supabase
    .from('profiles')
    .select('email, first_name, last_name, member_no, avatar_path, provider_avatar_url, created_at')
    .eq('id', user.id)
    .maybeSingle()

  const avatarUrl = await resolveAvatarUrl(supabase, profile)
  const fullName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ')

  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-background pt-24 md:pt-28">
        <AccountHome
          name={fullName || user.email || profile?.email || '—'}
          memberNo={profile?.member_no ?? null}
          avatarUrl={avatarUrl}
          joinedAt={profile?.created_at ?? null}
          // /account?card=1 (the LINE rich menu's member card button) opens
          // the check-in QR straight away.
          openCardOnLoad={params.card === '1'}
        />
      </main>
      <SiteFooter />
    </>
  )
}

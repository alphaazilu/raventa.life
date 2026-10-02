import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { createClient } from '@/lib/supabase/server'
import { LoginForm } from './login-form'
import { LineAutoLogin } from '@/components/auth/line-auto-login'
import { TabletSetupHint } from '@/components/console/tablet-setup-hint'

export const metadata: Metadata = {
  title: 'Log In | RAVENTA Wellness Retreat',
  description: 'Log in or create a RAVENTA account.',
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; via?: string }>
}) {
  const params = await searchParams
  const next = params.next && params.next.startsWith('/') ? params.next : '/account'
  // Set by app/auth/callback when a Google/LINE/email-confirm round trip
  // fails. Only the kind of failure is used — the raw value is never shown.
  const authError = params.error
    ? params.error === 'access_denied'
      ? 'cancelled'
      : params.error === 'google_existing'
        ? 'google_existing'
        : 'failed'
    : undefined

  // /login?via=line is the link behind the LINE OA rich menu. It opens in
  // LINE's in-app browser, where LINE Login signs the person in with no
  // typing and no app switch — so start that straight away instead of
  // making them tap the LINE button. Never after a failed attempt (error
  // is set), or a failure would just loop back into another attempt.
  const viaLine = params.via === 'line' && !authError
  if (viaLine) {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    // Already signed in: a returning member tapping the rich menu wants
    // their membership, not a login screen.
    if (user) redirect(next)
  }

  // No site header/footer here: this screen is on-screen for a second or
  // two inside LINE, and a full website menu only adds noise.
  if (viaLine) {
    return (
      <main className="min-h-screen bg-background">
        <LineAutoLogin next={next} />
      </main>
    )
  }

  // Google refuses to sign anyone in from inside another app's browser
  // (error "disallowed_useragent"), and LINE's in-app browser is one of
  // those — so there the Google button would only ever fail. Hide it inside
  // LINE; LINE and email/password stay. Opened directly in Safari/Chrome or
  // on a computer, every option shows.
  const userAgent = (await headers()).get('user-agent') ?? ''
  const inLineApp = /\bLine\/\d/i.test(userAgent)

  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-background pt-24 md:pt-28">
        {next.startsWith('/console') && <TabletSetupHint />}
        <LoginForm next={next} authError={authError} hideGoogle={inLineApp} />
      </main>
      <SiteFooter />
    </>
  )
}

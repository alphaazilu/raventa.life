import type { Metadata } from 'next'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { LoginForm } from './login-form'

export const metadata: Metadata = {
  title: 'Log In | RAVENTA Wellness Center',
  description: 'Log in or create a RAVENTA account.',
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>
}) {
  const params = await searchParams
  const next = params.next && params.next.startsWith('/') ? params.next : '/account'
  // Set by app/auth/callback when a Google/LINE/email-confirm round trip
  // fails. Only the kind of failure is used — the raw value is never shown.
  const authError = params.error ? (params.error === 'access_denied' ? 'cancelled' : 'failed') : undefined

  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-background pt-24 md:pt-28">
        <LoginForm next={next} authError={authError} />
      </main>
      <SiteFooter />
    </>
  )
}
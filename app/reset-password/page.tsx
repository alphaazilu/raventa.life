import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { ResetPasswordForm } from '@/components/auth/reset-password-form'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = {
  title: 'Set New Password | RAVENTA Wellness Center',
}

export default async function ResetPasswordPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Reachable two ways: the temporary session from a reset-link click, or
  // an already-logged-in user who just wants to change their password.
  // Either way, no session at all means there's nothing to act on here.
  if (!user) redirect('/forgot-password')

  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-background pt-24 md:pt-28">
        <ResetPasswordForm />
      </main>
      <SiteFooter />
    </>
  )
}

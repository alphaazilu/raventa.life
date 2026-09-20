import type { Metadata } from 'next'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { ForgotPasswordForm } from '@/components/auth/forgot-password-form'

export const metadata: Metadata = {
  title: 'Reset Password | RAVENTA Wellness Center',
}

export default function ForgotPasswordPage() {
  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-background pt-24 md:pt-28">
        <ForgotPasswordForm />
      </main>
      <SiteFooter />
    </>
  )
}

import type { Metadata } from 'next'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { ForgotPasswordForm } from '@/components/auth/forgot-password-form'
import { getBrandInfo } from '@/lib/brand/settings'

export async function generateMetadata(): Promise<Metadata> {
  const brand = await getBrandInfo()
  return {
    title: `Reset Password | ${brand.fullName}`,
  }
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

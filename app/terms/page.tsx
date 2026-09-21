import type { Metadata } from 'next'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { LegalPage } from '@/components/legal/legal-page'
import { termsUpdated, termsSections } from '@/lib/legal/content'

export const metadata: Metadata = {
  title: 'ข้อกำหนดการใช้งาน | RAVENTA Wellness Center',
  description: 'ข้อกำหนดการใช้งานของ RAVENTA Wellness Center — Terms of Service for RAVENTA Wellness Center.',
}

export default function TermsOfServicePage() {
  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-background pt-24 md:pt-28">
        <LegalPage
          heading={{ th: 'ข้อกำหนดการใช้งาน', en: 'Terms of Service' }}
          updated={termsUpdated}
          sections={termsSections}
        />
      </main>
      <SiteFooter />
    </>
  )
}

import type { Metadata } from 'next'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { LegalPage } from '@/components/legal/legal-page'
import { termsUpdated, termsSections } from '@/lib/legal/content'
import { BRAND } from '@/lib/brand/config'

export const metadata: Metadata = {
  title: `ข้อกำหนดการใช้งาน | ${BRAND.fullName}`,
  description: `ข้อกำหนดการใช้งานของ ${BRAND.fullName} — Terms of Service for ${BRAND.fullName}.`,
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

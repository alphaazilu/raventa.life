import type { Metadata } from 'next'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { LegalPage } from '@/components/legal/legal-page'
import { privacyPolicyUpdated, privacyPolicySections } from '@/lib/legal/content'
import { BRAND } from '@/lib/brand/config'

export const metadata: Metadata = {
  title: `นโยบายความเป็นส่วนตัว | ${BRAND.fullName}`,
  description: `นโยบายความเป็นส่วนตัวของ ${BRAND.fullName} — Privacy Policy for ${BRAND.fullName}.`,
}

export default function PrivacyPolicyPage() {
  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-background pt-24 md:pt-28">
        <LegalPage
          heading={{ th: 'นโยบายความเป็นส่วนตัว', en: 'Privacy Policy' }}
          updated={privacyPolicyUpdated}
          sections={privacyPolicySections}
        />
      </main>
      <SiteFooter />
    </>
  )
}

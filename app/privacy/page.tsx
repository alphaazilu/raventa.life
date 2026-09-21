import type { Metadata } from 'next'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { LegalPage } from '@/components/legal/legal-page'
import { privacyPolicyUpdated, privacyPolicySections } from '@/lib/legal/content'

export const metadata: Metadata = {
  title: 'นโยบายความเป็นส่วนตัว | RAVENTA Wellness Center',
  description: 'นโยบายความเป็นส่วนตัวของ RAVENTA Wellness Center — Privacy Policy for RAVENTA Wellness Center.',
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

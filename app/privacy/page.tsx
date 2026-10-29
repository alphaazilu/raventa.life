import type { Metadata } from 'next'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { LegalPage } from '@/components/legal/legal-page'
import { privacyPolicyUpdated, privacyPolicySections } from '@/lib/legal/content'
import { getBrandInfo } from '@/lib/brand/settings'

export async function generateMetadata(): Promise<Metadata> {
  const brand = await getBrandInfo()
  return {
    title: `นโยบายความเป็นส่วนตัว | ${brand.fullName}`,
    description: `นโยบายความเป็นส่วนตัวของ ${brand.fullName} — Privacy Policy for ${brand.fullName}.`,
  }
}

export default async function PrivacyPolicyPage() {
  const brand = await getBrandInfo()
  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-background pt-24 md:pt-28">
        <LegalPage
          heading={{ th: 'นโยบายความเป็นส่วนตัว', en: 'Privacy Policy' }}
          updated={privacyPolicyUpdated}
          sections={privacyPolicySections(brand)}
        />
      </main>
      <SiteFooter />
    </>
  )
}

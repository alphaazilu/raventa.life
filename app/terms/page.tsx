import type { Metadata } from 'next'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { LegalPage } from '@/components/legal/legal-page'
import { termsUpdated, termsSections } from '@/lib/legal/content'
import { getBrandInfo } from '@/lib/brand/settings'

export async function generateMetadata(): Promise<Metadata> {
  const brand = await getBrandInfo()
  return {
    title: `ข้อกำหนดการใช้งาน | ${brand.fullName}`,
    description: `ข้อกำหนดการใช้งานของ ${brand.fullName} — Terms of Service for ${brand.fullName}.`,
  }
}

export default async function TermsOfServicePage() {
  const brand = await getBrandInfo()
  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-background pt-24 md:pt-28">
        <LegalPage
          heading={{ th: 'ข้อกำหนดการใช้งาน', en: 'Terms of Service' }}
          updated={termsUpdated}
          sections={termsSections(brand)}
        />
      </main>
      <SiteFooter />
    </>
  )
}

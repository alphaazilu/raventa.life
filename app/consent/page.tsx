import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { ConsentForm } from '@/components/legal/consent-form'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/login/actions'
import { latestConsents, needsPdpa } from '@/lib/consent'
import { PRIVACY_VERSION, TERMS_VERSION } from '@/lib/legal/content'
import { getBrandInfo } from '@/lib/brand/settings'

export async function generateMetadata(): Promise<Metadata> {
  const brand = await getBrandInfo()
  return { title: `Privacy & Terms | ${brand.fullName}`, robots: { index: false, follow: false } }
}

export const dynamic = 'force-dynamic'

// §54 (v0.42.0): the account and Back Office send members here when their
// last agreement is to an older version of the privacy policy / terms (or
// there's none on record yet). Agreeing writes a new consent record.
export default async function ConsentPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const params = await searchParams
  const next = params.next && params.next.startsWith('/') && !params.next.startsWith('//') ? params.next : '/account'

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/login?next=${encodeURIComponent('/consent')}`)

  const consents = await latestConsents(supabase, user.id)
  if (!needsPdpa(consents)) redirect(next)

  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-background pt-24 md:pt-28">
        <ConsentForm next={next} firstTime={!consents?.pdpa} privacyVersion={PRIVACY_VERSION} termsVersion={TERMS_VERSION} signOutAction={signOut} />
      </main>
      <SiteFooter />
    </>
  )
}

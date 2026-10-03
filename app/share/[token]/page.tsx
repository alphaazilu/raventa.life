import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { createClient } from '@/lib/supabase/server'
import { readShareLink } from '@/app/account/package-actions'
import { AcceptShare } from './accept-share'

export const metadata: Metadata = { title: 'Shared package | RAVENTA Wellness Retreat' }

// A friend opens a package share link (email or QR, §23). Sign in (or join)
// first, then accept.
export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/login?next=${encodeURIComponent(`/share/${token}`)}`)
  const info = await readShareLink(token)
  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-background pt-24 md:pt-28">
        <AcceptShare token={token} info={info.ok ? info.data : null} error={info.ok ? null : info.error} />
      </main>
      <SiteFooter />
    </>
  )
}

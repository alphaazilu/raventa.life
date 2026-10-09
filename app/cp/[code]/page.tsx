import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { SiteHeader } from '@/components/site-header'
import { createClient } from '@/lib/supabase/server'
import { openPoint } from '@/app/account/checklist-actions'
import { PointPage } from '@/components/checklist/point-page'

export const metadata: Metadata = {
  title: 'จุดตรวจ | RAVENTA',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

// A check point's QR sticker is a link here (§29, v0.29), so a phone's own
// camera app works too: sign in if needed, then fill in the point.
export default async function CheckPointPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/login?next=${encodeURIComponent(`/cp/${code}`)}`)
  const opened = await openPoint(decodeURIComponent(code))
  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-background pt-20 md:pt-24">
        <div className="mx-auto max-w-lg px-4 pt-4 pb-16 md:pt-6">
          <PointPage opened={opened} />
        </div>
      </main>
    </>
  )
}

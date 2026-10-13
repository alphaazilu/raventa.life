import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { createClient } from '@/lib/supabase/server'
import { getReviewUrl, listTopics, pendingVisit } from '@/lib/console/feedback'
import { FeedbackForm } from '@/components/feedback/feedback-form'

export const metadata: Metadata = {
  title: 'ให้คะแนน | RAVENTA',
}

export const dynamic = 'force-dynamic'

// My account › rate my latest visit (§32, v0.33). Also where the exit QR
// (/feedback) lands.
export default async function FeedbackPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/login?next=${encodeURIComponent('/account/feedback')}`)
  const [visit, topics, reviewUrl] = await Promise.all([
    pendingVisit(user.id).catch(() => null),
    listTopics().catch(() => null),
    getReviewUrl().catch(() => null),
  ])
  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-background pt-20 md:pt-24">
        <div className="mx-auto max-w-lg px-4 pt-4 pb-16 md:pt-6">
          <FeedbackForm visit={visit} topics={topics ?? []} reviewUrl={reviewUrl} />
        </div>
      </main>
      <SiteFooter />
    </>
  )
}

import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { createClient } from '@/lib/supabase/server'
import { loadVisitHistory } from '@/lib/visit-history'
import { VisitHistoryView } from '@/components/visit-history-view'
import { BackLink } from '@/components/account/account-view'

export const metadata: Metadata = {
  title: 'My visits | RAVENTA Wellness Retreat',
}

// The member's own visits (RLS: own rows only). No prices or staff names.
export default async function AccountHistoryPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/login?next=${encodeURIComponent('/account/history')}`)

  const history = await loadVisitHistory(supabase, user.id, { bills: false })

  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-background pt-20 md:pt-24">
        <div className="mx-auto max-w-lg px-4 pt-4 pb-16 md:pt-6">
          <BackLink href="/account" />
          <div className="mt-4">
            <VisitHistoryView history={history} admin={false} />
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  )
}

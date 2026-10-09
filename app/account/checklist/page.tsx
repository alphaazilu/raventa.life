import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { createClient } from '@/lib/supabase/server'
import { BackLink } from '@/components/account/account-view'
import { MyChecklist } from '@/components/checklist/my-checklist'
import { bangkokToday } from '@/lib/check-in/day'
import { MY_CHECKLIST_PATH } from '@/lib/auth/roles'
import { dayBounds, listPoints, listRounds, listScans } from '@/lib/console/checklist'
import { withLivePoints } from '@/lib/checklist'

export const metadata: Metadata = {
  title: 'เช็คลิสต์ | RAVENTA',
}

export const dynamic = 'force-dynamic'

// Staff on their own phone (§29, v0.29): today's rounds — what's due, which
// points are left — and the camera to scan a point's QR sticker.
export default async function MyChecklistPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/login?next=${encodeURIComponent(MY_CHECKLIST_PATH)}`)
  const { data: p } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (p?.role !== 'staff' && p?.role !== 'admin') redirect('/account')

  const today = bangkokToday()
  const { from, to } = dayBounds(today)
  const [points, rounds, scans] = await Promise.all([listPoints().catch(() => null), listRounds().catch(() => []), listScans(from, to).catch(() => [])])

  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-background pt-20 md:pt-24">
        <div className="mx-auto max-w-lg px-4 pt-4 pb-16 md:pt-6">
          <BackLink href="/account" />
          <div className="mt-4">
            <MyChecklist
              today={today}
              setUp={points !== null}
              points={(points ?? []).filter((x) => x.active).map(({ id, name, place }) => ({ id, name, place }))}
              rounds={withLivePoints(rounds.filter((r) => r.active), points ?? [])}
              scans={scans.map(({ id, pointId, staffId, staffName, at, issue, flags }) => ({ id, pointId, staffId, staffName, at, issue, flags, results: [], note: null }))}
              meId={user.id}
            />
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  )
}

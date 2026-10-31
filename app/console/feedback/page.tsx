import { addDays } from '@/lib/date'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getConsoleSession } from '@/lib/console/session'
import { DESK_PATH, FEEDBACK_PATH } from '@/lib/auth/roles'
import { gatePage } from '@/lib/console/guard'
import { can } from '@/lib/auth/permissions'
import { bangkokToday } from '@/lib/check-in/day'
import { listFeedback, listTopics } from '@/lib/console/feedback'
import { FeedbackAdmin } from '@/components/console/feedback-admin'
import { BRAND } from '@/lib/brand/config'
import { getBrandInfo } from '@/lib/brand/settings'
import { backOfficeName } from '@/lib/brand/info'

export async function generateMetadata(): Promise<Metadata> {
  const brand = await getBrandInfo()
  return {
    title: `ความเห็นลูกค้า | ${backOfficeName(brand)}`,
  }
}

export const dynamic = 'force-dynamic'

const ISO = /^\d{4}-\d{2}-\d{2}$/

// Front desk › Member feedback (§32, v0.33). Admins only.
//   (default)    answers in a date range (?from&to, ?f=follow|comment|low), stats, CSV
//   ?tab=topics  the rating topics
export default async function FeedbackPage({ searchParams }: { searchParams: Promise<{ tab?: string; from?: string; to?: string; f?: string }> }) {
  const { user } = await getConsoleSession()
  if (!user) redirect(`/login?next=${FEEDBACK_PATH}`)
  // RBAC 3b: ROUTE_RULES with the person's real roles (the middleware no longer checks per page).
  await gatePage(FEEDBACK_PATH)
  if (!(await can(user.id, 'access:storefront.feedback'))) redirect(DESK_PATH)
  const q = await searchParams
  const tab = q.tab === 'topics' ? 'topics' : 'list'
  const today = bangkokToday()
  let from = q.from && ISO.test(q.from) ? q.from : addDays(today, -29)
  let to = q.to && ISO.test(q.to) ? q.to : today
  if (to < from) [from, to] = [to, from]
  if (addDays(from, 366) < to) to = addDays(from, 366)
  const filter = q.f === 'follow' || q.f === 'comment' || q.f === 'low' ? q.f : 'all'

  const [topics, rows] = await Promise.all([listTopics(true).catch(() => null), tab === 'list' ? listFeedback(from, to).catch(() => null) : Promise.resolve([])])
  const site = (process.env.SITE_URL ?? BRAND.siteUrl).replace(/\/$/, '')

  return (
    <main>
      <FeedbackAdmin
        tab={tab}
        setUp={topics !== null && rows !== null}
        topics={topics ?? []}
        rows={rows ?? []}
        range={{ from, to }}
        filter={filter}
        qrUrl={`${site}/feedback`}
      />
    </main>
  )
}

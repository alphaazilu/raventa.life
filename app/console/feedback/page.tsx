import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getConsoleSession } from '@/lib/console/session'
import { DESK_PATH, FEEDBACK_PATH, isAdmin } from '@/lib/auth/roles'
import { bangkokToday } from '@/lib/check-in/day'
import { listFeedback, listTopics } from '@/lib/console/feedback'
import { FeedbackAdmin } from '@/components/console/feedback-admin'

export const metadata: Metadata = {
  title: 'ความเห็นลูกค้า | RAVENTA Back Office',
}

export const dynamic = 'force-dynamic'

const ISO = /^\d{4}-\d{2}-\d{2}$/
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)

// Front desk › Member feedback (§32, v0.33). Admins only.
//   (default)    answers in a date range (?from&to, ?f=follow|comment|low), stats, CSV
//   ?tab=topics  the rating topics
export default async function FeedbackPage({ searchParams }: { searchParams: Promise<{ tab?: string; from?: string; to?: string; f?: string }> }) {
  const { user, role } = await getConsoleSession()
  if (!user) redirect(`/login?next=${FEEDBACK_PATH}`)
  if (!isAdmin(role)) redirect(DESK_PATH)
  const q = await searchParams
  const tab = q.tab === 'topics' ? 'topics' : 'list'
  const today = bangkokToday()
  let from = q.from && ISO.test(q.from) ? q.from : addDays(today, -29)
  let to = q.to && ISO.test(q.to) ? q.to : today
  if (to < from) [from, to] = [to, from]
  if (addDays(from, 366) < to) to = addDays(from, 366)
  const filter = q.f === 'follow' || q.f === 'comment' || q.f === 'low' ? q.f : 'all'

  const [topics, rows] = await Promise.all([listTopics(true).catch(() => null), tab === 'list' ? listFeedback(from, to).catch(() => null) : Promise.resolve([])])
  const site = (process.env.SITE_URL ?? 'https://www.raventawellness.com').replace(/\/$/, '')

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

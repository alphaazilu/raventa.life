import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getConsoleSession } from '@/lib/console/session'
import { AUDIT_PATH, DESK_PATH } from '@/lib/auth/roles'
import { gatePage } from '@/lib/console/guard'
import { can } from '@/lib/auth/permissions'
import { resolvePeriod } from '@/lib/console/report-period'
import { auditFiltersFrom, listActors, listAudit } from '@/lib/console/audit'
import { AuditView } from '@/components/console/audit-view'
import { getBrandInfo } from '@/lib/brand/settings'
import { backOfficeName } from '@/lib/brand/info'

export async function generateMetadata(): Promise<Metadata> {
  const brand = await getBrandInfo()
  return { title: `บันทึกการกระทำ | ${backOfficeName(brand)}` }
}

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 50

// Back Office › System › Audit log (v0.43.1): staff_actions, newest first,
// filtered by period / who / kind / text. Read only. Admins only — also
// gated in lib/supabase/middleware.ts and app/console/layout.tsx.
export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string; from?: string; to?: string; actor?: string; t?: string; q?: string; page?: string }>
}) {
  const { user } = await getConsoleSession()
  if (!user) redirect(`/login?next=${AUDIT_PATH}`)
  // RBAC 3b: ROUTE_RULES with the person's real roles (the middleware no longer checks per page).
  await gatePage(AUDIT_PATH)
  if (!(await can(user.id, 'access:system.audit'))) redirect(DESK_PATH)

  const q = await searchParams
  // Default: the last 7 days (a log is mostly read for "what happened lately").
  const period = resolvePeriod(q.p || q.from ? q : { p: '7d' })
  const filters = auditFiltersFrom(q, period)
  const page = Math.max(1, Math.min(1000, Number.parseInt(q.page ?? '1', 10) || 1))
  const [result, actors] = await Promise.all([listAudit(filters, (page - 1) * PAGE_SIZE, PAGE_SIZE), listActors().catch(() => [])])

  return (
    <main>
      <AuditView period={period} filters={filters} page={page} result={result} actors={actors} />
    </main>
  )
}

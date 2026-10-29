import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getConsoleSession } from '@/lib/console/session'
import { DESK_PATH, LEADS_PATH, isAdmin } from '@/lib/auth/roles'
import { listLeads } from '@/lib/console/leads'
import { LeadsView } from '@/components/console/leads-view'
import { getBrandInfo } from '@/lib/brand/settings'
import { backOfficeName } from '@/lib/brand/info'

export async function generateMetadata(): Promise<Metadata> {
  const brand = await getBrandInfo()
  return {
    title: `ผู้สนใจจาก Quiz | ${backOfficeName(brand)}`,
  }
}

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f-]{36}$/i

// Front desk › Quiz leads (§52, v0.38.31). Admins only.
//   (default)  leads waiting to be contacted (?id= highlights one, from the bell)
//   ?tab=done  the ones already contacted
export default async function LeadsPage({ searchParams }: { searchParams: Promise<{ tab?: string; id?: string }> }) {
  const { user, role } = await getConsoleSession()
  if (!user) redirect(`/login?next=${LEADS_PATH}`)
  if (!isAdmin(role)) redirect(DESK_PATH)
  const q = await searchParams
  const tab = q.tab === 'done' ? 'done' : 'open'
  const rows = await listLeads(tab).catch(() => null)
  return (
    <main>
      <LeadsView tab={tab} setUp={rows !== null} rows={rows ?? []} focusId={q.id && UUID.test(q.id) ? q.id : null} />
    </main>
  )
}

import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getConsoleSession } from '@/lib/console/session'
import { CHECKLIST_PATH, DESK_PATH } from '@/lib/auth/roles'
import { can } from '@/lib/auth/permissions'
import { listPoints } from '@/lib/console/checklist'
import { pointUrl } from '@/lib/checklist-code'
import { PrintStickers } from '@/components/console/checklist-print'
import { getBrandInfo } from '@/lib/brand/settings'
import { backOfficeName } from '@/lib/brand/info'

export async function generateMetadata(): Promise<Metadata> {
  const brand = await getBrandInfo()
  return {
    title: `พิมพ์ QR จุดตรวจ | ${backOfficeName(brand)}`,
  }
}

export const dynamic = 'force-dynamic'

// Back Office › Checklists › Print (§29, v0.29): one sticker per point, the
// QR a signed link to /cp/<code>. ?ids=a,b for some points, else all active.
export default async function PrintPage({ searchParams }: { searchParams: Promise<{ ids?: string }> }) {
  const { user } = await getConsoleSession()
  const { ids } = await searchParams
  if (!user) redirect(`/login?next=${encodeURIComponent(`${CHECKLIST_PATH}/print${ids ? `?ids=${ids}` : ''}`)}`)
  if (!(await can(user.id, 'access:operations.checklist'))) redirect(DESK_PATH)
  const want = ids ? new Set(ids.split(',')) : null
  const points = ((await listPoints()) ?? []).filter((p) => p.active && (!want || want.has(p.id)))
  return (
    <main>
      <PrintStickers stickers={points.map((p) => ({ id: p.id, name: p.name, place: p.place, url: pointUrl(p.id, p.codeVersion), version: p.codeVersion }))} />
    </main>
  )
}

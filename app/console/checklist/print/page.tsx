import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getConsoleSession } from '@/lib/console/session'
import { CHECKLIST_PATH, DESK_PATH, isAdmin } from '@/lib/auth/roles'
import { listPoints } from '@/lib/console/checklist'
import { pointUrl } from '@/lib/checklist-code'
import { PrintStickers } from '@/components/console/checklist-print'

export const metadata: Metadata = {
  title: 'พิมพ์ QR จุดตรวจ | RAVENTA Back Office',
}

export const dynamic = 'force-dynamic'

// Back Office › Checklists › Print (§29, v0.29): one sticker per point, the
// QR a signed link to /cp/<code>. ?ids=a,b for some points, else all active.
export default async function PrintPage({ searchParams }: { searchParams: Promise<{ ids?: string }> }) {
  const { user, role } = await getConsoleSession()
  const { ids } = await searchParams
  if (!user) redirect(`/login?next=${encodeURIComponent(`${CHECKLIST_PATH}/print${ids ? `?ids=${ids}` : ''}`)}`)
  if (!isAdmin(role)) redirect(DESK_PATH)
  const want = ids ? new Set(ids.split(',')) : null
  const points = ((await listPoints()) ?? []).filter((p) => p.active && (!want || want.has(p.id)))
  return (
    <main>
      <PrintStickers stickers={points.map((p) => ({ id: p.id, name: p.name, place: p.place, url: pointUrl(p.id, p.codeVersion), version: p.codeVersion }))} />
    </main>
  )
}

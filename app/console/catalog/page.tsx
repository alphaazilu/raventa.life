import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { CatalogAdmin, type CatalogView } from '@/components/console/catalog-admin'
import { getConsoleSession } from '@/lib/console/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadCatalog } from '@/lib/console/catalog'
import { bangkokToday } from '@/lib/check-in/day'
import { CATALOG_PATH, CONSOLE_PATH, isAdmin } from '@/lib/auth/roles'

export const metadata: Metadata = {
  title: 'สินค้าและราคา | RAVENTA Back Office',
}

export const dynamic = 'force-dynamic'

// Back Office → Products & prices (schema.sql §18). Admins only.
export default async function CatalogPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { user, role } = await getConsoleSession()
  if (!user) redirect(`/login?next=${CATALOG_PATH}`)
  if (!isAdmin(role)) redirect(CONSOLE_PATH)

  const { view: raw } = await searchParams
  const view: CatalogView = raw === 'holidays' || raw === 'promotions' ? raw : 'products'
  const catalog = await loadCatalog(createAdminClient()).catch((err) => {
    console.error('catalog load failed', err)
    return null
  })

  return (
    <main>
      <CatalogAdmin catalog={catalog} view={view} today={bangkokToday()} />
    </main>
  )
}

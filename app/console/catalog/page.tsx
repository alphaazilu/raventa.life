import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { CatalogAdmin, type CatalogView } from '@/components/console/catalog-admin'
import { getConsoleSession } from '@/lib/console/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadCatalog, saleTypesFrom } from '@/lib/console/catalog'
import { bangkokToday } from '@/lib/check-in/day'
import { CATALOG_PATH, DESK_PATH } from '@/lib/auth/roles'
import { canSeeArea } from '@/lib/auth/permissions'
import { listEarners, listRules } from '@/lib/console/commission'
import { allCodes, getDefaultReferrer } from '@/lib/console/referral'
import { getBrandInfo } from '@/lib/brand/settings'
import { backOfficeName } from '@/lib/brand/info'

export async function generateMetadata(): Promise<Metadata> {
  const brand = await getBrandInfo()
  return {
    title: `สินค้าและราคา | ${backOfficeName(brand)}`,
  }
}

export const dynamic = 'force-dynamic'

// Back Office → Products & prices (schema.sql §18). Admins only.
export default async function CatalogPage({ searchParams }: { searchParams: Promise<{ tab?: string; view?: string }> }) {
  const { user } = await getConsoleSession()
  if (!user) redirect(`/login?next=${CATALOG_PATH}`)
  if (!(await canSeeArea(user.id, 'catalog'))) redirect(DESK_PATH)

  const q = await searchParams
  const raw = q.tab ?? q.view // ?view= = links from before v0.30
  const view: CatalogView = raw === 'holidays' || raw === 'promotions' || raw === 'commission' ? raw : 'products'
  const catalog = await loadCatalog(createAdminClient()).catch((err) => {
    console.error('catalog load failed', err)
    return null
  })

  // Commission (§33, v0.34): who earns, and the rates. null = §33 not run.
  const commission =
    view === 'commission'
      ? await Promise.all([listEarners(), listRules(), getDefaultReferrer().catch(() => undefined)])
          .then(async ([earners, rules, defaultReferrer]) =>
            earners && rules
              ? {
                  earners,
                  rules,
                  // §36: undefined / null = not run yet
                  defaultReferrer,
                  codes: defaultReferrer === undefined ? null : await allCodes(earners.map((e) => e.id)).catch(() => null),
                }
              : null,
          )
          .catch((err) => {
            console.error('commission load failed', err)
            return null
          })
      : null

  // Products view (v0.37): commission rates for the form and categories, and
  // the sale type names. Rates null = §33 not run.
  const [rules, saleTypes] =
    view === 'products'
      ? await Promise.all([
          listRules().catch(() => null),
          createAdminClient()
            .from('app_settings')
            .select('*')
            .eq('id', 1)
            .maybeSingle()
            .then((r) => saleTypesFrom(r.data?.sale_types)),
        ])
      : [null, saleTypesFrom(null)]

  return (
    <main>
      <CatalogAdmin catalog={catalog} view={view} today={bangkokToday()} commission={commission} rules={rules} saleTypes={saleTypes} />
    </main>
  )
}

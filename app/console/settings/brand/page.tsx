import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getConsoleSession } from '@/lib/console/session'
import { BRAND_SETTINGS_PATH, DESK_PATH, isAdmin } from '@/lib/auth/roles'
import { BRAND } from '@/lib/brand/config'
import { readBrandRow } from '@/lib/brand/settings'
import { brandFromRow } from '@/lib/brand/info'
import { BrandSettingsView } from '@/components/console/brand-settings-view'

export const metadata: Metadata = {
  title: `ตั้งค่าแบรนด์ | ${BRAND.backOfficeName}`,
}

export const dynamic = 'force-dynamic'

// Back Office › Settings › Brand (schema.sql §53, v0.39.0). Admins only —
// also gated in lib/supabase/middleware.ts and app/console/layout.tsx.
export default async function BrandSettingsPage() {
  const { user, role } = await getConsoleSession()
  if (!user) redirect(`/login?next=${BRAND_SETTINGS_PATH}`)
  if (!isAdmin(role)) redirect(DESK_PATH)

  // Straight from the table (not the site's cache), so the form shows what
  // is saved right now. null = §53 not run yet: the form shows the defaults.
  const row = await readBrandRow()
  // The v0.41 columns come back only once the new SQL has been run.
  const v41 = row !== null && 'city' in row
  const raw = (v: string | null | undefined) => (v ?? '').trim()
  return (
    <main>
      <BrandSettingsView
        setUp={row !== null}
        v41={v41}
        initial={brandFromRow(row)}
        // What's actually saved (empty = "use the default"), for the fields
        // where empty means something: pictures, map link, SEO.
        saved={{
          logo: raw(row?.logo_url),
          emblem: raw(row?.logo_emblem_url),
          wordmark: raw(row?.logo_wordmark_url),
          icon: raw(row?.icon_url),
          og: raw(row?.og_image_url),
          mapUrl: raw(row?.map_url),
          seoTitle: raw(row?.seo_title),
          seoDescription: raw(row?.seo_description),
        }}
        updatedAt={row?.updated_at ?? null}
      />
    </main>
  )
}

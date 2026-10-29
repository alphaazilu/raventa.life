import type { Metadata, Viewport } from 'next'
import { redirect } from 'next/navigation'
import { TabletPair } from '@/components/console/tablet-pair'
import { getCurrentDevice } from '@/lib/console/device'
import { CONSOLE_PATH } from '@/lib/auth/roles'
import { BRAND } from '@/lib/brand/config'
import { getBrandInfo } from '@/lib/brand/settings'
import { backOfficeName, appShortName } from '@/lib/brand/info'

export async function generateMetadata(): Promise<Metadata> {
  const brand = await getBrandInfo()
  return {
    title: `ลงทะเบียน Tablet | ${backOfficeName(brand)}`,
    robots: { index: false, follow: false },
    manifest: '/console.webmanifest',
    appleWebApp: { capable: true, title: appShortName(brand), statusBarStyle: 'default' },
  }
}

export const viewport: Viewport = { themeColor: '#ffffff' }
export const dynamic = 'force-dynamic'

// Step 1 of setting up a counter tablet: open raventawellness.com/tablet on
// it. Already registered → straight to the console.
export default async function TabletPage() {
  if (await getCurrentDevice().catch(() => null)) redirect(CONSOLE_PATH)
  const siteUrl = process.env.SITE_URL ?? BRAND.siteUrl
  return <TabletPair siteUrl={siteUrl} />
}

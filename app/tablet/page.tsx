import type { Metadata, Viewport } from 'next'
import { redirect } from 'next/navigation'
import { TabletPair } from '@/components/console/tablet-pair'
import { getCurrentDevice } from '@/lib/console/device'
import { CONSOLE_PATH } from '@/lib/auth/roles'

export const metadata: Metadata = {
  title: 'ลงทะเบียน Tablet | RAVENTA Back Office',
  robots: { index: false, follow: false },
  manifest: '/console.webmanifest',
  appleWebApp: { capable: true, title: 'RAVENTA BO', statusBarStyle: 'default' },
}

export const viewport: Viewport = { themeColor: '#ffffff' }
export const dynamic = 'force-dynamic'

// Step 1 of setting up a counter tablet: open raventawellness.com/tablet on
// it. Already registered → straight to the console.
export default async function TabletPage() {
  if (await getCurrentDevice().catch(() => null)) redirect(CONSOLE_PATH)
  const siteUrl = process.env.SITE_URL ?? 'https://www.raventawellness.com'
  return <TabletPair siteUrl={siteUrl} />
}

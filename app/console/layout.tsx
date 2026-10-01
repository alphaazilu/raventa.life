import type { Metadata, Viewport } from 'next'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { ConsoleBar } from '@/components/console/console-bar'
import { TabletLock } from '@/components/console/tablet-lock'
import { IdleLock } from '@/components/console/idle-lock'
import { BusyOverlay } from '@/components/console/busy-overlay'
import { getConsoleSession } from '@/lib/console/session'
import { canUseDesk, CONSOLE_PATH, isAdmin } from '@/lib/auth/roles'
import { DEVICE_COOKIE, getCurrentDevice } from '@/lib/console/device'
import { signOut } from '@/app/login/actions'
import { lockConsole } from './lock-actions'
import { clockInIfNeeded } from '@/lib/console/time'

export const metadata: Metadata = {
  title: 'Back Office | RAVENTA Wellness Retreat',
  robots: { index: false, follow: false },
  // "Add to Home Screen" on the counter tablet opens the console as an app:
  // full screen, no browser bar (iPad Chrome/Safari can't go full screen
  // any other way). See public/console.webmanifest.
  manifest: '/console.webmanifest',
  appleWebApp: { capable: true, title: 'RAVENTA BO', statusBarStyle: 'default' },
}

export const viewport: Viewport = {
  themeColor: '#ffffff',
}

// Back Office console: its own top bar, no site header/footer. The proxy
// (lib/supabase/middleware.ts) already gates these routes; this is the
// second check, and each page checks again for what it shows.
//
// On a registered counter tablet (Vault R2) nobody signed in means the lock
// screen, never the login redirect loop.
export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const { user, role, firstName } = await getConsoleSession()

  const hasDeviceCookie = Boolean((await cookies()).get(DEVICE_COOKIE)?.value)
  const device = hasDeviceCookie ? await getCurrentDevice().catch(() => null) : null

  const me = { role, first_name: firstName }

  if (!user || !canUseDesk(me?.role)) {
    // A revoked or unknown key: back to pairing (never /account, which tablet
    // mode would bounce straight back here).
    if (hasDeviceCookie && !device) redirect('/tablet')
    if (device) return <TabletLock deviceName={device.name} notStaff={Boolean(user)} signOutAction={signOut} />
    redirect(user ? '/account' : `/login?next=${CONSOLE_PATH}`)
  }

  // Staff who got in with the password fallback are clocked in here (a card
  // scan already did it). No-op when an entry is open.
  if (device && role === 'staff') await clockInIfNeeded(user.id, device.id, 'password')

  return (
    <div className="min-h-dvh overflow-x-clip bg-background">
      <ConsoleBar
        name={me?.first_name || user.email || ''}
        admin={isAdmin(me?.role)}
        deviceName={device?.name ?? null}
        signOutAction={lockConsole.bind(null, 'manual')}
      />
      {children}
      {device && <IdleLock minutes={isAdmin(me?.role) ? 5 : 10} />}
      <BusyOverlay />
    </div>
  )
}

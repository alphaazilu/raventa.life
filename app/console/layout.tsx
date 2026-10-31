import type { Metadata, Viewport } from 'next'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { ConsoleShell } from '@/components/console/console-shell'
import { loadAlerts, noAlerts, type ConsoleAlerts } from '@/lib/console/alerts'
import { recentOpenLeads } from '@/lib/console/leads'
import { TabletLock } from '@/components/console/tablet-lock'
import { IdleLock } from '@/components/console/idle-lock'
import { BusyOverlay } from '@/components/console/busy-overlay'
import { getConsoleSession } from '@/lib/console/session'
import { CONSOLE_PATH, isAccountant, isAdmin } from '@/lib/auth/roles'
import { effectivePermissions } from '@/lib/auth/permissions'
import { canSeeConsole } from '@/lib/auth/permission-catalog'
import { DEVICE_COOKIE, getCurrentDevice } from '@/lib/console/device'
import { signOut } from '@/app/login/actions'
import { lockConsole } from './lock-actions'
import { clockInIfNeeded, isForgotten, listOpenEntries } from '@/lib/console/time'
import { getAppSettings } from '@/lib/console/settings'
import { UpdateBanner } from '@/components/console/update-banner'
import { createClient } from '@/lib/supabase/server'
import { latestConsents, needsPdpa } from '@/lib/consent'
import { getBrandInfo } from '@/lib/brand/settings'
import { appShortName } from '@/lib/brand/info'

export async function generateMetadata(): Promise<Metadata> {
  const brand = await getBrandInfo()
  return {
    title: `Back Office | ${brand.fullName}`,
    robots: { index: false, follow: false },
    // "Add to Home Screen" on the counter tablet opens the console as an app:
    // full screen, no browser bar (iPad Chrome/Safari can't go full screen
    // any other way). See app/console.webmanifest/route.ts.
    manifest: '/console.webmanifest',
    appleWebApp: { capable: true, title: appShortName(brand), statusBarStyle: 'default' },
  }
}

export const viewport: Viewport = {
  themeColor: '#ffffff',
}

// Back Office console: its own side menu + top bar (v0.30), no site header/footer. The proxy
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

  // RBAC (v0.44.1): in the shell when the person can see any Back Office area
  // (same people as canUseConsole: staff, admins, accountants).
  const perms = user ? await effectivePermissions(user.id) : new Set<string>()
  if (!user || !canSeeConsole(perms)) {
    // A revoked or unknown key: back to pairing (never /account, which tablet
    // mode would bounce straight back here).
    if (hasDeviceCookie && !device) redirect('/tablet')
    if (device) {
      const open = await listOpenEntries().catch(() => [])
      const onShift = open.filter((e) => !isForgotten(e)).map((e) => ({ name: e.name.split(' ')[0] || e.name, since: e.clockIn }))
      return (
        <>
          <TabletLock deviceName={device.name} notStaff={Boolean(user)} signOutAction={signOut} onShift={onShift} />
          <UpdateBanner />
        </>
      )
    }
    redirect(user ? '/account' : `/login?next=${CONSOLE_PATH}`)
  }

  // §54: agree to the current privacy policy / terms first. Not on the
  // counter tablet — it's shared, and only the console may open there (the
  // proxy would bounce /consent straight back); staff agree on their own
  // phone or account.
  if (!device && needsPdpa(await latestConsents(await createClient(), user.id))) redirect(`/consent?next=${CONSOLE_PATH}`)

  // Staff who got in with the password fallback are clocked in here (a card
  // scan already did it). No-op when an entry is open.
  if (device && role === 'staff') await clockInIfNeeded(user.id, device.id, 'password')
  const settings = await getAppSettings()

  // Numbers beside the side menu (admins only; staff see none).
  const [alerts, leads]: [ConsoleAlerts, Awaited<ReturnType<typeof recentOpenLeads>>] = isAdmin(me?.role)
    ? await Promise.all([loadAlerts(), recentOpenLeads().catch(() => [])])
    : [noAlerts, []]

  return (
    <div className="min-h-dvh overflow-x-clip bg-background">
      <Suspense>
        <ConsoleShell
          name={me?.first_name || user.email || ''}
          admin={isAdmin(me?.role)}
          accountant={isAccountant(me?.role)}
          perms={[...perms]}
          deviceName={device?.name ?? null}
          signOutAction={lockConsole.bind(null, 'manual')}
          staffMembers={settings.staffMembersOnTablet}
          idleMinutes={isAdmin(me?.role) ? settings.adminIdleMinutes : settings.staffIdleMinutes}
          alerts={alerts}
          leads={leads}
        >
          {children}
        </ConsoleShell>
      </Suspense>
      {device && <UpdateBanner />}
      {device && <IdleLock minutes={isAdmin(me?.role) ? settings.adminIdleMinutes : settings.staffIdleMinutes} />}
      <BusyOverlay />
    </div>
  )
}

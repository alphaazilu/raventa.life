'use client'

import Image from 'next/image'
import Link, { useLinkStatus } from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Expand, Globe, Lock, LogOut, Settings, ShieldAlert, Shrink } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { consoleCopy } from '@/lib/console/copy'
import { CATALOG_PATH, SETTINGS_PATH, CONSOLE_PATH, DESK_PATH, DEVICES_PATH, MEMBERS_PATH, TIME_PATH } from '@/lib/auth/roles'
import { cn } from '@/lib/utils'
import { AppVersion } from '@/components/console/app-version'

type Tab = {
  key: string
  label: { th: string; en: string }
  href?: string
  adminOnly?: boolean
  // Staff see it too, but only on a registered counter tablet.
  staffOnTablet?: boolean
  // Never on a counter tablet, even for an admin (manage from your own phone).
  notOnTablet?: boolean
}

// "Soon" tabs have no href yet (phase 2–4, see Vault R2) and render greyed.
const TABS: Tab[] = [
  { key: 'overview', label: consoleCopy.tabOverview, href: CONSOLE_PATH, adminOnly: true },
  { key: 'desk', label: consoleCopy.tabDesk, href: DESK_PATH },
  { key: 'members', label: consoleCopy.tabMembers, href: MEMBERS_PATH, adminOnly: true, staffOnTablet: true },
  { key: 'time', label: consoleCopy.tabTime, href: TIME_PATH, adminOnly: true, staffOnTablet: true },
  { key: 'catalog', label: consoleCopy.tabCatalog, href: CATALOG_PATH, adminOnly: true, notOnTablet: true },
  { key: 'reports', label: consoleCopy.tabReports, adminOnly: true },
  { key: 'devices', label: consoleCopy.tabDevices, href: DEVICES_PATH, adminOnly: true, notOnTablet: true },
  { key: 'settings', label: consoleCopy.tabSettings, href: SETTINGS_PATH, adminOnly: true, notOnTablet: true },
]

// Desktop: with many tabs (an admin on a computer), related pages sit under
// one menu each. Few tabs (staff, or an admin on the tablet) stay flat — no
// extra tap at the counter. Phones always get the flat, scrollable row.
const GROUPS: { key: string; label: { th: string; en: string }; tabs: string[]; icon?: boolean }[] = [
  { key: 'front', label: consoleCopy.groupFront, tabs: ['desk', 'members'] },
  { key: 'back', label: consoleCopy.groupBack, tabs: ['time', 'catalog'] },
  { key: 'system', label: consoleCopy.groupSystem, tabs: ['settings', 'devices'], icon: true },
]
const TOP_ORDER = ['overview', 'front', 'back', 'reports', 'system']
const GROUP_WHEN_MORE_THAN = 5

function isActive(pathname: string, href: string): boolean {
  if (href === CONSOLE_PATH) return pathname === CONSOLE_PATH
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function ConsoleBar({
  name,
  admin,
  deviceName = null,
  signOutAction,
  staffMembers = true,
  idleMinutes = 5,
}: {
  name: string
  admin: boolean
  // Set on a registered counter tablet: show which tablet this is, and a
  // sign-out button in place of "back to site" (the site isn't reachable).
  deviceName?: string | null
  signOutAction?: () => Promise<void>
  // Settings › staff see the member list on the tablet (§19).
  staffMembers?: boolean
  // Auto-lock minutes on the tablet, shown in the admin-mode menu.
  idleMinutes?: number
}) {
  const { tr, lang, toggle } = useLanguage()
  const pathname = usePathname()
  const onTablet = Boolean(deviceName)
  const tabs = TABS.filter(
    (t) =>
      (admin || !t.adminOnly || (t.staffOnTablet && onTablet && (t.key !== 'members' || staffMembers))) &&
      !(t.notOnTablet && onTablet),
  )

  // Full-screen button where the browser allows it (Android Chrome, desktop).
  // iPad browsers don't — there, "Add to Home Screen" opens the console
  // without the browser bar instead (public/console.webmanifest).
  const [canFullscreen, setCanFullscreen] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches
    setCanFullscreen(Boolean(document.fullscreenEnabled) && !standalone)
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])
  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void document.documentElement.requestFullscreen().catch(() => {})
  }

  const nav = (
    <nav aria-label={tr(consoleCopy.backOffice)} className="flex items-stretch gap-5 lg:gap-4 xl:gap-7">
      {tabs.map((t) =>
        t.href ? (
          <Link
            key={t.key}
            href={t.href}
            aria-current={isActive(pathname, t.href) ? 'page' : undefined}
            className={cn(
              'flex h-12 shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 text-sm transition-colors lg:h-14 xl:h-16',
              isActive(pathname, t.href)
                ? 'border-primary font-bold text-primary'
                : 'border-transparent font-medium text-muted-foreground hover:text-foreground',
            )}
          >
            {tr(t.label)}
            <PendingDot />
          </Link>
        ) : (
          <span
            key={t.key}
            aria-disabled="true"
            className="flex h-12 shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 border-transparent text-sm font-medium text-muted-foreground/60 lg:h-14 xl:h-16"
          >
            {tr(t.label)}
            <span className="rounded-full border border-border px-1.5 py-px text-[10px] font-semibold">
              {tr(consoleCopy.soon)}
            </span>
          </span>
        ),
      )}
    </nav>
  )

  const tabLink = (t: Tab, inMenu = false) =>
    t.href ? (
      <Link
        key={t.key}
        href={t.href}
        aria-current={isActive(pathname, t.href) ? 'page' : undefined}
        className={
          inMenu
            ? cn(
                'flex items-center justify-between gap-6 rounded-xl px-3 py-2.5 text-sm whitespace-nowrap',
                isActive(pathname, t.href) ? 'bg-secondary font-bold text-primary' : 'font-medium text-foreground hover:bg-secondary/60',
              )
            : cn(
                'flex h-14 shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 text-sm transition-colors xl:h-16',
                isActive(pathname, t.href)
                  ? 'border-primary font-bold text-primary'
                  : 'border-transparent font-medium text-muted-foreground hover:text-foreground',
              )
        }
      >
        {tr(t.label)}
        <PendingDot />
      </Link>
    ) : (
      <span
        key={t.key}
        aria-disabled="true"
        className="flex h-14 shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 border-transparent text-sm font-medium text-muted-foreground/60 xl:h-16"
      >
        {tr(t.label)}
        <span className="rounded-full border border-border px-1.5 py-px text-[10px] font-semibold">{tr(consoleCopy.soon)}</span>
      </span>
    )

  const byKey = new Map(tabs.map((t) => [t.key, t]))
  const desktopNav =
    tabs.length <= GROUP_WHEN_MORE_THAN ? (
      nav
    ) : (
      <nav aria-label={tr(consoleCopy.backOffice)} className="flex items-stretch gap-4 xl:gap-7">
        {TOP_ORDER.map((key) => {
          const group = GROUPS.find((g) => g.key === key)
          if (!group) {
            const t = byKey.get(key)
            return t ? tabLink(t) : null
          }
          const items = group.tabs.map((k) => byKey.get(k)).filter(Boolean) as Tab[]
          if (items.length === 0) return null
          if (items.length === 1) return tabLink(items[0])
          return (
            <NavMenu
              key={group.key}
              label={tr(group.label)}
              icon={group.icon}
              active={items.some((t) => t.href && isActive(pathname, t.href))}
              pathname={pathname}
            >
              {items.map((t) => tabLink(t, true))}
            </NavMenu>
          )
        })}
      </nav>
    )

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-2 px-3 sm:gap-4 sm:px-4 md:px-6 xl:h-16">
        <Link href={admin ? CONSOLE_PATH : DESK_PATH} className="flex min-w-0 items-center gap-2 sm:gap-2.5">
          <Image src="/images/logo-emblem.png" alt="" width={405} height={404} className="h-8 w-8 shrink-0" priority />
          <Image
            src="/images/logo-wordmark.png"
            alt="RAVENTA"
            width={1166}
            height={157}
            className="hidden h-[15px] w-auto sm:block"
            priority
          />
          <span className="truncate whitespace-nowrap rounded-full border border-border bg-secondary px-2 py-0.5 font-display text-[9px] font-bold tracking-[0.1em] text-secondary-foreground uppercase sm:px-2.5 sm:text-[10px] sm:tracking-[0.14em]">
            {tr(consoleCopy.backOffice)}
          </span>
        </Link>
        <AppVersion className="hidden shrink-0 2xl:inline" />

        <div className="hidden min-w-0 flex-1 justify-center lg:flex">{desktopNav}</div>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <span className={cn('whitespace-nowrap text-sm text-foreground', admin ? 'hidden 2xl:inline' : 'hidden sm:inline')}>
            {name} · {tr(admin ? consoleCopy.roleAdmin : consoleCopy.roleStaff)}
            {deviceName && <span className="text-muted-foreground"> · {deviceName}</span>}
          </span>
          {canFullscreen && (
            <button
              type="button"
              onClick={toggleFullscreen}
              aria-label={tr(isFullscreen ? consoleCopy.exitFullscreen : consoleCopy.fullscreen)}
              title={tr(isFullscreen ? consoleCopy.exitFullscreen : consoleCopy.fullscreen)}
              className="hidden h-9 w-9 items-center justify-center rounded-full border border-border text-foreground/80 hover:border-primary/40 sm:flex"
            >
              {isFullscreen ? <Shrink className="h-4 w-4" aria-hidden="true" /> : <Expand className="h-4 w-4" aria-hidden="true" />}
            </button>
          )}
          <button
            type="button"
            onClick={toggle}
            aria-label="Switch language"
            className="flex h-9 items-center gap-1 rounded-full border border-border px-2 text-xs font-semibold text-foreground/80 hover:border-primary/40 sm:px-2.5"
          >
            <Globe className="h-3.5 w-3.5" aria-hidden="true" />
            {/* Phones: just the language you'd switch to. */}
            <span className="sm:hidden">{lang === 'th' ? 'EN' : 'TH'}</span>
            <span className="hidden sm:inline">
              <span className={lang === 'th' ? 'text-primary' : ''}>TH</span>
              <span className="opacity-40"> / </span>
              <span className={lang === 'en' ? 'text-primary' : ''}>EN</span>
            </span>
          </button>
          {admin && onTablet && <AdminModeChip name={name} idleMinutes={idleMinutes} signOutAction={signOutAction} />}
          {deviceName && signOutAction ? (
            <form action={signOutAction}>
              <button
                type="submit"
                className="flex h-9 items-center gap-1.5 rounded-full border border-border px-2.5 text-xs font-semibold text-foreground hover:border-primary/40 sm:px-3"
              >
                <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">{tr(consoleCopy.lockButton)}</span>
              </button>
            </form>
          ) : (
            <Link
              href="/"
              aria-label={tr(consoleCopy.backToSite)}
              className="flex h-9 items-center gap-1.5 rounded-full border border-border px-2.5 text-xs font-semibold text-foreground hover:border-primary/40 sm:px-3"
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden xl:inline">{tr(consoleCopy.backToSite)}</span>
            </Link>
          )}
        </div>
      </div>
      {/* Phones and portrait tablets: tabs on their own scrollable row. */}
      {tabs.length > 1 && <div className="overflow-x-auto border-t border-border/60 px-3 sm:px-4 md:px-6 lg:hidden">{nav}</div>}
    </header>
  )
}

// Spins on the tab you just tapped until its page arrives.
function PendingDot() {
  const { pending } = useLinkStatus()
  return (
    <span
      aria-hidden="true"
      className={cn(
        'h-3.5 w-3.5 rounded-full border-2 border-primary/30 border-t-primary motion-safe:animate-spin',
        pending ? 'inline-block' : 'hidden',
      )}
    />
  )
}

function NavMenu({
  label,
  icon,
  active,
  pathname,
  children,
}: {
  label: string
  icon?: boolean
  active: boolean
  pathname: string
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  // Close on navigation, outside click and Escape.
  useEffect(() => setOpen(false), [pathname])
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])
  return (
    <div ref={ref} className="relative flex">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex h-14 shrink-0 items-center gap-1 whitespace-nowrap border-b-2 text-sm transition-colors xl:h-16',
          active ? 'border-primary font-bold text-primary' : 'border-transparent font-medium text-muted-foreground hover:text-foreground',
        )}
      >
        {icon && <Settings className="h-4 w-4" aria-hidden="true" />}
        {label}
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} aria-hidden="true" />
      </button>
      {open && (
        <div role="menu" className="absolute top-full left-1/2 z-50 mt-1 min-w-48 -translate-x-1/2 rounded-2xl border border-border bg-background p-1.5 shadow-lg">
          {children}
        </div>
      )}
    </div>
  )
}

// On a shared tablet an admin sees takings and can edit, so the red chip is
// a reminder — tap it to lock straight away.
function AdminModeChip({
  name,
  idleMinutes,
  signOutAction,
}: {
  name: string
  idleMinutes: number
  signOutAction?: () => Promise<void>
}) {
  const { tr } = useLanguage()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full bg-primary px-2.5 text-xs font-bold text-primary-foreground sm:px-3"
        title={tr(consoleCopy.adminModeChip)}
      >
        <ShieldAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="hidden 2xl:inline">{tr(consoleCopy.adminModeChip)}</span>
        <span className="2xl:hidden">{tr(consoleCopy.adminModeShort)}</span>
        <ChevronDown className="h-3 w-3" aria-hidden="true" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-2xl border border-border bg-background p-4 shadow-lg">
          <p className="text-sm font-bold text-foreground">
            {name} · {tr(consoleCopy.adminMenuTitle)}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {tr(consoleCopy.adminMenuBody).replace('{m}', String(idleMinutes))}
          </p>
          {signOutAction && (
            <form action={signOutAction} className="mt-3">
              <button type="submit" className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-primary text-sm font-bold text-primary-foreground">
                <Lock className="h-4 w-4" aria-hidden="true" />
                {tr(consoleCopy.adminLockNow)}
              </button>
            </form>
          )}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="mt-2 flex h-10 w-full items-center justify-center rounded-full border border-border text-sm font-semibold"
          >
            {tr(consoleCopy.adminKeepUsing)}
          </button>
        </div>
      )}
    </div>
  )
}

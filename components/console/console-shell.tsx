'use client'

import Image from 'next/image'
import Link, { useLinkStatus } from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import {
  BarChart3,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  Clock,
  Expand,
  FileClock,
  Globe,
  LayoutDashboard,
  ListChecks,
  Lock,
  LogOut,
  Menu,
  Package,
  Receipt,
  Settings,
  ShieldAlert,
  Shrink,
  Tablet,
  UserCircle,
  UserCog,
  Users,
  Wrench,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { consoleCopy } from '@/lib/console/copy'
import {
  CATALOG_PATH,
  CHECKLIST_PATH,
  CONSOLE_PATH,
  DESK_PATH,
  DEVICES_PATH,
  MEMBERS_PATH,
  REPORTS_PATH,
  SETTINGS_PATH,
  TEAM_PATH,
  TIME_PATH,
} from '@/lib/auth/roles'
import { AppVersion } from '@/components/console/app-version'
import type { ConsoleAlerts } from '@/lib/console/alerts'
import { cn } from '@/lib/utils'

// Back Office frame (v0.30): a side menu on the left instead of the old top
// bar, so long (English) labels never run into each other.
//   ≥1280px  side menu open (icons + names + group headings); « » folds it
//   1024–1279 icons only by default; tap ☰ to open it over the page
//   <1024px  hidden; ☰ in the top bar slides it in from the left
// The choice is remembered per device. Staff on the counter tablet always
// get the icon rail (3 icons) so the sell screen keeps its width.
// The top bar keeps its old height (57px / 65px at xl) — sticky parts of
// pages are placed under it.

type L = { th: string; en: string }
type Item = {
  key: string
  label: L
  icon: LucideIcon
  href?: string // none = coming soon
  adminOnly?: boolean
  staffOnTablet?: boolean // staff see it too, on a registered tablet
  notOnTablet?: boolean // never on the counter tablet
  badge?: (a: ConsoleAlerts) => number
  isActive?: (path: string, tab: string | null) => boolean
}
type Group = { key: string; label?: L; items: Item[] }

const t = {
  front: { th: 'หน้าร้าน', en: 'Front desk' },
  team: { th: 'ทีมงาน', en: 'Team' },
  ops: { th: 'ดูแลร้าน', en: 'Operations' },
  reports: { th: 'รายงาน', en: 'Reports' },
  system: { th: 'ระบบ', en: 'System' },
  overview: { th: 'ภาพรวม', en: 'Overview' },
  desk: { th: 'ขาย + เช็คอิน', en: 'Sell + check-in' },
  members: { th: 'ลูกค้า', en: 'Members' },
  time: { th: 'ลงเวลาและกะ', en: 'Time & shifts' },
  teamRoles: { th: 'ทีมงานและสิทธิ์', en: 'Team & roles' },
  checklist: { th: 'เช็คลิสต์', en: 'Checklists' },
  maintenance: { th: 'ซ่อมบำรุง', en: 'Maintenance' },
  catalog: { th: 'สินค้าและราคา', en: 'Products & prices' },
  sales: { th: 'การขาย', en: 'Sales' },
  timeReport: { th: 'ลงเวลา', en: 'Time' },
  settings: { th: 'ตั้งค่า', en: 'Settings' },
  devices: { th: 'อุปกรณ์', en: 'Devices' },
  myAccount: { th: 'บัญชีของฉัน', en: 'My account' },
  collapse: { th: 'ย่อเมนู', en: 'Collapse menu' },
  expand: { th: 'ขยายเมนู', en: 'Expand menu' },
  openMenu: { th: 'เปิดเมนู', en: 'Open menu' },
  closeMenu: { th: 'ปิดเมนู', en: 'Close menu' },
} satisfies Record<string, L>

const under = (href: string) => (p: string) => p === href || p.startsWith(`${href}/`)

const GROUPS: Group[] = [
  { key: 'overview', items: [{ key: 'overview', label: t.overview, icon: LayoutDashboard, href: CONSOLE_PATH, adminOnly: true, isActive: (p) => p === CONSOLE_PATH }] },
  {
    key: 'front',
    label: t.front,
    items: [
      { key: 'desk', label: t.desk, icon: Receipt, href: DESK_PATH },
      { key: 'members', label: t.members, icon: Users, href: MEMBERS_PATH, adminOnly: true, staffOnTablet: true },
    ],
  },
  {
    key: 'team',
    label: t.team,
    items: [
      { key: 'time', label: t.time, icon: Clock, href: TIME_PATH, adminOnly: true, staffOnTablet: true, badge: (a) => a.pendingLeave + a.forgotClockOut },
      { key: 'team', label: t.teamRoles, icon: UserCog, href: TEAM_PATH, adminOnly: true, notOnTablet: true, badge: (a) => a.unsetPay },
    ],
  },
  {
    key: 'ops',
    label: t.ops,
    items: [
      { key: 'checklist', label: t.checklist, icon: ListChecks, href: CHECKLIST_PATH, adminOnly: true, notOnTablet: true, badge: (a) => a.checklistIssues + a.checklistMissed },
      { key: 'maintenance', label: t.maintenance, icon: Wrench, adminOnly: true, notOnTablet: true },
      { key: 'catalog', label: t.catalog, icon: Package, href: CATALOG_PATH, adminOnly: true, notOnTablet: true },
    ],
  },
  {
    key: 'reports',
    label: t.reports,
    items: [
      { key: 'sales', label: t.sales, icon: BarChart3, href: REPORTS_PATH, adminOnly: true, isActive: (p, tab) => p === REPORTS_PATH && tab !== 'time' },
      { key: 'timeReport', label: t.timeReport, icon: FileClock, href: `${REPORTS_PATH}?tab=time`, adminOnly: true, isActive: (p, tab) => p === REPORTS_PATH && tab === 'time' },
    ],
  },
  {
    key: 'system',
    label: t.system,
    items: [
      { key: 'settings', label: t.settings, icon: Settings, href: SETTINGS_PATH, adminOnly: true, notOnTablet: true },
      { key: 'devices', label: t.devices, icon: Tablet, href: DEVICES_PATH, adminOnly: true, notOnTablet: true },
    ],
  },
]

const NAV_KEY = 'rv-console-nav'
type NavPref = 'open' | 'closed' | null

export function ConsoleShell({
  name,
  admin,
  deviceName = null,
  signOutAction,
  staffMembers = true,
  idleMinutes = 5,
  alerts,
  children,
}: {
  name: string
  admin: boolean
  // A registered counter tablet: its name, and "Lock" instead of "Back to site".
  deviceName?: string | null
  signOutAction?: () => Promise<void>
  staffMembers?: boolean // Settings › staff see the member list on the tablet
  idleMinutes?: number
  alerts: ConsoleAlerts
  children: React.ReactNode
}) {
  const { tr, lang, toggle } = useLanguage()
  const pathname = usePathname()
  const search = useSearchParams()
  const tab = search.get('tab') ?? (search.get('r') === 'time' ? 'time' : null)
  const onTablet = Boolean(deviceName)
  const railOnly = onTablet && !admin // staff at the counter: icons only, always

  const allowed = (i: Item) =>
    (admin || !i.adminOnly || (i.staffOnTablet && onTablet && (i.key !== 'members' || staffMembers))) && !(i.notOnTablet && onTablet)
  const groups = GROUPS.map((g) => ({ ...g, items: g.items.filter(allowed) })).filter((g) => g.items.length > 0)
  const active = (i: Item) => Boolean(i.href) && (i.isActive ? i.isActive(pathname, tab) : under(i.href!)(pathname))
  const current = groups.flatMap((g) => g.items).find(active)

  // Side menu open or folded (desktop); drawer (small screens).
  const [pref, setPref] = useState<NavPref>(null)
  const [wide, setWide] = useState(true)
  const [drawer, setDrawer] = useState(false)
  useEffect(() => {
    try {
      const v = localStorage.getItem(NAV_KEY)
      if (v === 'open' || v === 'closed') setPref(v)
    } catch {}
    const mq = window.matchMedia('(min-width: 1280px)')
    const on = () => setWide(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  const open = !railOnly && (pref ? pref === 'open' : wide && !onTablet)
  const setOpen = (v: boolean) => {
    setPref(v ? 'open' : 'closed')
    try {
      localStorage.setItem(NAV_KEY, v ? 'open' : 'closed')
    } catch {}
  }
  useEffect(() => setDrawer(false), [pathname, tab])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))) return
      if (e.key === '[' && !railOnly && !e.metaKey && !e.ctrlKey) setOpen(!open)
      if (e.key === 'Escape') setDrawer(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // Full screen where the browser allows it (not iPad; there the home-screen
  // icon opens the console without the browser bar).
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

  const menu = (wideMenu: boolean) => (
    <nav aria-label={tr(consoleCopy.backOffice)} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-3">
      {groups.map((g, gi) => (
        <div key={g.key} className={cn(gi > 0 && 'mt-2.5')}>
          {g.label &&
            (wideMenu ? (
              <p className="px-3 pb-1 text-[11px] font-bold tracking-[0.08em] text-muted-foreground uppercase">{tr(g.label)}</p>
            ) : (
              <div className="mx-3 mb-2 border-t border-border" aria-hidden="true" />
            ))}
          <ul className="space-y-0.5">
            {g.items.map((i) => (
              <li key={i.key}>
                <NavLink item={i} wide={wideMenu} active={active(i)} count={i.badge ? i.badge(alerts) : 0} label={tr(i.label)} soon={tr(consoleCopy.soon)} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  )

  const footer = (wideMenu: boolean, inDrawer = false) => (
    <div className="border-t border-border p-2">
      {wideMenu ? (
        <div className="flex items-center gap-2.5 px-2 py-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-bold">{(name || '?').slice(0, 1).toUpperCase()}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">{name}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {tr(admin ? consoleCopy.roleAdmin : consoleCopy.roleStaff)}
              {deviceName && ` · ${deviceName}`}
            </span>
          </span>
        </div>
      ) : null}
      <ul className="space-y-0.5">
        {!onTablet && (
          <li>
            <FooterLink href="/account" icon={UserCircle} label={tr(t.myAccount)} wide={wideMenu} />
          </li>
        )}
        {!onTablet && (
          <li>
            <FooterLink href="/" icon={LogOut} label={tr(consoleCopy.backToSite)} wide={wideMenu} />
          </li>
        )}
      </ul>
      {wideMenu && <AppVersion className="block truncate px-3 pt-1.5" />}
      {!railOnly && !inDrawer && (
        <button
          type="button"
          onClick={() => setOpen(!open)}
          title={`${tr(open ? t.collapse : t.expand)} ( [ )`}
          aria-label={tr(open ? t.collapse : t.expand)}
          className={cn(
            'mt-1 flex h-9 w-full items-center gap-2 rounded-xl text-sm text-muted-foreground hover:bg-secondary hover:text-foreground',
            wideMenu ? 'px-3' : 'justify-center',
          )}
        >
          {open ? <ChevronsLeft className="h-4 w-4" aria-hidden="true" /> : <ChevronsRight className="h-4 w-4" aria-hidden="true" />}
          {wideMenu && tr(t.collapse)}
        </button>
      )}
    </div>
  )

  const logo = (wideMenu: boolean) => (
    <Link href={admin ? CONSOLE_PATH : DESK_PATH} className={cn('flex h-14 shrink-0 items-center gap-2 border-b border-border xl:h-16', wideMenu ? 'px-4' : 'justify-center')}>
      <Image src="/images/logo-emblem.png" alt="" width={405} height={404} className="h-8 w-8 shrink-0" priority />
      {wideMenu && (
        <span className="flex min-w-0 flex-col">
          <Image src="/images/logo-wordmark.png" alt="RAVENTA" width={1166} height={157} className="h-[13px] w-auto self-start" priority />
          <span className="mt-1 text-[9px] font-bold tracking-[0.16em] text-muted-foreground uppercase">{tr(consoleCopy.backOffice)}</span>
        </span>
      )}
    </Link>
  )

  return (
    <div className="flex min-h-dvh">
      {/* Side menu (1024px and up) */}
      <aside
        className={cn(
          'sticky top-0 z-30 hidden h-dvh shrink-0 flex-col border-r border-border bg-background transition-[width] duration-200 lg:flex print:hidden',
          open ? 'w-60' : 'w-16',
        )}
      >
        {logo(open)}
        {menu(open)}
        {footer(open)}
      </aside>

      {/* Drawer (small screens) */}
      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden print:hidden" role="dialog" aria-modal="true">
          <button type="button" aria-label={tr(t.closeMenu)} onClick={() => setDrawer(false)} className="absolute inset-0 bg-black/40" />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-background shadow-xl">
            <div className="flex items-center justify-between border-b border-border pr-2 [&>a]:border-b-0">
              {logo(true)}
              <button type="button" onClick={() => setDrawer(false)} aria-label={tr(t.closeMenu)} className="rounded-full p-2 text-muted-foreground hover:bg-secondary">
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            {menu(true)}
            {footer(true, true)}
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar: menu button (small screens) · page name · language · full screen · tablet lock */}
        <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur print:hidden">
          <div className="flex h-14 items-center gap-2 px-3 sm:px-4 md:px-6 xl:h-16">
            <button
              type="button"
              onClick={() => setDrawer(true)}
              aria-label={tr(t.openMenu)}
              className="-ml-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-foreground hover:bg-secondary lg:hidden"
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </button>
            <Link href={admin ? CONSOLE_PATH : DESK_PATH} className="shrink-0 lg:hidden" aria-label="RAVENTA">
              <Image src="/images/logo-emblem.png" alt="" width={405} height={404} className="h-7 w-7" />
            </Link>
            <p className="min-w-0 flex-1 truncate font-display text-base font-extrabold sm:text-lg">{current ? tr(current.label) : ''}</p>
            {deviceName && <span className="hidden shrink-0 text-sm text-muted-foreground md:inline">{deviceName}</span>}
            {canFullscreen && (
              <button
                type="button"
                onClick={toggleFullscreen}
                aria-label={tr(isFullscreen ? consoleCopy.exitFullscreen : consoleCopy.fullscreen)}
                title={tr(isFullscreen ? consoleCopy.exitFullscreen : consoleCopy.fullscreen)}
                className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border text-foreground/80 hover:border-primary/40 sm:flex"
              >
                {isFullscreen ? <Shrink className="h-4 w-4" aria-hidden="true" /> : <Expand className="h-4 w-4" aria-hidden="true" />}
              </button>
            )}
            <button
              type="button"
              onClick={toggle}
              aria-label="Switch language"
              className="flex h-9 shrink-0 items-center gap-1 rounded-full border border-border px-2.5 text-xs font-semibold text-foreground/80 hover:border-primary/40"
            >
              <Globe className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="sm:hidden">{lang === 'th' ? 'EN' : 'TH'}</span>
              <span className="hidden sm:inline">
                <span className={lang === 'th' ? 'text-primary' : ''}>TH</span>
                <span className="opacity-40"> / </span>
                <span className={lang === 'en' ? 'text-primary' : ''}>EN</span>
              </span>
            </button>
            {admin && onTablet && <AdminModeChip name={name} idleMinutes={idleMinutes} signOutAction={signOutAction} />}
            {deviceName && signOutAction && (
              <form action={signOutAction} className="shrink-0">
                <button
                  type="submit"
                  className="flex h-9 items-center gap-1.5 rounded-full border border-border px-2.5 text-xs font-semibold text-foreground hover:border-primary/40 sm:px-3"
                >
                  <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                  <span className="hidden sm:inline">{tr(consoleCopy.lockButton)}</span>
                </button>
              </form>
            )}
          </div>
        </header>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  )
}

function NavLink({ item, wide, active, count, label, soon }: { item: Item; wide: boolean; active: boolean; count: number; label: string; soon: string }) {
  const Icon = item.icon
  const base = cn('relative flex h-9 items-center gap-3 rounded-xl text-sm transition-colors', wide ? 'px-3' : 'justify-center')
  if (!item.href) {
    return (
      <span aria-disabled="true" title={wide ? undefined : `${label} · ${soon}`} className={cn(base, 'cursor-default text-muted-foreground/60')}>
        <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
        {wide && (
          <>
            <span className="min-w-0 flex-1 truncate">{label}</span>
            <span className="shrink-0 rounded-full border border-border px-1.5 py-px text-[10px] font-semibold">{soon}</span>
          </>
        )}
      </span>
    )
  }
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      title={wide ? undefined : count ? `${label} (${count})` : label}
      className={cn(base, active ? 'bg-primary/10 font-bold text-primary' : 'font-medium text-foreground/80 hover:bg-secondary hover:text-foreground')}
    >
      <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
      {wide && <span className="min-w-0 flex-1 truncate">{label}</span>}
      {count > 0 &&
        (wide ? (
          <span className="shrink-0 rounded-full bg-primary px-1.5 py-px text-[11px] font-bold text-primary-foreground tabular-nums">{count}</span>
        ) : (
          <span className="absolute top-1.5 right-2.5 h-2 w-2 rounded-full bg-primary ring-2 ring-background" aria-hidden="true" />
        ))}
      <PendingDot />
    </Link>
  )
}

function FooterLink({ href, icon: Icon, label, wide }: { href: string; icon: LucideIcon; label: string; wide: boolean }) {
  return (
    <Link
      href={href}
      title={wide ? undefined : label}
      className={cn('flex h-9 items-center gap-3 rounded-xl text-sm text-muted-foreground hover:bg-secondary hover:text-foreground', wide ? 'px-3' : 'justify-center')}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      {wide && <span className="min-w-0 truncate">{label}</span>}
    </Link>
  )
}

// Spins on the item you just tapped until its page arrives.
function PendingDot() {
  const { pending } = useLinkStatus()
  return (
    <span
      aria-hidden="true"
      className={cn('absolute right-2 h-3.5 w-3.5 rounded-full border-2 border-primary/30 border-t-primary motion-safe:animate-spin', pending ? 'inline-block' : 'hidden')}
    />
  )
}

// On a shared tablet an admin sees takings and can edit, so the red chip is
// a reminder — tap it to lock straight away.
function AdminModeChip({ name, idleMinutes, signOutAction }: { name: string; idleMinutes: number; signOutAction?: () => Promise<void> }) {
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
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full bg-primary px-2.5 text-xs font-bold text-primary-foreground sm:px-3"
        title={tr(consoleCopy.adminModeChip)}
      >
        <ShieldAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="hidden sm:inline">{tr(consoleCopy.adminModeShort)}</span>
        <ChevronDown className="h-3 w-3" aria-hidden="true" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-border bg-background p-4 shadow-lg">
          <p className="text-sm font-bold text-foreground">
            {name} · {tr(consoleCopy.adminMenuTitle)}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{tr(consoleCopy.adminMenuBody).replace('{m}', String(idleMinutes))}</p>
          {signOutAction && (
            <form action={signOutAction} className="mt-3">
              <button type="submit" className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-primary text-sm font-bold text-primary-foreground">
                <Lock className="h-4 w-4" aria-hidden="true" />
                {tr(consoleCopy.adminLockNow)}
              </button>
            </form>
          )}
          <button type="button" onClick={() => setOpen(false)} className="mt-2 flex h-10 w-full items-center justify-center rounded-full border border-border text-sm font-semibold">
            {tr(consoleCopy.adminKeepUsing)}
          </button>
        </div>
      )}
    </div>
  )
}

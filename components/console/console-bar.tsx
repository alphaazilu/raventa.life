'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Globe, LogOut } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { consoleCopy } from '@/lib/console/copy'
import { CONSOLE_PATH, DESK_PATH, MEMBERS_PATH } from '@/lib/auth/roles'
import { cn } from '@/lib/utils'

type Tab = { key: string; label: { th: string; en: string }; href?: string; adminOnly?: boolean }

// "Soon" tabs have no href yet (phase 2–4, see Vault R2) and render greyed.
const TABS: Tab[] = [
  { key: 'overview', label: consoleCopy.tabOverview, href: CONSOLE_PATH, adminOnly: true },
  { key: 'desk', label: consoleCopy.tabDesk, href: DESK_PATH },
  { key: 'members', label: consoleCopy.tabMembers, href: MEMBERS_PATH, adminOnly: true },
  { key: 'time', label: consoleCopy.tabTime, adminOnly: true },
  { key: 'reports', label: consoleCopy.tabReports, adminOnly: true },
]

function isActive(pathname: string, href: string): boolean {
  if (href === CONSOLE_PATH) return pathname === CONSOLE_PATH
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function ConsoleBar({ name, admin }: { name: string; admin: boolean }) {
  const { tr, lang, toggle } = useLanguage()
  const pathname = usePathname()
  const tabs = TABS.filter((t) => admin || !t.adminOnly)

  const nav = (
    <nav aria-label={tr(consoleCopy.backOffice)} className="flex items-stretch gap-5 md:gap-7">
      {tabs.map((t) =>
        t.href ? (
          <Link
            key={t.key}
            href={t.href}
            aria-current={isActive(pathname, t.href) ? 'page' : undefined}
            className={cn(
              'flex h-12 shrink-0 items-center whitespace-nowrap border-b-2 text-sm transition-colors md:h-16',
              isActive(pathname, t.href)
                ? 'border-primary font-bold text-primary'
                : 'border-transparent font-medium text-muted-foreground hover:text-foreground',
            )}
          >
            {tr(t.label)}
          </Link>
        ) : (
          <span
            key={t.key}
            aria-disabled="true"
            className="flex h-12 shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 border-transparent text-sm font-medium text-muted-foreground/60 md:h-16"
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

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4 md:h-16 md:px-6">
        <Link href={admin ? CONSOLE_PATH : DESK_PATH} className="flex shrink-0 items-center gap-2.5">
          <Image src="/images/logo-emblem.png" alt="" width={405} height={404} className="h-8 w-8" priority />
          <Image
            src="/images/logo-wordmark.png"
            alt="RAVENTA"
            width={1166}
            height={157}
            className="hidden h-[15px] w-auto sm:block"
            priority
          />
          <span className="rounded-full border border-border bg-secondary px-2.5 py-0.5 font-display text-[10px] font-bold tracking-[0.14em] text-secondary-foreground uppercase">
            {tr(consoleCopy.backOffice)}
          </span>
        </Link>

        <div className="hidden min-w-0 flex-1 justify-center md:flex">{nav}</div>

        <div className="flex shrink-0 items-center gap-2">
          <span className="hidden text-sm text-foreground lg:inline">
            {name} · {tr(admin ? consoleCopy.roleAdmin : consoleCopy.roleStaff)}
          </span>
          <button
            type="button"
            onClick={toggle}
            aria-label="Switch language"
            className="flex h-9 items-center gap-1 rounded-full border border-border px-2.5 text-xs font-semibold text-foreground/80 hover:border-primary/40"
          >
            <Globe className="h-3.5 w-3.5" aria-hidden="true" />
            <span className={lang === 'th' ? 'text-primary' : ''}>TH</span>
            <span className="opacity-40">/</span>
            <span className={lang === 'en' ? 'text-primary' : ''}>EN</span>
          </button>
          <Link
            href="/"
            className="flex h-9 items-center gap-1.5 rounded-full border border-border px-3 text-xs font-semibold text-foreground hover:border-primary/40"
          >
            <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">{tr(consoleCopy.backToSite)}</span>
          </Link>
        </div>
      </div>
      {/* Phones: tabs on their own scrollable row. */}
      <div className="overflow-x-auto px-4 md:hidden">{nav}</div>
    </header>
  )
}

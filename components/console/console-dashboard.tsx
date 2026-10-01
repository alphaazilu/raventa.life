'use client'

import Link, { useLinkStatus } from 'next/link'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { BarChart3, ChevronRight, Clock, Receipt, Users, type LucideIcon } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { consoleCopy } from '@/lib/console/copy'
import { DESK_PATH, MEMBERS_PATH } from '@/lib/auth/roles'
import { bangkokTime, FLOOR_CAPACITY } from '@/lib/check-in/day'
import { formatMemberNo } from '@/lib/format-date'
import type { DashboardData } from '@/app/console/dashboard-data'
import { cn } from '@/lib/utils'

const REFRESH_MS = 60_000

function formatToday(date: string, lang: 'th' | 'en'): string {
  return new Intl.DateTimeFormat(lang === 'th' ? 'th-TH' : 'en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`))
}

export function ConsoleDashboard({ firstName, data }: { firstName: string | null; data: DashboardData }) {
  const { tr, lang } = useLanguage()
  const router = useRouter()

  // Keep the numbers fresh while the dashboard stays open.
  useEffect(() => {
    const id = setInterval(() => router.refresh(), REFRESH_MS)
    return () => clearInterval(id)
  }, [router])

  const pct = Math.min(100, Math.round((data.inside / FLOOR_CAPACITY) * 100))
  const n = (x: number) => x.toLocaleString()

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-6 md:px-6 md:py-8">
      <div>
        <p className="text-sm text-muted-foreground">
          {formatToday(data.date, lang)} · {tr(consoleCopy.roleAdmin)}
        </p>
        <h1 className="mt-1 font-display text-2xl font-extrabold text-foreground md:text-3xl">
          {firstName ? `${tr(consoleCopy.hello)}${firstName}` : tr(consoleCopy.helloFallback)}
        </h1>
      </div>

      {data.error && (
        <div role="alert" className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive">
          {tr(consoleCopy.notSetUp)}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label={tr(consoleCopy.inStoreNow)} value={<>{n(data.inside)} <small className="text-sm font-semibold text-muted-foreground">/ {FLOOR_CAPACITY}</small></>}
          sub={`${tr(consoleCopy.seatsLeft)} ${Math.max(0, FLOOR_CAPACITY - data.inside)} ${tr(consoleCopy.seatsUnit)}`}>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-secondary">
            <div className={cn('h-full rounded-full', pct >= 90 ? 'bg-destructive' : pct >= 70 ? 'bg-amber-500' : 'bg-loading')} style={{ width: `${pct}%` }} />
          </div>
        </Kpi>
        <Kpi label={tr(consoleCopy.checkInsToday)} value={n(data.checkIns)}
          sub={`${tr(consoleCopy.paidCount)} ${n(data.paid)} · ${tr(consoleCopy.freeCount)} ${n(data.free)}`} />
        <Kpi label={tr(consoleCopy.takingsToday)} value={`${n(data.takings.total)} ${tr(consoleCopy.baht)}`}
          sub={`${tr(consoleCopy.cash)} ${n(data.takings.cash)} · ${tr(consoleCopy.transfer)} ${n(data.takings.transfer)} · ${tr(consoleCopy.card)} ${n(data.takings.card)}`} />
        <Kpi label={tr(consoleCopy.newMembersToday)} value={n(data.newMembersToday)}
          sub={`${tr(consoleCopy.membersTotal)} ${n(data.membersTotal)} ${tr(consoleCopy.people)}`} />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Module href={DESK_PATH} icon={Receipt} primary title={tr(consoleCopy.modDeskTitle)} desc={tr(consoleCopy.modDeskDesc)}
          meta={`${n(data.inside)} ${tr(consoleCopy.modDeskMeta)}`} />
        <Module href={MEMBERS_PATH} icon={Users} title={tr(consoleCopy.modMembersTitle)} desc={tr(consoleCopy.modMembersDesc)}
          meta={`${n(data.membersTotal)} ${tr(consoleCopy.modMembersMeta)}`} />
        <Module icon={Clock} title={tr(consoleCopy.modTimeTitle)} desc={tr(consoleCopy.modTimeDesc)} soon={tr(consoleCopy.soon)} />
        <Module icon={BarChart3} title={tr(consoleCopy.modReportsTitle)} desc={tr(consoleCopy.modReportsDesc)} soon={tr(consoleCopy.soon)} />
      </div>

      <div className="grid gap-3 lg:grid-cols-5">
        <section className="rounded-2xl border border-border bg-card p-4 md:p-5 lg:col-span-3">
          <h2 className="text-base font-semibold text-card-foreground">{tr(consoleCopy.hourlyHeading)}</h2>
          <HourlyChart hourly={data.hourly} />
        </section>
        <section className="rounded-2xl border border-border bg-card p-4 md:p-5 lg:col-span-2">
          <div className="flex items-baseline justify-between">
            <h2 className="text-base font-semibold text-card-foreground">{tr(consoleCopy.recentHeading)}</h2>
            <Link href={DESK_PATH} className="text-sm font-semibold text-primary hover:underline">
              {tr(consoleCopy.seeAll)}
            </Link>
          </div>
          {data.recent.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{tr(consoleCopy.nobodyYet)}</p>
          ) : (
            <ul className="mt-2 divide-y divide-border">
              {data.recent.map((v) => (
                <li key={v.id} className="flex items-center gap-3 py-2.5 text-sm">
                  <span className="w-11 shrink-0 font-mono text-xs text-muted-foreground">{bangkokTime(v.checkedInAt)}</span>
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {v.name}
                    <span className="ml-2 hidden font-mono text-xs text-muted-foreground sm:inline">{formatMemberNo(v.memberNo)}</span>
                  </span>
                  <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
                    {v.entryType === 'reward' ? tr(consoleCopy.free) : tr(consoleCopy[v.paymentMethod ?? 'cash'])}
                  </span>
                  <span
                    className={cn(
                      'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold',
                      v.checkedOutAt ? 'bg-muted text-muted-foreground' : 'bg-secondary text-secondary-foreground',
                    )}
                  >
                    {tr(v.checkedOutAt ? consoleCopy.left : consoleCopy.inside)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}

function Kpi({ label, value, sub, children }: { label: string; value: React.ReactNode; sub: string; children?: React.ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col rounded-2xl border border-border bg-card p-4">
      <span className="text-xs font-semibold tracking-wide text-muted-foreground">{label}</span>
      <span className="mt-1.5 font-display text-2xl font-extrabold text-foreground md:text-3xl">{value}</span>
      <span className="mt-1 text-xs text-muted-foreground">{sub}</span>
      {children}
    </section>
  )
}

function Module({
  href,
  icon: Icon,
  title,
  desc,
  meta,
  primary,
  soon,
}: {
  href?: string
  icon: LucideIcon
  title: string
  desc: string
  meta?: string
  primary?: boolean
  soon?: string
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span
          className={cn(
            'flex h-11 w-11 items-center justify-center rounded-xl',
            primary ? 'bg-primary text-primary-foreground' : soon ? 'bg-muted text-muted-foreground' : 'bg-secondary text-secondary-foreground',
          )}
        >
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        {soon && (
          <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">{soon}</span>
        )}
      </div>
      <span className="mt-3 flex items-center justify-between gap-2 text-base font-bold">
        {title}
        {!soon && (href ? <LinkChevron /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />)}
      </span>
      <span className="mt-1 text-sm leading-snug text-muted-foreground">{desc}</span>
      {meta && <span className="mt-2 text-xs font-semibold text-secondary-foreground">{meta}</span>}
    </>
  )
  const cls = cn(
    'flex min-w-0 flex-col rounded-2xl bg-card p-4 text-foreground',
    primary ? 'border-[1.5px] border-primary' : 'border border-border',
  )
  if (!href) {
    return (
      <div aria-disabled="true" className={cn(cls, 'opacity-70')}>
        {body}
      </div>
    )
  }
  return (
    <Link href={href} className={cn(cls, 'transition-colors hover:border-primary/60')}>
      {body}
    </Link>
  )
}

function HourlyChart({ hourly }: { hourly: { hour: number; count: number }[] }) {
  const max = Math.max(1, ...hourly.map((h) => h.count))
  return (
    <div className="mt-4 flex h-44 items-end gap-1" role="img" aria-label={hourly.map((h) => `${h.hour}:00 ${h.count}`).join(', ')}>
      {hourly.map((h) => (
        <div key={h.hour} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
          <span className={cn('text-[11px] text-muted-foreground', h.count === 0 && 'invisible')}>{h.count}</span>
          <div
            className={cn('w-3/4 rounded-t-md', h.count ? 'bg-accent' : 'bg-secondary')}
            style={{ height: `${Math.max(3, Math.round((h.count / max) * 120))}px` }}
          />
          <span className="text-[11px] text-muted-foreground">{String(h.hour).padStart(2, '0')}</span>
        </div>
      ))}
    </div>
  )
}

function LinkChevron() {
  const { pending } = useLinkStatus()
  return pending ? (
    <span aria-hidden="true" className="h-4 w-4 shrink-0 rounded-full border-2 border-primary/30 border-t-primary motion-safe:animate-spin" />
  ) : (
    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
  )
}

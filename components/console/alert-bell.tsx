'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { Bell, CalendarCheck, ChevronRight, Clock, ListChecks, Mail, MessageCircle, MessageSquareHeart, Phone, Wallet, X, type LucideIcon } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { bellCopy, consoleCopy, leadsCopy } from '@/lib/console/copy'
import { BOOKINGS_PATH, CALENDAR_PATH, CASH_PATH, CHECKLIST_PATH, FEEDBACK_PATH, LEADS_PATH, TEAM_PATH, TIME_PATH } from '@/lib/auth/roles'
import type { ConsoleAlerts } from '@/lib/console/alerts'
import type { LeadPreview } from '@/lib/console/leads'
import { benefits } from '@/lib/i18n'
import { goalEmoji } from '@/lib/wellness-quiz/copy'
import type { Goal } from '@/lib/wellness-quiz/types'
import { cn } from '@/lib/utils'

// Every alert in one dropdown (v0.38.31), grouped under a divider per topic,
// so pages no longer need coloured bars that push their content down. Each
// row links to the page (and tab) where it gets handled. The red dot means
// "something new since you last opened it" — remembered per device.

type L = { th: string; en: string }
type GroupKey = keyof typeof bellCopy.groups
type Row = { key: keyof ConsoleAlerts; n: number; text: L; href: string; red?: boolean; info?: boolean }

const SEEN_KEY = 'rv-bell-seen'
export const OPEN_BELL_EVENT = 'rv-open-bell'

const GROUP_ICON: Record<GroupKey, LucideIcon> = {
  customers: MessageSquareHeart,
  bookings: CalendarCheck,
  cash: Wallet,
  team: Clock,
  checklist: ListChecks,
}

function rowsFor(a: ConsoleAlerts): { group: GroupKey; rows: Row[] }[] {
  const c = consoleCopy
  return [
    {
      group: 'customers',
      rows: [
        { key: 'quizLeads', n: a.quizLeads, text: bellCopy.leads, href: LEADS_PATH, red: true },
        { key: 'feedbackFollow', n: a.feedbackFollow, text: c.todoFeedback, href: `${FEEDBACK_PATH}?f=follow`, red: true },
      ],
    },
    {
      group: 'bookings',
      rows: [
        { key: 'bookingLate', n: a.bookingLate, text: c.todoBookingLate, href: `${BOOKINGS_PATH}?tab=day`, red: true },
        { key: 'bookingsToday', n: a.bookingsToday, text: c.todoBookings, href: `${BOOKINGS_PATH}?tab=day`, info: true },
        { key: 'calendarSoon', n: a.calendarSoon, text: c.todoCalendar, href: CALENDAR_PATH, info: true },
      ],
    },
    {
      group: 'cash',
      rows: [
        { key: 'cashReview', n: a.cashReview, text: c.todoCashReview, href: `${CASH_PATH}?tab=history`, red: true },
        { key: 'cashOpenLong', n: a.cashOpenLong, text: c.todoCashOpen, href: CASH_PATH, red: true },
      ],
    },
    {
      group: 'team',
      rows: [
        { key: 'pendingLeave', n: a.pendingLeave, text: c.todoLeave, href: `${TIME_PATH}?tab=leave` },
        { key: 'forgotClockOut', n: a.forgotClockOut, text: c.todoForgot, href: TIME_PATH },
        { key: 'unsetPay', n: a.unsetPay, text: c.todoPay, href: TEAM_PATH },
      ],
    },
    {
      group: 'checklist',
      rows: [
        { key: 'checklistIssues', n: a.checklistIssues, text: c.todoIssues, href: CHECKLIST_PATH, red: true },
        { key: 'checklistMissed', n: a.checklistMissed, text: c.todoMissed, href: CHECKLIST_PATH },
      ],
    },
  ]
    .map((g) => ({ group: g.group as GroupKey, rows: g.rows.filter((r) => r.n > 0) as Row[] }))
    .filter((g) => g.rows.length > 0)
}

/** Things to act on — information-only rows (bookings today, calendar) don't count. */
export function actionCount(a: ConsoleAlerts): number {
  return rowsFor(a)
    .flatMap((g) => g.rows)
    .filter((r) => !r.info)
    .reduce((s, r) => s + r.n, 0)
}

type Seen = { counts: Partial<Record<keyof ConsoleAlerts, number>>; lead: string | null }

function hasNew(a: ConsoleAlerts, leads: LeadPreview[], seen: Seen | null): boolean {
  const rows = rowsFor(a)
    .flatMap((g) => g.rows)
    .filter((r) => !r.info)
  if (!seen) return rows.length > 0
  if (leads[0] && (!seen.lead || leads[0].createdAt > seen.lead)) return true
  return rows.some((r) => r.n > (seen.counts[r.key] ?? 0))
}

function ago(iso: string, tr: (l: L) => string): string {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (min < 1) return tr(bellCopy.justNow)
  if (min < 60) return tr(bellCopy.minAgo).replace('{n}', String(min))
  const h = Math.round(min / 60)
  if (h < 24) return tr(bellCopy.hourAgo).replace('{n}', String(h))
  return tr(bellCopy.dayAgo).replace('{n}', String(Math.round(h / 24)))
}

const CONTACT_ICON = { phone: Phone, email: Mail, line: MessageCircle, other: MessageCircle } as const

export function AlertBell({ alerts, leads }: { alerts: ConsoleAlerts; leads: LeadPreview[] }) {
  const { tr } = useLanguage()
  const [open, setOpen] = useState(false)
  const [seen, setSeen] = useState<Seen | null>(null)
  const [loaded, setLoaded] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    try {
      const v = JSON.parse(localStorage.getItem(SEEN_KEY) ?? 'null')
      if (v && typeof v === 'object') setSeen(v as Seen)
    } catch {}
    setLoaded(true)
  }, [])

  const groups = rowsFor(alerts)
  const total = actionCount(alerts)
  const fresh = loaded && hasNew(alerts, leads, seen)

  const markSeen = () => {
    const counts: Seen['counts'] = {}
    for (const r of groups.flatMap((g) => g.rows)) counts[r.key] = r.n
    const next: Seen = { counts, lead: leads[0]?.createdAt ?? seen?.lead ?? null }
    setSeen(next)
    try {
      localStorage.setItem(SEEN_KEY, JSON.stringify(next))
    } catch {}
  }

  const toggle = (v = !open) => {
    setOpen(v)
    if (v) markSeen()
  }

  // Close on a click outside or Escape; the overview's summary line opens it.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])
  useEffect(() => {
    const onOpen = () => toggle(true)
    window.addEventListener(OPEN_BELL_EVENT, onOpen)
    return () => window.removeEventListener(OPEN_BELL_EVENT, onOpen)
  })

  const goalLabel = (g: string) => {
    const b = benefits.find((x) => x.id === g)
    return b ? `${goalEmoji[g as Goal] ?? ''} ${tr(b.title)}`.trim() : g
  }

  return (
    <div ref={box} className="relative shrink-0">
      <button
        type="button"
        onClick={() => toggle()}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`${tr(bellCopy.open)}${total ? ` (${total})` : ''}`}
        title={tr(bellCopy.open)}
        className={cn(
          'relative flex h-9 w-9 items-center justify-center rounded-full border text-foreground/80 transition-colors hover:border-primary/40',
          open ? 'border-primary/40 bg-primary/5' : 'border-border',
        )}
      >
        <Bell className={cn('h-4 w-4', fresh && 'text-primary')} aria-hidden="true" />
        {total > 0 && (
          <span
            className={cn(
              'absolute -top-1 -right-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold tabular-nums ring-2 ring-background',
              fresh ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground',
            )}
          >
            {total > 99 ? '99+' : total}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={tr(bellCopy.open)}
          className="fixed inset-x-2 top-16 z-50 flex max-h-[calc(100dvh-5rem)] flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-xl sm:absolute sm:inset-x-auto sm:top-11 sm:right-0 sm:w-[24rem] sm:max-h-[70vh] motion-safe:animate-fade-in"
        >
          <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
            <p className="font-display text-sm font-extrabold">{tr(bellCopy.open)}</p>
            <button type="button" onClick={() => setOpen(false)} aria-label={tr(bellCopy.close)} className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary">
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-2">
            {groups.length === 0 && <p className="px-4 py-8 text-center text-sm text-muted-foreground">{tr(bellCopy.none)}</p>}
            {groups.map(({ group, rows }) => {
              const Icon = GROUP_ICON[group]
              return (
                <section key={group}>
                  <div className="flex items-center gap-2 px-4 pt-3 pb-1.5 text-[11px] font-bold tracking-[0.08em] text-muted-foreground uppercase">
                    <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                    <span className="shrink-0">{tr(bellCopy.groups[group])}</span>
                    <span className="h-px flex-1 bg-border" aria-hidden="true" />
                  </div>
                  <ul className="px-2">
                    {rows.map((r) => (
                      <li key={r.key}>
                        <Link
                          href={r.href}
                          onClick={() => setOpen(false)}
                          className={cn(
                            'flex items-center gap-3 rounded-xl px-2 py-2 text-sm hover:bg-secondary',
                            r.info ? 'text-muted-foreground' : r.red ? 'font-semibold text-destructive' : 'font-semibold text-foreground',
                          )}
                        >
                          <span className="min-w-0 flex-1">{tr(r.text).replace('{n}', String(r.n))}</span>
                          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                        </Link>
                        {r.key === 'quizLeads' && leads.length > 0 && (
                          <ul className="mb-1 ml-2 space-y-0.5 border-l border-border pl-2">
                            {leads.map((l) => {
                              const CI = CONTACT_ICON[l.contactType]
                              return (
                                <li key={l.id}>
                                  <Link
                                    href={`${LEADS_PATH}?id=${l.id}`}
                                    onClick={() => setOpen(false)}
                                    className="block rounded-lg px-2 py-1.5 text-xs hover:bg-secondary"
                                  >
                                    <span className="flex items-center gap-1.5">
                                      <span className="min-w-0 truncate font-semibold text-foreground">{l.name || tr(bellCopy.noName)}</span>
                                      <span className="flex min-w-0 items-center gap-1 text-muted-foreground">
                                        <CI className="h-3 w-3 shrink-0" aria-hidden="true" />
                                        <span className="truncate">{l.contact}</span>
                                      </span>
                                      <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">{ago(l.createdAt, tr)}</span>
                                    </span>
                                    {(l.goals.length > 0 || l.totalMinutes) && (
                                      <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                                        {[l.goals.map(goalLabel).join(' · '), l.totalMinutes ? `${l.totalMinutes} ${tr(leadsCopy.minutes)}` : '']
                                          .filter(Boolean)
                                          .join(' · ')}
                                      </span>
                                    )}
                                  </Link>
                                </li>
                              )
                            })}
                          </ul>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

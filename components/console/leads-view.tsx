'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { Check, Copy, Mail, MessageCircle, Phone, RotateCcw, UserCheck } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { Spinner } from '@/components/ui/spinner'
import { leadsCopy as c } from '@/lib/console/copy'
import { LEADS_PATH, MEMBERS_PATH } from '@/lib/auth/roles'
import type { QuizLead } from '@/lib/console/leads'
import { benefits } from '@/lib/i18n'
import { goalEmoji } from '@/lib/wellness-quiz/copy'
import type { Goal } from '@/lib/wellness-quiz/types'
import { setLeadHandled } from '@/app/console/leads/actions'
import { cn } from '@/lib/utils'

// Front desk › Quiz leads (§52, v0.38.31). See app/console/leads/page.tsx.

function when(iso: string, lang: 'th' | 'en') {
  return new Intl.DateTimeFormat(lang === 'th' ? 'th-TH' : 'en-GB', {
    timeZone: 'Asia/Bangkok',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

export function LeadsView({ tab, setUp, rows, focusId }: { tab: 'open' | 'done'; setUp: boolean; rows: QuizLead[]; focusId: string | null }) {
  const { tr } = useLanguage()

  // Coming from the bell: bring that lead into view.
  useEffect(() => {
    if (!focusId) return
    document.getElementById(`lead-${focusId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [focusId])

  return (
    <div className="flex w-full flex-col gap-5 px-4 py-6 md:px-6 md:py-8 xl:px-8">
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-2">
          <h1 className="font-display text-2xl font-extrabold">{tr(c.title)}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{tr(c.sub)}</p>
        </div>
        <div className="inline-flex rounded-full bg-secondary p-1 text-sm font-semibold" role="tablist">
          {(['open', 'done'] as const).map((k) => (
            <Link
              key={k}
              role="tab"
              aria-selected={tab === k}
              href={k === 'open' ? LEADS_PATH : `${LEADS_PATH}?tab=done`}
              className={cn('rounded-full px-4 py-1.5', tab === k ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground')}
            >
              {tr(k === 'open' ? c.open : c.done)}
            </Link>
          ))}
        </div>
      </div>

      {!setUp ? (
        <p className="rounded-2xl bg-amber-500/15 p-4 text-sm font-semibold text-amber-800 dark:text-amber-300">{tr(c.notSetUp)}</p>
      ) : rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">{tr(c.empty)}</p>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
          {rows.map((l) => (
            <LeadCard key={l.id} lead={l} focused={l.id === focusId} />
          ))}
        </ul>
      )}
    </div>
  )
}

function LeadCard({ lead: l, focused }: { lead: QuizLead; focused: boolean }) {
  const { tr, lang } = useLanguage()
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState(false)
  const [copied, setCopied] = useState(false)

  const contactHref = l.contactType === 'phone' ? `tel:${l.contact.replace(/[^\d+]/g, '')}` : l.contactType === 'email' ? `mailto:${l.contact}` : null
  const ContactIcon = l.contactType === 'phone' ? Phone : l.contactType === 'email' ? Mail : MessageCircle

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(l.contact)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {}
  }

  const flip = () =>
    start(async () => {
      setError(false)
      const res = await setLeadHandled(l.id, !l.handledAt)
      if (res.ok) router.refresh()
      else setError(true)
    })

  return (
    <li
      id={`lead-${l.id}`}
      className={cn(
        'flex flex-col rounded-2xl border bg-card p-4 transition-shadow md:p-5',
        focused ? 'border-primary ring-2 ring-primary/30' : 'border-border',
      )}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 font-display text-base font-bold">
            <span className="truncate">{l.name || '—'}</span>
            {l.memberId && (
              <Link href={`${MEMBERS_PATH}/${l.memberId}`} className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold text-secondary-foreground hover:underline">
                {tr(c.member)}
              </Link>
            )}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">{when(l.createdAt, lang)}</p>
        </div>
        {l.totalMinutes ? (
          <p className="shrink-0 text-right">
            <span className="font-display text-xl font-bold tabular-nums text-primary">{l.totalMinutes}</span>
            <span className="ml-1 text-xs text-muted-foreground">{tr(c.minutes)}</span>
          </p>
        ) : null}
      </div>

      {/* Contact: one tap to call / mail; LINE ids are copied */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {contactHref ? (
          <a href={contactHref} className="inline-flex h-9 min-w-0 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90">
            <ContactIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="truncate">{l.contact}</span>
          </a>
        ) : (
          <span className="inline-flex h-9 min-w-0 items-center gap-1.5 rounded-full bg-secondary px-4 text-sm font-semibold text-secondary-foreground">
            <ContactIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="truncate">{l.contactType === 'line' ? `LINE: ${l.contact}` : l.contact}</span>
          </span>
        )}
        <button
          type="button"
          onClick={copy}
          className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border px-3 text-xs font-semibold text-foreground/80 hover:border-primary/40"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-primary" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
          {tr(copied ? c.copied : c.copy)}
        </button>
      </div>

      {l.goals.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {l.goals.map((g) => {
            const b = benefits.find((x) => x.id === g)
            return (
              <span key={g} className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold text-secondary-foreground">
                {goalEmoji[g as Goal] ?? ''} {b ? tr(b.title) : g}
              </span>
            )
          })}
        </div>
      )}
      {l.journeySummary && (
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          <span className="font-semibold text-foreground/80">{tr(c.journey)}:</span> {l.journeySummary}
        </p>
      )}
      {l.adjustments.length > 0 && (
        <p className="mt-1 text-xs text-muted-foreground">
          <span className="font-semibold text-foreground/80">{tr(c.adjusted)}:</span> {l.adjustments.map((k) => (c.adjust[k] ? tr(c.adjust[k]) : k)).join(', ')}
        </p>
      )}

      <div className="mt-auto pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        {l.handledAt ? (
          <p className="text-xs text-muted-foreground">
            {tr(c.handledBy)
              .replace('{who}', l.handledBy || '—')
              .replace('{when}', when(l.handledAt, lang))}
          </p>
        ) : (
          <span />
        )}
        <button
          type="button"
          disabled={pending}
          onClick={flip}
          className={cn(
            'inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-sm font-semibold disabled:opacity-50',
            l.handledAt ? 'border border-border text-foreground/80 hover:border-primary/40' : 'bg-foreground text-background',
          )}
        >
          {pending ? <Spinner className="h-4 w-4" /> : l.handledAt ? <RotateCcw className="h-4 w-4" aria-hidden="true" /> : <UserCheck className="h-4 w-4" aria-hidden="true" />}
          {tr(l.handledAt ? c.reopen : c.markDone)}
        </button>
      </div>
      </div>
      {error && <p className="mt-2 text-xs font-semibold text-destructive">{tr(c.failed)}</p>}
    </li>
  )
}

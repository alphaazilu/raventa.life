'use client'

import { useState, useTransition } from 'react'
import { CheckCircle2, ExternalLink, Star } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { Spinner } from '@/components/ui/spinner'
import { BackLink } from '@/components/account/account-view'
import { formatMemberDate } from '@/lib/format-date'
import { fbCopy as c, fbErrors, type FeedbackTopic, type PendingVisit } from '@/lib/feedback'
import { submitFeedback } from '@/app/account/feedback-actions'
import { cn } from '@/lib/utils'

// Member: rate the latest visit (§32, v0.33).

export function Stars({ value, onChange, size = 'lg', label }: { value: number; onChange: (n: number) => void; size?: 'lg' | 'sm'; label: string }) {
  const { tr } = useLanguage()
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={tr(c.stars).replace('{n}', String(n))}
          onClick={() => onChange(value === n && size === 'sm' ? 0 : n)}
          className={cn('rounded-full p-1 transition-transform active:scale-90', size === 'lg' ? 'h-12 w-12' : 'h-9 w-9')}
        >
          <Star className={cn('h-full w-full', n <= value ? 'fill-amber-400 text-amber-400' : 'text-border')} strokeWidth={1.5} aria-hidden="true" />
        </button>
      ))}
    </div>
  )
}

export function FeedbackForm({ visit, topics, reviewUrl }: { visit: PendingVisit | null; topics: FeedbackTopic[]; reviewUrl: string | null }) {
  const { tr, lang } = useLanguage()
  const [pending, start] = useTransition()
  const [overall, setOverall] = useState(0)
  const [scores, setScores] = useState<Record<string, number>>({})
  const [comment, setComment] = useState('')
  const [contactMe, setContactMe] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState<number | null>(null)
  const day = (d: string) => formatMemberDate(`${d}T12:00:00+07:00`, lang, true) ?? d

  if (sent !== null) {
    return (
      <div className="text-center">
        <CheckCircle2 className="mx-auto mt-8 h-14 w-14 text-accent" aria-hidden="true" />
        <h1 className="mt-4 font-display text-2xl font-extrabold">{tr(c.thanks)}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{tr(c.thanksSub)}</p>
        {sent === 5 && reviewUrl && (
          <div className="mt-6 rounded-2xl border border-border bg-card p-4">
            <p className="text-sm">{tr(c.reviewSub)}</p>
            <a
              href={reviewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-bold text-primary-foreground"
            >
              {tr(c.review)} <ExternalLink className="h-4 w-4" aria-hidden="true" />
            </a>
          </div>
        )}
        <div className="mt-6">
          <BackLink href="/account" />
        </div>
      </div>
    )
  }

  if (!visit) {
    return (
      <>
        <BackLink href="/account" />
        <div className="mt-6 rounded-2xl border border-dashed border-border p-8 text-center">
          <p className="font-semibold">{tr(c.none)}</p>
          <p className="mt-1 text-sm text-muted-foreground">{tr(c.noneSub)}</p>
        </div>
      </>
    )
  }

  return (
    <>
      <BackLink href="/account" />
      <h1 className="mt-4 font-display text-3xl font-extrabold">{tr(c.pageTitle)}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{tr(c.visitOn).replace('{d}', day(visit.visitDate))}</p>

      <section className="mt-6 rounded-2xl border border-border bg-card p-4 text-center">
        <p className="font-semibold">{tr(c.overall)}</p>
        <div className="mt-2 flex justify-center">
          <Stars value={overall} onChange={setOverall} label={tr(c.overall)} />
        </div>
      </section>

      {topics.length > 0 && (
        <section className="mt-4 rounded-2xl border border-border bg-card p-4">
          <p className="mb-2 text-sm text-muted-foreground">{tr(c.topicsHint)}</p>
          <ul className="divide-y divide-border">
            {topics.map((t) => (
              <li key={t.key} className="flex items-center justify-between gap-3 py-1.5">
                <span className="min-w-0 text-sm font-semibold">{lang === 'en' && t.labelEn ? t.labelEn : t.label}</span>
                <Stars size="sm" value={scores[t.key] ?? 0} onChange={(n) => setScores({ ...scores, [t.key]: n })} label={t.label} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <label className="mt-4 block">
        <span className="mb-1 block text-sm font-semibold">{tr(c.comment)}</span>
        <textarea
          rows={4}
          value={comment}
          maxLength={1000}
          onChange={(e) => setComment(e.target.value)}
          placeholder={tr(c.commentPh)}
          className="w-full rounded-2xl border border-border bg-background px-3 py-2 text-sm"
        />
      </label>
      <label className="mt-3 flex items-center gap-2 text-sm font-semibold">
        <input type="checkbox" checked={contactMe} onChange={(e) => setContactMe(e.target.checked)} className="h-4 w-4" />
        {tr(c.contactMe)}
      </label>

      {error && <p className="mt-4 rounded-xl bg-destructive/10 px-3 py-2 text-sm font-semibold text-destructive">{tr(fbErrors[error] ?? fbErrors.failed)}</p>}
      <button
        type="button"
        disabled={pending || overall === 0}
        onClick={() =>
          start(async () => {
            setError(null)
            const r = await submitFeedback({ visitId: visit.visitId, overall, scores: Object.fromEntries(Object.entries(scores).filter(([, v]) => v > 0)), comment, contactMe })
            if (r.ok) setSent(overall)
            else setError(r.error)
          })
        }
        className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary text-base font-bold text-primary-foreground disabled:opacity-40"
      >
        {pending && <Spinner className="h-5 w-5" />}
        {tr(c.send)}
      </button>
    </>
  )
}

'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import { ArrowDown, ArrowUp, Check, Download, MessageSquare, Phone, Plus, Printer, Star } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { Spinner } from '@/components/ui/spinner'
import { QrSvg } from '@/components/ui/qr-svg'
import { FEEDBACK_PATH } from '@/lib/auth/roles'
import { formatMemberDate, formatMemberNo } from '@/lib/format-date'
import { fbCopy as c, fbErrors, MAX_TOPICS, needsFollowUp, type FeedbackRow, type FeedbackTopic } from '@/lib/feedback'
import { markHandled, saveTopics } from '@/app/console/feedback/actions'
import { cn } from '@/lib/utils'

// Front desk › Member feedback (§32, v0.33). See app/console/feedback/page.tsx.

const card = 'rounded-2xl border border-border bg-card p-4 md:p-5'
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
const one = (x: number | null) => (x === null ? '—' : x.toFixed(1))
const monday = (d: string) => {
  const t = new Date(`${d}T00:00:00Z`)
  return new Date(t.getTime() - ((t.getUTCDay() + 6) % 7) * 86_400_000).toISOString().slice(0, 10)
}

function StarRow({ n, small = false }: { n: number; small?: boolean }) {
  return (
    <span className="inline-flex" aria-label={`${n}/5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={cn(small ? 'h-3.5 w-3.5' : 'h-4 w-4', i <= n ? 'fill-amber-400 text-amber-400' : 'text-border')} strokeWidth={1.5} aria-hidden="true" />
      ))}
    </span>
  )
}

export function FeedbackAdmin({
  tab,
  setUp,
  topics,
  rows,
  range,
  filter,
  qrUrl,
}: {
  tab: 'list' | 'topics'
  setUp: boolean
  topics: FeedbackTopic[]
  rows: FeedbackRow[]
  range: { from: string; to: string }
  filter: 'all' | 'follow' | 'comment' | 'low'
  qrUrl: string
}) {
  const { tr } = useLanguage()
  return (
    <div className="flex w-full flex-col gap-5 px-4 py-6 md:px-6 md:py-8 xl:px-8">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="mr-2 font-display text-2xl font-extrabold">{tr(c.title)}</h1>
        <div className="inline-flex rounded-full bg-secondary p-1 text-sm font-semibold" role="tablist">
          {(['list', 'topics'] as const).map((k) => (
            <Link
              key={k}
              role="tab"
              aria-selected={tab === k}
              href={k === 'list' ? FEEDBACK_PATH : `${FEEDBACK_PATH}?tab=topics`}
              className={cn('rounded-full px-4 py-1.5', tab === k ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground')}
            >
              {tr(k === 'list' ? c.tabList : c.tabTopics)}
            </Link>
          ))}
        </div>
      </div>
      {!setUp ? (
        <p className="rounded-2xl bg-amber-500/15 p-4 text-sm font-semibold text-amber-800 dark:text-amber-300">{tr(c.notSetUp)}</p>
      ) : tab === 'topics' ? (
        <Topics topics={topics} qrUrl={qrUrl} />
      ) : (
        <Answers rows={rows} topics={topics} range={range} filter={filter} />
      )}
    </div>
  )
}

function Answers({ rows, topics, range, filter }: { rows: FeedbackRow[]; topics: FeedbackTopic[]; range: { from: string; to: string }; filter: string }) {
  const { tr, lang } = useLanguage()
  const label = (k: string) => {
    const t = topics.find((x) => x.key === k)
    return t ? (lang === 'en' && t.labelEn ? t.labelEn : t.label) : k
  }
  const overall = avg(rows.map((r) => r.overall))
  const byTopic = topics
    .map((t) => ({ t, v: avg(rows.map((r) => r.scores[t.key]).filter((x): x is number => typeof x === 'number')) }))
    .filter((x) => x.v !== null)
  const weeks = useMemo(() => {
    const m = new Map<string, number[]>()
    for (const r of rows) {
      const w = monday(r.visitDate)
      if (!m.has(w)) m.set(w, [])
      m.get(w)!.push(r.overall)
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-8)
  }, [rows])
  const dist = [5, 4, 3, 2, 1].map((s) => ({ s, n: rows.filter((r) => r.overall === s).length }))
  const shown = rows.filter((r) =>
    filter === 'follow' ? needsFollowUp(r) : filter === 'comment' ? !!r.comment : filter === 'low' ? r.overall <= 2 : true,
  )
  const q = (f: string) => `${FEEDBACK_PATH}?from=${range.from}&to=${range.to}${f === 'all' ? '' : `&f=${f}`}`
  const day = (d: string) => formatMemberDate(`${d}T12:00:00+07:00`, lang, true) ?? d

  return (
    <>
      <form action={FEEDBACK_PATH} className="flex flex-wrap items-end gap-2 text-sm">
        <label className="grid gap-1">
          <span className="text-xs font-semibold text-muted-foreground">{tr(c.from)}</span>
          <input type="date" name="from" defaultValue={range.from} className="h-10 rounded-xl border border-border bg-background px-3" />
        </label>
        <label className="grid gap-1">
          <span className="text-xs font-semibold text-muted-foreground">{tr(c.to)}</span>
          <input type="date" name="to" defaultValue={range.to} className="h-10 rounded-xl border border-border bg-background px-3" />
        </label>
        {filter !== 'all' && <input type="hidden" name="f" value={filter} />}
        <button type="submit" className="h-10 rounded-full bg-foreground px-4 font-semibold text-background">
          {tr(c.show)}
        </button>
        <a href={`${FEEDBACK_PATH}/export?from=${range.from}&to=${range.to}`} className="ml-auto inline-flex h-10 items-center gap-2 rounded-full border border-border px-4 font-semibold hover:border-primary/40">
          <Download className="h-4 w-4" aria-hidden="true" /> {tr(c.csv)}
        </a>
      </form>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className={card}>
          <p className="text-sm font-semibold text-muted-foreground">{tr(c.avg)}</p>
          <p className="mt-1 flex items-baseline gap-2 font-display text-4xl font-extrabold">
            {one(overall)} <span className="text-base font-semibold text-muted-foreground">/ 5</span>
          </p>
          <p className="text-sm text-muted-foreground">{tr(c.answers).replace('{n}', String(rows.length))}</p>
          <ul className="mt-3 space-y-1">
            {dist.map(({ s, n }) => (
              <li key={s} className="flex items-center gap-2 text-xs">
                <span className="w-6 tabular-nums">{s}★</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                  <span className={cn('block h-full rounded-full', s <= 2 ? 'bg-destructive' : 'bg-amber-400')} style={{ width: `${rows.length ? (n / rows.length) * 100 : 0}%` }} />
                </span>
                <span className="w-8 text-right tabular-nums text-muted-foreground">{n}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className={card}>
          <p className="text-sm font-semibold text-muted-foreground">{tr(c.perTopic)}</p>
          {byTopic.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">—</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {byTopic.map(({ t, v }) => (
                <li key={t.key} className="flex items-center gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">{label(t.key)}</span>
                  <StarRow n={Math.round(v!)} small />
                  <span className="w-8 text-right font-semibold tabular-nums">{one(v)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className={card}>
          <p className="text-sm font-semibold text-muted-foreground">{tr(c.weekly)}</p>
          {weeks.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">—</p>
          ) : (
            <div className="mt-3 flex h-32 items-end gap-1.5">
              {weeks.map(([w, xs]) => {
                const v = avg(xs)!
                return (
                  <div key={w} className="flex min-w-0 flex-1 flex-col items-center gap-1" title={`${day(w)} · ${one(v)} (${xs.length})`}>
                    <span className="text-[10px] font-semibold tabular-nums">{one(v)}</span>
                    <span className={cn('w-full rounded-t', v < 3 ? 'bg-destructive/70' : 'bg-amber-400')} style={{ height: `${(v / 5) * 80}px` }} />
                    <span className="truncate text-[10px] text-muted-foreground">{`${Number(w.slice(8))}/${Number(w.slice(5, 7))}`}</span>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </div>

      <div className="flex flex-wrap gap-1.5 text-sm">
        {(['all', 'follow', 'low', 'comment'] as const).map((f) => (
          <Link
            key={f}
            href={q(f)}
            className={cn('rounded-full border px-3 py-1 font-semibold', filter === f ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:text-foreground')}
          >
            {tr(f === 'all' ? c.filterAll : f === 'follow' ? c.filterFollow : f === 'low' ? c.filterLow : c.filterComment)}
            {f === 'follow' && ` (${rows.filter(needsFollowUp).length})`}
          </Link>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">{tr(c.empty)}</p>
      ) : (
        <ul className="grid gap-3 xl:grid-cols-2">
          {shown.map((r) => (
            <Answer key={r.id} r={r} label={label} day={day} />
          ))}
        </ul>
      )}
    </>
  )
}

function Answer({ r, label, day }: { r: FeedbackRow; label: (k: string) => string; day: (d: string) => string }) {
  const { tr } = useLanguage()
  const router = useRouter()
  const [pending, start] = useTransition()
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const follow = needsFollowUp(r)
  return (
    <li className={cn(card, follow && 'border-destructive/40 bg-destructive/5')}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold">
            {r.memberName}
            {r.memberNo && <span className="ml-2 font-mono text-xs text-muted-foreground">{formatMemberNo(r.memberNo)}</span>}
          </p>
          <p className="text-xs text-muted-foreground">{day(r.visitDate)}</p>
        </div>
        <StarRow n={r.overall} />
      </div>
      {Object.keys(r.scores).length > 0 && (
        <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {Object.entries(r.scores).map(([k, v]) => (
            <span key={k}>
              {label(k)} <b className="text-foreground">{v}</b>
            </span>
          ))}
        </p>
      )}
      {r.comment && (
        <p className="mt-2 flex gap-2 text-sm whitespace-pre-line">
          <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          {r.comment}
        </p>
      )}
      {r.contactMe && (
        <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
          <Phone className="h-3.5 w-3.5" aria-hidden="true" /> {tr(c.wantsContact)}
        </p>
      )}
      {r.handledAt ? (
        <p className="mt-2 text-xs text-accent">
          <Check className="mr-1 inline h-3.5 w-3.5 align-[-2px]" aria-hidden="true" />
          {tr(c.handled)} · {r.handledBy}
          {r.handledNote && <span className="block text-muted-foreground">{r.handledNote}</span>}
        </p>
      ) : follow ? (
        open ? (
          <div className="mt-3 space-y-2">
            <input value={note} onChange={(e) => setNote(e.target.value.slice(0, 500))} placeholder={tr(c.handleNote)} className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm" />
            {error && <p className="text-sm font-semibold text-destructive">{tr(fbErrors[error] ?? fbErrors.failed)}</p>}
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await markHandled(r.id, note)
                  if (res.ok) router.refresh()
                  else setError(res.error)
                })
              }
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-foreground px-4 text-sm font-semibold text-background disabled:opacity-50"
            >
              {pending && <Spinner className="h-4 w-4" />}
              {tr(c.save)}
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => setOpen(true)} className="mt-3 text-sm font-semibold text-destructive hover:underline">
            {tr(c.handle)}
          </button>
        )
      ) : null}
    </li>
  )
}

function Topics({ topics, qrUrl }: { topics: FeedbackTopic[]; qrUrl: string }) {
  const { tr } = useLanguage()
  const router = useRouter()
  const [pending, start] = useTransition()
  const [list, setList] = useState(topics.map((t) => ({ key: t.key as string | undefined, label: t.label, labelEn: t.labelEn ?? '', active: t.active })))
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const set = (i: number, p: Partial<(typeof list)[number]>) => {
    setSaved(false)
    setList(list.map((x, j) => (j === i ? { ...x, ...p } : x)))
  }
  const move = (i: number, d: number) => {
    const j = i + d
    if (j < 0 || j >= list.length) return
    const next = [...list]
    ;[next[i], next[j]] = [next[j], next[i]]
    setSaved(false)
    setList(next)
  }
  const activeCount = list.filter((x) => x.active).length
  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <section className={card}>
        <p className="mb-3 text-sm text-muted-foreground">{tr(c.topicsNote)}</p>
        <ul className="space-y-2">
          {list.map((t, i) => (
            <li key={t.key ?? `new-${i}`} className="flex flex-wrap items-center gap-2 rounded-xl border border-border p-2">
              <div className="flex flex-col">
                <button type="button" aria-label="up" onClick={() => move(i, -1)} className="rounded p-0.5 text-muted-foreground hover:bg-secondary">
                  <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
                <button type="button" aria-label="down" onClick={() => move(i, 1)} className="rounded p-0.5 text-muted-foreground hover:bg-secondary">
                  <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
              <input aria-label={tr(c.topicTh)} placeholder={tr(c.topicTh)} value={t.label} maxLength={40} onChange={(e) => set(i, { label: e.target.value })} className="h-10 min-w-0 flex-1 rounded-xl border border-border bg-background px-3 text-sm" />
              <input aria-label={tr(c.topicEn)} placeholder={tr(c.topicEn)} value={t.labelEn} maxLength={40} onChange={(e) => set(i, { labelEn: e.target.value })} className="h-10 min-w-0 flex-1 rounded-xl border border-border bg-background px-3 text-sm" />
              <label className="flex items-center gap-1.5 px-1 text-sm font-semibold">
                <input type="checkbox" checked={t.active} onChange={(e) => set(i, { active: e.target.checked })} />
                {tr(c.active)}
              </label>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={activeCount >= MAX_TOPICS}
            onClick={() => setList([...list, { key: undefined, label: '', labelEn: '', active: true }])}
            className="inline-flex h-10 items-center gap-1.5 rounded-full border border-border px-4 text-sm font-semibold disabled:opacity-40"
          >
            <Plus className="h-4 w-4" aria-hidden="true" /> {tr(c.addTopic)}
          </button>
          <span className="ml-auto" />
          {saved && <span className="text-sm font-semibold text-accent">✓</span>}
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                setError(null)
                const r = await saveTopics(list)
                if (r.ok) {
                  setSaved(true)
                  router.refresh()
                } else setError(r.error)
              })
            }
            className="inline-flex h-10 items-center gap-1.5 rounded-full bg-primary px-5 text-sm font-bold text-primary-foreground disabled:opacity-50"
          >
            {pending && <Spinner className="h-4 w-4" />}
            {tr(c.save)}
          </button>
        </div>
        {error && <p className="mt-2 text-sm font-semibold text-destructive">{tr(fbErrors[error] ?? fbErrors.failed)}</p>}
      </section>
      <section className={cn(card, 'text-center print:border-0')}>
        <p className="font-semibold">{tr(c.printQr)}</p>
        <p className="mt-1 text-xs text-muted-foreground">{tr(c.printQrHint)}</p>
        <div className="mx-auto mt-3 aspect-square w-48">
          <QrSvg text={qrUrl} />
        </div>
        <p className="mt-2 font-mono text-xs break-all text-muted-foreground">{qrUrl}</p>
        <button type="button" onClick={() => window.print()} className="mt-3 inline-flex h-10 items-center gap-1.5 rounded-full border border-border px-4 text-sm font-semibold print:hidden">
          <Printer className="h-4 w-4" aria-hidden="true" /> {tr(c.print)}
        </button>
      </section>
    </div>
  )
}

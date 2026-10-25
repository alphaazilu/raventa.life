'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { AlertTriangle, Banknote, Check, Download, Lock, Minus, Plus, Wallet } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { toast } from '@/components/ui/toast'
import { Spinner } from '@/components/ui/spinner'
import { CASH_PATH } from '@/lib/auth/roles'
import { DENOMS, cashCopy as c, cashErrors, countedTotal, needsReview, type CashRules, type CashSession, type Counted } from '@/lib/cash'
import { confirmClose, openDrawer, reviewSession, sendCount, type CashResult } from '@/app/console/cash/actions'
import { cn } from '@/lib/utils'

// Front desk › Shift close (§30, v0.31). See app/console/cash/page.tsx.

const card = 'rounded-2xl border border-border bg-card p-4 md:p-5'
const n = (x: number) => x.toLocaleString('en-US')
const when = (iso: string | null, lang: string) =>
  iso
    ? new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
    : '—'

export function CashView({
  tab,
  admin,
  setUp,
  rules,
  current,
  history,
  range,
}: {
  tab: 'drawer' | 'history'
  admin: boolean
  setUp: boolean
  rules: CashRules
  current: CashSession | null
  history: CashSession[]
  range: { from: string; to: string }
}) {
  const { tr } = useLanguage()
  return (
    <div className="flex w-full flex-col gap-5 px-4 py-6 md:px-6 md:py-8 xl:px-8">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="mr-2 font-display text-2xl font-extrabold">{tr(c.title)}</h1>
        {admin && (
          <div className="inline-flex rounded-full bg-secondary p-1 text-sm font-semibold" role="tablist">
            {(['drawer', 'history'] as const).map((k) => (
              <Link
                key={k}
                role="tab"
                aria-selected={tab === k}
                href={k === 'drawer' ? CASH_PATH : `${CASH_PATH}?tab=history`}
                className={cn('rounded-full px-4 py-1.5', tab === k ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground')}
              >
                {tr(k === 'drawer' ? c.tabDrawer : c.tabHistory)}
              </Link>
            ))}
          </div>
        )}
      </div>
      {!setUp ? (
        <p className="rounded-2xl bg-amber-500/15 p-4 text-sm font-semibold text-amber-800 dark:text-amber-300">{tr(c.notSetUp)}</p>
      ) : tab === 'history' ? (
        <History sessions={history} range={range} rules={rules} />
      ) : (
        <Drawer current={current} rules={rules} admin={admin} />
      )}
    </div>
  )
}

function useAction() {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const run = (task: () => Promise<CashResult>, after?: () => void) =>
    start(async () => {
      setError(null)
      const res = await task()
      if (res.ok) {
        after?.()
        router.refresh()
      } else setError(res.error)
    })
  return { pending, error, run }
}

function ErrorLine({ code }: { code: string | null }) {
  const { tr } = useLanguage()
  if (!code) return null
  return (
    <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm font-semibold text-destructive">
      {tr(cashErrors[code] ?? cashErrors.failed)}
    </p>
  )
}

function Drawer({ current, rules, admin }: { current: CashSession | null; rules: CashRules; admin: boolean }) {
  const { tr, lang } = useLanguage()
  const { pending, error, run } = useAction()
  const [justClosed, setJustClosed] = useState(false)

  if (!current) {
    return (
      <section className={cn(card, 'max-w-xl')}>
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-secondary">
            <Lock className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-lg font-bold">{tr(c.closedNow)}</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">{tr(c.closedHint)}</p>
          </div>
        </div>
        <div className="mt-4 flex items-baseline justify-between rounded-xl bg-secondary/60 px-4 py-3">
          <span className="text-sm font-semibold">{tr(c.float)}</span>
          <span className="font-display text-2xl font-extrabold tabular-nums">
            {n(rules.float)} <small className="text-sm font-semibold">{tr(c.baht)}</small>
          </span>
        </div>
        {admin && <p className="mt-1.5 text-xs text-muted-foreground">{tr(c.floatHint)}</p>}
        <div className="mt-4 space-y-3">
          <ErrorLine code={error} />
          <button
            type="button"
            disabled={pending}
            onClick={() => run(openDrawer)}
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary text-base font-bold text-primary-foreground disabled:opacity-50"
          >
            {pending ? <Spinner className="h-5 w-5" /> : <Wallet className="h-5 w-5" aria-hidden="true" />}
            {justClosed ? tr(c.openNext) : tr(c.open)}
          </button>
        </div>
      </section>
    )
  }

  const since = (
    <p className="text-sm text-muted-foreground">
      {tr(c.openSince)} {when(current.openedAt, lang)} · {tr(c.by)} {current.openedBy} · {tr(c.float)} {n(current.float)} {tr(c.baht)}
    </p>
  )
  if (current.status === 'open') return <CountForm session={current} since={since} />
  return <Result session={current} since={since} admin={admin} onClosed={() => {
        setJustClosed(true)
        toast({ text: tr(c.closedDone) })
      }} />
}

function CountForm({ session, since }: { session: CashSession; since: React.ReactNode }) {
  const { tr } = useLanguage()
  const { pending, error, run } = useAction()
  const [counts, setCounts] = useState<Record<string, string>>({})
  const [asking, setAsking] = useState(false)
  const counted: Counted = Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, Number(v) || 0]))
  const total = countedTotal(counted)
  const set = (d: number, v: string) => {
    setAsking(false)
    setCounts((m) => ({ ...m, [d]: v.replace(/\D/g, '').slice(0, 4) }))
  }
  const bump = (d: number, by: number) => set(d, String(Math.max(0, (Number(counts[d]) || 0) + by)))

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <section className={card}>
        <h2 className="text-lg font-bold">{tr(c.countHeading)}</h2>
        {since}
        <ul className="mt-4 divide-y divide-border">
          {DENOMS.map((d) => (
            <li key={d} className="flex items-center gap-3 py-2">
              <span className="w-16 shrink-0 text-base font-bold tabular-nums">
                {n(d)} ฿
              </span>
              <div className="flex min-w-0 flex-1 items-center gap-1.5">
                <button type="button" aria-label={`− ${d}`} onClick={() => bump(d, -1)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border hover:bg-secondary">
                  <Minus className="h-4 w-4" aria-hidden="true" />
                </button>
                <input
                  inputMode="numeric"
                  aria-label={`${n(d)} ฿ · ${tr(c.piece)}`}
                  value={counts[d] ?? ''}
                  onChange={(e) => set(d, e.target.value)}
                  placeholder="0"
                  className="h-11 w-full min-w-0 rounded-xl border border-border bg-background px-3 text-center text-lg font-semibold tabular-nums"
                />
                <button type="button" aria-label={`+ ${d}`} onClick={() => bump(d, 1)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border hover:bg-secondary">
                  <Plus className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
              <span className="w-20 shrink-0 text-right font-semibold tabular-nums">{n(d * (Number(counts[d]) || 0))}</span>
            </li>
          ))}
        </ul>
      </section>
      <aside className={cn(card, 'lg:sticky lg:top-[73px] xl:top-[81px]')}>
        <p className="text-sm font-semibold text-muted-foreground">{tr(c.total)}</p>
        <p className="mt-1 font-display text-4xl font-extrabold tabular-nums">
          {n(total)} <small className="text-base font-semibold">{tr(c.baht)}</small>
        </p>
        <p className="mt-3 rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">{tr(c.countHint)}</p>
        <div className="mt-4 space-y-3">
          <ErrorLine code={error} />
          {asking ? (
            <div className="space-y-2 rounded-xl border border-primary/30 bg-primary/5 p-3">
              <p className="text-sm font-semibold">{tr(c.sendConfirm)}</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setAsking(false)} className="h-11 flex-1 rounded-full border border-border text-sm font-semibold">
                  {tr(c.cancel)}
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => sendCount(session.id, counted))}
                  className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-primary text-sm font-bold text-primary-foreground disabled:opacity-50"
                >
                  {pending && <Spinner className="h-4 w-4" />}
                  {tr(c.yesSend)}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAsking(true)}
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary text-base font-bold text-primary-foreground"
            >
              <Banknote className="h-5 w-5" aria-hidden="true" />
              {tr(c.send)}
            </button>
          )}
        </div>
      </aside>
    </div>
  )
}

function DiffBadge({ diff, big = false }: { diff: number; big?: boolean }) {
  const { tr } = useLanguage()
  const label = diff === 0 ? tr(c.even) : diff < 0 ? `${tr(c.short)} ${n(-diff)} ${tr(c.baht)}` : `${tr(c.over)} ${n(diff)} ${tr(c.baht)}`
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full font-bold',
        big ? 'px-4 py-1.5 text-lg' : 'px-2.5 py-0.5 text-xs',
        diff === 0 ? 'bg-accent/15 text-accent' : 'bg-destructive/10 text-destructive',
      )}
    >
      {diff === 0 ? <Check className={big ? 'h-5 w-5' : 'h-3.5 w-3.5'} aria-hidden="true" /> : <AlertTriangle className={big ? 'h-5 w-5' : 'h-3.5 w-3.5'} aria-hidden="true" />}
      {label}
    </span>
  )
}

function Result({ session, since, admin, onClosed }: { session: CashSession; since: React.ReactNode; admin: boolean; onClosed: () => void }) {
  const { tr } = useLanguage()
  const { pending, error, run } = useAction()
  const [reason, setReason] = useState('')
  const diff = session.diff ?? 0
  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <section className={card}>
        <h2 className="text-lg font-bold">{tr(c.result)}</h2>
        {since}
        <div className="mt-4">
          <DiffBadge diff={diff} big />
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:max-w-md">
          <dt className="text-muted-foreground">{tr(c.total)}</dt>
          <dd className="text-right font-semibold tabular-nums">{n(session.countedTotal ?? 0)}</dd>
          {admin && session.expected !== null && (
            <>
              <dt className="text-muted-foreground">{tr(c.colFloat)}</dt>
              <dd className="text-right tabular-nums">{n(session.float)}</dd>
              <dt className="text-muted-foreground">+ {tr(c.colCashIn)}</dt>
              <dd className="text-right tabular-nums">{n(session.cashIn ?? 0)}</dd>
              <dt className="text-muted-foreground">− {tr(c.colCashOut)}</dt>
              <dd className="text-right tabular-nums">{n(session.cashOut ?? 0)}</dd>
              <dt className="font-semibold">{tr(c.colExpected)}</dt>
              <dd className="text-right font-semibold tabular-nums">{n(session.expected)}</dd>
              <dt className="text-muted-foreground">{tr(c.colTransfer)}</dt>
              <dd className="text-right tabular-nums">{n(session.transfer ?? 0)}</dd>
              <dt className="text-muted-foreground">{tr(c.colCard)}</dt>
              <dd className="text-right tabular-nums">{n(session.card ?? 0)}</dd>
            </>
          )}
        </dl>
        {admin && <p className="mt-3 text-xs text-muted-foreground">{tr(c.compareHint)}</p>}
      </section>
      <aside className={card}>
        <label className="block text-sm font-semibold" htmlFor="cash-reason">
          {diff === 0 ? tr(c.note) : tr(c.reason)}
        </label>
        <textarea
          id="cash-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value.slice(0, 500))}
          rows={3}
          placeholder={diff === 0 ? '' : tr(c.reasonPh)}
          className="mt-1.5 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
        />
        <div className="mt-3 space-y-3">
          <ErrorLine code={error} />
          <button
            type="button"
            disabled={pending || (diff !== 0 && reason.trim().length < 3)}
            onClick={() => run(() => confirmClose(session.id, reason), onClosed)}
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary text-base font-bold text-primary-foreground disabled:opacity-40"
          >
            {pending && <Spinner className="h-5 w-5" />}
            {tr(c.confirm)}
          </button>
          <p className="text-xs text-muted-foreground">{tr(c.lockedHint)}</p>
        </div>
      </aside>
    </div>
  )
}

function History({ sessions, range, rules }: { sessions: CashSession[]; range: { from: string; to: string }; rules: CashRules }) {
  const { tr, lang } = useLanguage()
  const total = sessions.filter((s) => s.diff !== null && s.status === 'closed').reduce((sum, s) => sum + (s.diff ?? 0), 0)
  return (
    <>
      <form action={CASH_PATH} className="flex flex-wrap items-end gap-2 text-sm">
        <input type="hidden" name="tab" value="history" />
        <label className="grid gap-1">
          <span className="text-xs font-semibold text-muted-foreground">{tr(c.from)}</span>
          <input type="date" name="from" defaultValue={range.from} className="h-10 rounded-xl border border-border bg-background px-3" />
        </label>
        <label className="grid gap-1">
          <span className="text-xs font-semibold text-muted-foreground">{tr(c.to)}</span>
          <input type="date" name="to" defaultValue={range.to} className="h-10 rounded-xl border border-border bg-background px-3" />
        </label>
        <button type="submit" className="h-10 rounded-full bg-foreground px-4 font-semibold text-background">
          {tr(c.show)}
        </button>
        <a
          href={`${CASH_PATH}/export?from=${range.from}&to=${range.to}`}
          className="ml-auto inline-flex h-10 items-center gap-2 rounded-full border border-border px-4 font-semibold hover:border-primary/40"
        >
          <Download className="h-4 w-4" aria-hidden="true" /> {tr(c.csv)}
        </a>
      </form>
      {sessions.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">{tr(c.none)}</p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {tr(c.shiftsN).replace('{n}', String(sessions.length))} · {tr(c.totalDiff)} <DiffBadge diff={total} />
          </p>
          <div className="overflow-x-auto rounded-2xl border border-border bg-card">
            <table className="w-full min-w-[60rem] text-sm">
              <thead className="bg-secondary/60 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-semibold">{tr(c.colOpened)}</th>
                  <th className="px-3 py-2 font-semibold">{tr(c.colClosed)}</th>
                  <th className="px-3 py-2 text-right font-semibold">{tr(c.colFloat)}</th>
                  <th className="px-3 py-2 text-right font-semibold">{tr(c.colCashIn)}</th>
                  <th className="px-3 py-2 text-right font-semibold">{tr(c.colCashOut)}</th>
                  <th className="px-3 py-2 text-right font-semibold">{tr(c.colExpected)}</th>
                  <th className="px-3 py-2 text-right font-semibold">{tr(c.colCounted)}</th>
                  <th className="px-3 py-2 font-semibold">{tr(c.colDiff)}</th>
                  <th className="px-3 py-2 text-right font-semibold">{tr(c.colTransfer)}</th>
                  <th className="px-3 py-2 text-right font-semibold">{tr(c.colCard)}</th>
                  <th className="px-3 py-2 font-semibold">{tr(c.colReason)}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sessions.map((s) => (
                  <Row key={s.id} s={s} lang={lang} flag={needsReview(s, rules)} />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  )
}

function Row({ s, lang, flag }: { s: CashSession; lang: string; flag: boolean }) {
  const { tr } = useLanguage()
  const { pending, error, run } = useAction()
  const [note, setNote] = useState('')
  const [open, setOpen] = useState(false)
  const v = (x: number | null) => (x === null ? '—' : n(x))
  return (
    <tr className={cn('align-top', flag && 'bg-destructive/5')}>
      <td className="px-3 py-2.5 whitespace-nowrap">
        {when(s.openedAt, lang)}
        <span className="block text-xs text-muted-foreground">{s.openedBy}</span>
      </td>
      <td className="px-3 py-2.5 whitespace-nowrap">
        {s.status === 'open' ? (
          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:text-amber-300">{tr(c.stillOpen)}</span>
        ) : s.status === 'counted' ? (
          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:text-amber-300">{tr(c.waiting)}</span>
        ) : (
          <>
            {when(s.closedAt, lang)}
            <span className="block text-xs text-muted-foreground">{s.countedBy}</span>
          </>
        )}
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums">{n(s.float)}</td>
      <td className="px-3 py-2.5 text-right tabular-nums">{v(s.cashIn)}</td>
      <td className="px-3 py-2.5 text-right tabular-nums">{v(s.cashOut)}</td>
      <td className="px-3 py-2.5 text-right tabular-nums">{v(s.expected)}</td>
      <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{v(s.countedTotal)}</td>
      <td className="px-3 py-2.5">{s.diff !== null && <DiffBadge diff={s.diff} />}</td>
      <td className="px-3 py-2.5 text-right tabular-nums">{v(s.transfer)}</td>
      <td className="px-3 py-2.5 text-right tabular-nums">{v(s.card)}</td>
      <td className="max-w-[18rem] px-3 py-2.5">
        {s.reason && <p className="break-words">{s.reason}</p>}
        {s.reviewedAt ? (
          <p className="mt-1 text-xs text-accent">
            <Check className="mr-1 inline h-3.5 w-3.5 align-[-2px]" aria-hidden="true" />
            {tr(c.reviewed)} · {s.reviewedBy}
            {s.reviewNote && <span className="block text-muted-foreground">{s.reviewNote}</span>}
          </p>
        ) : s.status === 'closed' && s.diff !== 0 ? (
          open ? (
            <div className="mt-1.5 space-y-1.5">
              <input
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, 500))}
                placeholder={tr(c.reviewNote)}
                className="h-9 w-full rounded-lg border border-border bg-background px-2 text-xs"
              />
              <ErrorLine code={error} />
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => reviewSession(s.id, note))}
                className="inline-flex h-8 items-center gap-1.5 rounded-full bg-foreground px-3 text-xs font-semibold text-background disabled:opacity-50"
              >
                {pending && <Spinner className="h-3.5 w-3.5" />}
                {tr(c.review)}
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setOpen(true)} className={cn('mt-1 text-xs font-semibold hover:underline', flag ? 'text-destructive' : 'text-primary')}>
              {flag ? `${tr(c.needsReview)} · ` : ''}
              {tr(c.review)}
            </button>
          )
        ) : null}
      </td>
    </tr>
  )
}

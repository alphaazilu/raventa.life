'use client'

import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { ArrowLeft, Check, Clock, KeyRound, LockOpen, LogOut, RotateCw, Tablet } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { consoleCopy as c, lockErrors } from '@/lib/console/copy'
import { DESK_PATH } from '@/lib/auth/roles'
import { bangkokTime } from '@/lib/check-in/day'
import { QrScanner } from '@/components/admin/qr-scanner'
import { AppVersion } from '@/components/console/app-version'
import { signInWithCard } from '@/app/console/lock-actions'
import { clockByCard, type ClockResult } from '@/app/console/clock-actions'
import { cn } from '@/lib/utils'

// A registered counter tablet with nobody working on it (v0.21):
//   [Clock in/out]  scan your card → in, or (if in) confirm → out. The
//                   tablet stays locked — the next person can scan straight away.
//   [Open system]   scan your card → work under your name (clocks you in too).
// The camera only runs after a button is tapped, and goes off again after
// a quiet minute. A password sign-in stays available for a forgotten phone.

type Mode = 'home' | 'clock' | 'open'
type Done = Extract<ClockResult, { ok: true }>

const SCAN_IDLE_MS = 60_000
const RESULT_MS = 4_000

const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ''))

export function TabletLock({
  deviceName,
  notStaff,
  signOutAction,
  onShift = [],
}: {
  deviceName: string
  notStaff: boolean
  signOutAction: () => Promise<void>
  // Who is clocked in right now (first name + since), for the strip.
  onShift?: { name: string; since: string }[]
}) {
  const { tr, lang } = useLanguage()
  const router = useRouter()
  const [busy, start] = useTransition()
  const [mode, setMode] = useState<Mode>('home')
  const [error, setError] = useState<string | null>(null)
  const [opening, setOpening] = useState(false)
  const [result, setResult] = useState<Done | null>(null)
  const [left, setLeft] = useState(0)
  const token = useRef<string>('')
  const [now, setNow] = useState<Date | null>(null)

  useEffect(() => {
    setNow(new Date())
    const id = setInterval(() => setNow(new Date()), 15_000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (!error) return
    const id = setTimeout(() => setError(null), 6000)
    return () => clearTimeout(id)
  }, [error])

  const home = useCallback(() => {
    setMode('home')
    setResult(null)
    setError(null)
    token.current = ''
    router.refresh()
  }, [router])

  // Scanning with nobody there → back to the lock screen (camera off).
  const lastActivity = useRef(0)
  useEffect(() => {
    if (mode === 'home' || result) return
    lastActivity.current = Date.now()
    const id = setInterval(() => {
      if (Date.now() - lastActivity.current > SCAN_IDLE_MS) home()
    }, 5000)
    return () => clearInterval(id)
  }, [mode, result, home])

  // A finished clock-in/out shows briefly, then the next person.
  useEffect(() => {
    if (!result || result.kind === 'confirm') return
    const total = result.kind === 'just_in' ? RESULT_MS * 2 : RESULT_MS
    const end = Date.now() + total
    setLeft(Math.ceil(total / 1000))
    const id = setInterval(() => {
      const ms = end - Date.now()
      if (ms <= 0) home()
      else setLeft(Math.ceil(ms / 1000))
    }, 250)
    return () => clearInterval(id)
  }, [result, home])

  const onCode = (text: string) => {
    if (busy || opening || result) return
    lastActivity.current = Date.now()
    const raw = text.trim()
    if (!raw.startsWith('RV1.')) return setError('qr_invalid')
    start(async () => {
      setError(null)
      if (mode === 'open') {
        const res = await signInWithCard(raw)
        if (!res.ok) return setError(res.error)
        setOpening(true)
        window.location.replace(res.to)
        return
      }
      const res = await clockByCard(raw, false)
      if (!res.ok) return setError(res.error)
      token.current = raw
      setResult(res)
    })
  }

  const confirmOut = () =>
    start(async () => {
      const res = await clockByCard(token.current, true)
      if (!res.ok) {
        setResult(null)
        return setError(res.error)
      }
      setResult(res)
    })

  const hm = (mins: number) => fill(tr(c.lkHm), { h: Math.floor(mins / 60), m: mins % 60 })
  const dateText = now
    ? new Intl.DateTimeFormat(lang === 'th' ? 'th-TH' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Bangkok' }).format(now)
    : ''
  const clock = now ? bangkokTime(now.toISOString()) : ''

  return (
    <main className="flex min-h-dvh flex-col bg-background px-5 py-5 md:px-8">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Image src="/images/logo-emblem.png" alt="" width={405} height={404} className="h-9 w-9" priority />
          <Image src="/images/logo-wordmark.png" alt="RAVENTA" width={1166} height={157} className="hidden h-[17px] w-auto sm:block" priority />
          <span className="rounded-full border border-border bg-secondary px-2.5 py-0.5 font-display text-[10px] font-bold tracking-[0.14em] text-secondary-foreground uppercase">
            {tr(c.backOffice)}
          </span>
        </div>
        <span className="flex items-center gap-2 text-sm text-muted-foreground">
          <Tablet className="h-4 w-4" aria-hidden="true" />
          {deviceName}
        </span>
      </header>

      {notStaff ? (
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center text-center">
          <p className="text-base font-semibold text-destructive">{tr(c.lockNotStaff)}</p>
          <form action={signOutAction} className="mt-5 w-full">
            <button type="submit" className="flex h-12 w-full items-center justify-center gap-2 rounded-full border border-border text-sm font-semibold text-foreground">
              <LogOut className="h-4 w-4" aria-hidden="true" />
              {tr(c.lockSignOut)}
            </button>
          </form>
        </div>
      ) : result ? (
        <ResultView result={result} busy={busy} hm={hm} left={left} onConfirm={confirmOut} onCancel={home} />
      ) : mode === 'home' ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-7 py-6">
          <div className="text-center">
            <p className="font-display text-6xl font-extrabold tracking-tight text-foreground md:text-7xl">{clock || ' '}</p>
            <p className="mt-1 text-base text-muted-foreground">{dateText}</p>
          </div>
          <div className="grid w-full max-w-3xl gap-4 sm:grid-cols-2 sm:gap-6">
            <BigButton primary icon={Clock} title={tr(c.lkClock)} sub={tr(c.lkClockSub)} onClick={() => setMode('clock')} />
            <BigButton icon={LockOpen} title={tr(c.lkOpen)} sub={tr(c.lkOpenSub)} onClick={() => setMode('open')} />
          </div>
          {onShift.length > 0 && (
            <div className="flex flex-wrap items-center justify-center gap-2">
              <span className="text-xs font-semibold text-muted-foreground">{tr(c.lkToday)}</span>
              {onShift.map((p, i) => (
                <span key={i} className="inline-flex items-center gap-2 rounded-full border border-border py-1 pl-1 pr-3 text-sm">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                    {(p.name.replace(/^[เแโใไ]+/, '')[0] ?? '?').toUpperCase()}
                  </span>
                  <b>{p.name}</b>
                  <span className="text-accent">{bangkokTime(p.since)}</span>
                </span>
              ))}
            </div>
          )}
          {error && <p className="text-sm font-semibold text-destructive">{tr(lockErrors[error] ?? lockErrors.failed)}</p>}
        </div>
      ) : (
        // Fits one screen: side by side when the tablet is landscape; in
        // portrait the camera is sized from the screen height, not its width.
        <div className="mx-auto grid w-full max-w-5xl flex-1 content-center items-center gap-6 py-4 md:landscape:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
          <div className="flex flex-col items-center text-center md:landscape:items-start md:landscape:text-left">
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-bold text-white',
                mode === 'clock' ? 'bg-primary' : 'bg-foreground',
              )}
            >
              {mode === 'clock' ? <Clock className="h-4 w-4" aria-hidden="true" /> : <LockOpen className="h-4 w-4" aria-hidden="true" />}
              {tr(mode === 'clock' ? c.lkClock : c.lkOpen)}
            </span>
            <h1 className="mt-3 font-display text-2xl font-extrabold text-foreground md:text-3xl">
              {tr(mode === 'clock' ? c.lkClockTitle : c.lkOpenTitle)}
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">{tr(mode === 'clock' ? c.lkClockHint : c.lkOpenHint)}</p>
            <div className="mt-3 min-h-6" aria-live="polite">
              {error && <p className="text-sm font-semibold text-destructive">{tr(lockErrors[error] ?? lockErrors.failed)}</p>}
              {opening && (
                <p className="flex items-center gap-1.5 text-sm font-semibold text-accent">
                  <Check className="h-4 w-4" aria-hidden="true" /> {tr(c.lockWelcome)}
                </p>
              )}
            </div>
            <button type="button" onClick={home} className="mt-2 inline-flex h-11 items-center gap-2 rounded-full border border-border px-5 text-sm font-semibold">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {tr(c.lkBack)}
            </button>
            <p className="mt-3 text-xs text-muted-foreground">{tr(c.lkIdleHint)}</p>
          </div>
          <div className="mx-auto w-full max-w-[min(36rem,calc((100dvh-22rem)*4/3))] md:landscape:max-w-[min(36rem,calc((100dvh-9rem)*4/3))]">
            <QrScanner autoStart onCode={onCode} paused={busy || opening} pausedText={tr(opening ? c.lockWelcome : c.lockChecking)} hint={null} />
          </div>
        </div>
      )}

      <footer className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>{tr(c.lkFoot)}</span>
        <span className="flex items-center gap-4">
          <a href={`/login?next=${encodeURIComponent(DESK_PATH)}`} className="inline-flex items-center gap-1.5 hover:text-foreground hover:underline">
            <KeyRound className="h-3.5 w-3.5" aria-hidden="true" /> {tr(c.lockSignIn)}
          </a>
          <button type="button" onClick={() => window.location.reload()} className="inline-flex items-center gap-1.5 hover:text-foreground">
            <RotateCw className="h-3.5 w-3.5" aria-hidden="true" /> {tr(c.lkRefresh)}
          </button>
          <AppVersion />
        </span>
      </footer>
    </main>
  )
}

function BigButton({
  primary,
  icon: Icon,
  title,
  sub,
  onClick,
}: {
  primary?: boolean
  icon: typeof Clock
  title: string
  sub: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex h-44 flex-col items-center justify-center gap-2.5 rounded-[28px] shadow-lg transition-transform active:scale-[0.98] sm:h-56',
        primary ? 'bg-primary text-primary-foreground' : 'border-2 border-foreground bg-background text-foreground',
      )}
    >
      <span className={cn('flex h-16 w-16 items-center justify-center rounded-full', primary ? 'bg-white/20' : 'bg-secondary')}>
        <Icon className="h-8 w-8" aria-hidden="true" />
      </span>
      <span className="font-display text-3xl font-extrabold">{title}</span>
      <span className={cn('text-sm', primary ? 'text-primary-foreground/85' : 'text-muted-foreground')}>{sub}</span>
    </button>
  )
}

function ResultView({
  result,
  busy,
  hm,
  left,
  onConfirm,
  onCancel,
}: {
  result: Done
  busy: boolean
  hm: (m: number) => string
  left: number
  onConfirm: () => void
  onCancel: () => void
}) {
  const { tr } = useLanguage()
  const shift = result.shift ? `${result.shift.name} ${result.shift.start}–${result.shift.end}` : tr(c.lkNoShift)
  const rows: [string, React.ReactNode][] =
    result.kind === 'in'
      ? [
          [tr(c.lkShift), shift],
          [
            tr(c.lkStatus),
            result.shift ? (
              result.lateMinutes > 0 ? (
                <span className="font-semibold text-destructive">{fill(tr(c.lkLate), { m: result.lateMinutes })}</span>
              ) : (
                <span className="font-semibold text-accent">{tr(c.lkOnTime)}</span>
              )
            ) : (
              '—'
            ),
          ],
        ]
      : result.kind === 'out'
        ? [
            [tr(c.lkToday2), <b key="w">{hm(result.workedMinutes)}</b>],
            ...(result.shift && result.paidMinutes !== result.workedMinutes ? ([[tr(c.lkPaidNote), hm(result.paidMinutes)]] as [string, React.ReactNode][]) : []),
            [tr(c.lkOt), result.otMinutes > 0 ? hm(result.otMinutes) : '—'],
          ]
        : [
            [tr(c.lkClockedInAt), bangkokTime(result.clockIn)],
            [tr(c.lkWorked), <b key="w">{hm(result.workedMinutes)}</b>],
            [tr(c.lkShift), shift],
          ]
  const title =
    result.kind === 'in'
      ? `${tr(c.lkInTitle)} ${bangkokTime(result.at)}`
      : result.kind === 'out'
        ? `${tr(c.lkOutTitle)} ${bangkokTime(result.at)}`
        : result.kind === 'confirm'
          ? tr(c.lkOutAsk)
          : `${tr(c.lkJustIn)} ${bangkokTime(result.clockIn)}`
  const asking = result.kind === 'confirm' || result.kind === 'just_in'
  return (
    <div className="flex flex-1 items-center justify-center py-6">
      <div className="w-full max-w-lg">
        <div className="flex items-center gap-4">
          <span
            className={cn(
              'flex h-20 w-20 shrink-0 items-center justify-center rounded-full text-white',
              result.kind === 'in' ? 'bg-accent' : result.kind === 'out' ? 'bg-foreground' : 'bg-amber-600',
            )}
          >
            {asking ? <span className="font-display text-4xl font-extrabold">?</span> : <Check className="h-10 w-10" aria-hidden="true" />}
          </span>
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">{result.name}</p>
            <p className="font-display text-3xl font-extrabold text-foreground">{title}</p>
          </div>
        </div>
        <dl className="mt-4">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 border-t border-border py-2.5 text-[15px]">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="text-right">{v}</dd>
            </div>
          ))}
        </dl>
        {result.kind === 'just_in' && <p className="mt-1 text-xs text-muted-foreground">{tr(c.lkJustInHint)}</p>}
        {asking ? (
          <div className="mt-4 flex gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={onConfirm}
              className="h-14 flex-1 rounded-full bg-primary text-base font-bold text-primary-foreground disabled:opacity-50"
            >
              {tr(c.lkConfirmOut)}
            </button>
            <button type="button" onClick={onCancel} className="h-14 w-36 rounded-full border border-border text-sm font-semibold">
              {tr(c.lkCancel)}
            </button>
          </div>
        ) : null}
        {!asking || result.kind === 'just_in' ? <p className="mt-3 text-sm text-muted-foreground">{fill(tr(c.lkBackIn), { s: left })}</p> : null}
      </div>
    </div>
  )
}

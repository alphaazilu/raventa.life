'use client'

import Image from 'next/image'
import { useCallback, useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { Clock, Lock } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { consoleCopy } from '@/lib/console/copy'
import { CONSOLE_PATH } from '@/lib/auth/roles'
import { Spinner } from '@/components/ui/spinner'

const POLL_MS = 2500

type State =
  | { kind: 'loading' }
  | { kind: 'code'; code: string; expiresAt: number; qr: string }
  | { kind: 'expired' }
  | { kind: 'paired' }
  | { kind: 'error'; error: 'busy' | 'not_set_up' | 'failed' }

// /tablet — shows this tablet's pairing code until an admin approves it,
// then opens the console. The QR is a link to the admin's Devices page with
// the code filled in, so a phone camera can scan it directly.
export function TabletPair({ siteUrl }: { siteUrl: string }) {
  const { tr } = useLanguage()
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [now, setNow] = useState(() => Date.now())

  const start = useCallback(async () => {
    setState({ kind: 'loading' })
    try {
      const res = await fetch('/api/console/pair', { method: 'POST', cache: 'no-store' })
      const body = await res.json()
      if (!body.ok) return setState({ kind: 'error', error: body.error ?? 'failed' })
      const link = `${siteUrl}/console/devices?code=${body.code}`
      const qr = await QRCode.toDataURL(link, { margin: 1, width: 480, color: { dark: '#2b2521', light: '#ffffff' } })
      setState({ kind: 'code', code: body.code, expiresAt: Date.parse(body.expiresAt), qr })
    } catch {
      setState({ kind: 'error', error: 'failed' })
    }
  }, [siteUrl])

  useEffect(() => {
    void start()
  }, [start])

  // Countdown + poll while a code is showing.
  useEffect(() => {
    if (state.kind !== 'code') return
    const tick = setInterval(() => setNow(Date.now()), 1000)
    const poll = setInterval(async () => {
      try {
        const res = await fetch('/api/console/pair', { cache: 'no-store' })
        const { status } = await res.json()
        if (status === 'paired') {
          setState({ kind: 'paired' })
          window.location.replace(CONSOLE_PATH)
        } else if (status === 'expired') setState({ kind: 'expired' })
        else if (status === 'none') void start()
      } catch {
        /* offline for a moment — keep polling */
      }
    }, POLL_MS)
    return () => {
      clearInterval(tick)
      clearInterval(poll)
    }
  }, [state.kind, start])

  const left = state.kind === 'code' ? Math.max(0, state.expiresAt - now) : 0
  useEffect(() => {
    if (state.kind === 'code' && left === 0) setState({ kind: 'expired' })
  }, [state.kind, left])
  const mmss = `${Math.floor(left / 60000)}:${String(Math.floor((left % 60000) / 1000)).padStart(2, '0')}`

  return (
    <main className="flex min-h-dvh flex-col bg-background px-6 py-6 md:px-10">
      <header className="flex items-center gap-3">
        <Image src="/images/logo-emblem.png" alt="" width={405} height={404} className="h-9 w-9" priority />
        <Image src="/images/logo-wordmark.png" alt="RAVENTA" width={1166} height={157} className="h-[17px] w-auto" priority />
        <span className="rounded-full border border-border bg-secondary px-2.5 py-0.5 font-display text-[10px] font-bold tracking-[0.14em] text-secondary-foreground uppercase">
          {tr(consoleCopy.backOffice)}
        </span>
      </header>

      <div className="mx-auto grid w-full max-w-5xl flex-1 items-center gap-10 py-8 md:grid-cols-[1fr_400px]">
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">{tr(consoleCopy.pairEyebrow)}</p>
          <h1 className="mt-2 font-display text-3xl font-extrabold leading-tight text-foreground md:text-4xl">
            {tr(consoleCopy.pairHeading)}
          </h1>
          <p className="mt-3 text-base leading-relaxed text-muted-foreground">{tr(consoleCopy.pairIntro)}</p>
          <ol className="mt-7 space-y-4">
            {[consoleCopy.pairStep1, consoleCopy.pairStep2, consoleCopy.pairStep3].map((s, i) => (
              <li key={i} className="flex items-start gap-3.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-bold text-secondary-foreground">
                  {i + 1}
                </span>
                <span className="pt-1 text-[15px] leading-relaxed text-foreground">{tr(s)}</span>
              </li>
            ))}
          </ol>
        </div>

        <section className="flex flex-col items-center rounded-2xl border border-border bg-card p-7" aria-live="polite">
          {state.kind === 'loading' && <Spinner className="my-24 h-8 w-8" />}
          {state.kind === 'code' && (
            <>
              <div className="rounded-2xl border border-border bg-white p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={state.qr} alt={`QR ${state.code}`} width={240} height={240} className="h-60 w-60" />
              </div>
              <p className="mt-5 text-xs font-semibold tracking-wide text-muted-foreground">{tr(consoleCopy.pairOrType)}</p>
              <p className="mt-2 rounded-xl border border-border bg-secondary px-6 py-2 font-display text-4xl font-extrabold tracking-[0.22em] text-primary">
                {state.code.slice(0, 3)}&#8201;{state.code.slice(3)}
              </p>
              <p className="mt-3 flex items-center gap-1.5 text-sm text-muted-foreground">
                <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                {tr(consoleCopy.pairExpiresIn)} {mmss} · {tr(consoleCopy.pairOnce)}
              </p>
            </>
          )}
          {state.kind === 'expired' && (
            <div className="flex flex-col items-center py-16 text-center">
              <p className="text-base font-semibold text-foreground">{tr(consoleCopy.pairExpired)}</p>
              <button
                type="button"
                onClick={() => void start()}
                className="mt-4 h-12 rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground"
              >
                {tr(consoleCopy.pairNewCode)}
              </button>
            </div>
          )}
          {state.kind === 'paired' && (
            <p className="flex items-center gap-2 py-24 text-base font-semibold text-accent">
              <Spinner className="h-5 w-5" /> {tr(consoleCopy.pairDone)}
            </p>
          )}
          {state.kind === 'error' && (
            <div className="flex flex-col items-center py-14 text-center">
              <p className="text-sm font-semibold text-destructive">
                {tr(state.error === 'busy' ? consoleCopy.pairBusy : state.error === 'not_set_up' ? consoleCopy.pairNotSetUp : consoleCopy.pairFailed)}
              </p>
              <button
                type="button"
                onClick={() => void start()}
                className="mt-4 h-11 rounded-full border border-border px-5 text-sm font-semibold text-foreground"
              >
                {tr(consoleCopy.pairNewCode)}
              </button>
            </div>
          )}
        </section>
      </div>

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Lock className="h-3.5 w-3.5" aria-hidden="true" />
        {tr(consoleCopy.pairFooter)}
      </p>
    </main>
  )
}

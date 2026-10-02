'use client'

import Image from 'next/image'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { QrCode, Sun, X } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { authCopy } from '@/lib/auth/copy'
import { AvatarCircle } from '@/components/account/avatar-circle'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import { formatMemberDate, formatMemberNo } from '@/lib/format-date'


// The member's QR as one SVG path (no canvas, no image URL — the site's
// security policy blocks blob: images, and a path scales crisply). The QR
// library is fetched when the code is first shown, not with the page.
type QrLib = typeof import('qrcode')
let qrLib: Promise<QrLib> | null = null

function QrSvg({ text }: { text: string }) {
  const [lib, setLib] = useState<QrLib | null>(null)
  useEffect(() => {
    let alive = true
    // CommonJS module: the functions sit on .default once bundled.
    void (qrLib ??= import('qrcode').then((m) => ((m as { default?: QrLib }).default ?? m) as QrLib)).then((m) => alive && setLib(m))
    return () => {
      alive = false
    }
  }, [])
  const qr = useMemo(() => {
    if (!lib) return null
    const { modules } = lib.create(text, { errorCorrectionLevel: 'M' })
    let d = ''
    for (let y = 0; y < modules.size; y++) {
      for (let x = 0; x < modules.size; x++) {
        if (modules.get(x, y)) d += `M${x} ${y}h1v1h-1z`
      }
    }
    return { size: modules.size, path: d }
  }, [lib, text])
  if (!qr) return <Spinner className="m-auto h-6 w-6 text-primary" />
  return (
    <svg viewBox={`0 0 ${qr.size} ${qr.size}`} className="h-full w-full" shapeRendering="crispEdges" aria-hidden="true">
      <path d={qr.path} fill="#1c1916" />
    </svg>
  )
}

type Person = { name: string; memberNo: string | null; avatarUrl: string | null; joinedAt: string | null }

// The RAVENTA card itself (also the left half of the sideways view):
// white, a faint emblem watermark, the wordmark, member number and QR
// button in RAVENTA red. Its container supplies the white box.
function CardFace({ name, memberNo, avatarUrl, joinedAt, showQrHint }: Person & { showQrHint: boolean }) {
  const { tr, lang } = useLanguage()
  const since = formatMemberDate(joinedAt, lang, false)
  return (
    <>
      <Image
        src="/images/logo-emblem.png"
        alt=""
        aria-hidden="true"
        width={405}
        height={404}
        className="pointer-events-none absolute -top-[14%] -right-[12%] h-[125%] w-auto opacity-[0.07] select-none"
      />
      <span className="relative flex w-full items-center justify-between">
        <Image src="/images/logo-wordmark.png" alt="RAVENTA" width={1166} height={157} className="h-4 w-auto" />
        <span className="font-display text-[10px] font-semibold tracking-[0.22em] text-accent">MEMBER</span>
      </span>
      <span className="relative flex items-center gap-3">
        <AvatarCircle src={avatarUrl} name={name} className="h-12 w-12 text-xl" />
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-lg font-semibold">{name}</span>
          {since && (
            <span className="text-xs text-muted-foreground">
              {tr(authCopy.memberSince)} {since}
            </span>
          )}
        </span>
      </span>
      <span className="relative flex w-full items-end justify-between">
        <span className="flex flex-col">
          <span className="font-display text-[9px] font-semibold tracking-[0.2em] text-muted-foreground">MEMBER NO.</span>
          <span className="font-display text-base font-semibold tracking-[0.12em] text-primary">
            {formatMemberNo(memberNo)}
          </span>
        </span>
        {showQrHint && (
          <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <QrCode className="h-8 w-8" strokeWidth={1.75} />
          </span>
        )}
      </span>
    </>
  )
}

export function MemberCard({ name, memberNo, avatarUrl, joinedAt, autoOpen }: Person & { autoOpen: boolean }) {
  const { tr } = useLanguage()
  const [open, setOpen] = useState(autoOpen)
  const cardRef = useRef<HTMLButtonElement>(null)

  const close = useCallback(() => {
    setOpen(false)
    // Opened straight from LINE (/account?card=1): drop the flag so a
    // refresh doesn't pop the QR up again.
    const url = new URL(window.location.href)
    if (url.searchParams.has('card')) {
      url.searchParams.delete('card')
      window.history.replaceState(null, '', url.pathname + url.search + url.hash)
    }
    cardRef.current?.focus()
  }, [])

  return (
    <div className="flex flex-col items-center gap-2.5">
      <button
        ref={cardRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-label={tr(authCopy.memberCardOpen)}
        className="relative flex aspect-[1.586] w-full max-w-sm flex-col justify-between overflow-hidden rounded-2xl border border-border bg-white px-5 py-5 text-left text-foreground shadow-[0_10px_24px_rgba(46,70,54,0.14)] transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 active:scale-[0.99]"
      >
        <CardFace name={name} memberNo={memberNo} avatarUrl={avatarUrl} joinedAt={joinedAt} showQrHint />
      </button>
      <p className="text-sm text-muted-foreground">{tr(authCopy.memberCardTapHint)}</p>
      {open && <QrOverlay name={name} memberNo={memberNo} avatarUrl={avatarUrl} joinedAt={joinedAt} onClose={close} />}
    </div>
  )
}

type TokenState =
  | { status: 'loading' }
  | { status: 'ready'; token: string; nextAt: number; periodMs: number }
  | { status: 'error' }

function QrOverlay({ name, memberNo, avatarUrl, joinedAt, onClose }: Person & { onClose: () => void }) {
  const { tr } = useLanguage()
  const [state, setState] = useState<TokenState>({ status: 'loading' })
  const [now, setNow] = useState(() => Date.now())
  const dialogRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    try {
      const res = await fetch('/api/member-card/token', { cache: 'no-store' })
      if (!res.ok) throw new Error(String(res.status))
      const body = (await res.json()) as { token: string; refreshIn: number }
      const periodMs = body.refreshIn * 1000
      setState({ status: 'ready', token: body.token, nextAt: Date.now() + periodMs, periodMs })
      timerRef.current = setTimeout(load, periodMs)
    } catch {
      setState({ status: 'error' })
    }
  }, [])

  // Fetch the first code, then keep them coming; the countdown ticks once a
  // second. Phones pause timers when locked, so coming back to the page
  // fetches straight away if the code is stale.
  useEffect(() => {
    load()
    const tick = setInterval(() => setNow(Date.now()), 1000)
    const onVisible = () => {
      if (document.visibilityState === 'visible') load()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(tick)
      if (timerRef.current) clearTimeout(timerRef.current)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [load])

  // Keep the screen awake while the QR is up (where the browser allows it —
  // some in-app browsers don't; nothing breaks if so).
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null
    const request = async () => {
      try {
        lock = (await (navigator as Navigator & {
          wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> }
        }).wakeLock?.request('screen')) ?? null
      } catch {
        lock = null
      }
    }
    request()
    const onVisible = () => {
      if (document.visibilityState === 'visible') request()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      lock?.release().catch(() => {})
    }
  }, [])

  // Behave like a dialog: page behind doesn't scroll, Escape closes, focus
  // starts on the close button.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    // Focus the dialog itself (not the close button) so no focus ring
    // shows until someone actually uses the keyboard.
    dialogRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const secondsLeft = state.status === 'ready' ? Math.max(0, Math.ceil((state.nextAt - now) / 1000)) : 0
  const barPercent = state.status === 'ready' ? Math.min(100, Math.max(0, ((state.nextAt - now) / state.periodMs) * 100)) : 0

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={tr(authCopy.memberCardDialog)}
      className="fixed inset-0 z-[100] flex flex-col overflow-y-auto bg-white text-foreground outline-none"
    >
      <div className="mx-auto flex h-16 w-full max-w-md shrink-0 items-center justify-between px-5 phone-landscape:absolute phone-landscape:top-2 phone-landscape:right-3 phone-landscape:h-auto phone-landscape:w-auto phone-landscape:max-w-none phone-landscape:px-0">
        <button
          type="button"
          onClick={onClose}
          aria-label={tr(authCopy.memberCardClose)}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-background text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <X className="h-5 w-5" />
        </button>
        <span className="flex items-center gap-2 phone-landscape:hidden">
          <Image src="/images/logo-emblem.png" alt="" width={405} height={404} className="h-8 w-8" />
          <Image src="/images/logo-wordmark.png" alt="RAVENTA" width={1166} height={157} className="h-[14px] w-auto" />
        </span>
        <span className="w-11 phone-landscape:hidden" />
      </div>

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center gap-5 px-6 pb-8 phone-landscape:max-w-none phone-landscape:flex-row phone-landscape:justify-center phone-landscape:gap-8 phone-landscape:py-4 phone-landscape:pr-16 phone-landscape:pb-4">
        {/* Upright: a compact name row. Sideways: the full card. */}
        <div className="flex w-full items-center gap-3 phone-landscape:hidden">
          <AvatarCircle src={avatarUrl} name={name} className="h-12 w-12 text-xl" />
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-lg font-semibold">{name}</span>
            <span className="font-display text-sm tracking-[0.1em] text-muted-foreground">
              {formatMemberNo(memberNo)}
            </span>
          </div>
        </div>
        <div className="relative hidden aspect-[1.586] h-[min(70vh,270px)] shrink-0 flex-col justify-between overflow-hidden rounded-2xl border border-border bg-white p-6 text-foreground shadow-[0_10px_24px_rgba(46,70,54,0.12)] phone-landscape:flex">
          <CardFace name={name} memberNo={memberNo} avatarUrl={avatarUrl} joinedAt={joinedAt} showQrHint={false} />
        </div>

        <div className="flex flex-col items-center gap-3">
          <div className="flex aspect-square w-[min(82vw,340px)] items-center justify-center rounded-2xl border border-border bg-white p-4 phone-landscape:w-[min(66vh,280px)]">
            {state.status === 'ready' && <QrSvg text={state.token} />}
            {state.status === 'loading' && <Spinner className="h-8 w-8 text-muted-foreground" />}
            {state.status === 'error' && (
              <div className="flex flex-col items-center gap-3 px-4 text-center">
                <p className="text-sm text-muted-foreground">{tr(authCopy.memberCardLoadFailed)}</p>
                <button
                  type="button"
                  onClick={() => {
                    setState({ status: 'loading' })
                    load()
                  }}
                  className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground"
                >
                  {tr(authCopy.memberCardRetry)}
                </button>
                <p className="font-display text-xl font-semibold tracking-[0.12em] text-foreground">
                  {formatMemberNo(memberNo)}
                </p>
              </div>
            )}
          </div>
          <div className={cn('flex w-[min(82vw,340px)] flex-col items-center gap-1.5 phone-landscape:w-[min(66vh,280px)]', state.status !== 'ready' && 'invisible')}>
            <div className="h-1 w-full rounded-full bg-muted">
              <div className="h-1 rounded-full bg-loading transition-[width] duration-1000 ease-linear" style={{ width: `${barPercent}%` }} />
            </div>
            <p className="text-xs text-muted-foreground">
              {tr(authCopy.memberCardRefreshIn)} {secondsLeft} {tr(authCopy.memberCardSeconds)}
            </p>
          </div>
        </div>

        <div className="flex w-full items-center gap-2.5 rounded-xl bg-background px-4 py-3 text-sm phone-landscape:hidden">
          <Sun className="h-5 w-5 shrink-0 text-[#b98c5e]" />
          <span>{tr(authCopy.memberCardBrightness)}</span>
        </div>
        <p className="mt-auto text-xs text-muted-foreground phone-landscape:hidden">{tr(authCopy.memberCardFallback)}</p>
      </div>
    </div>
  )
}

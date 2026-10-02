'use client'

import { AppVersion } from '@/components/console/app-version'
import Image from 'next/image'
import { useEffect, useState, useTransition } from 'react'
import { Check, KeyRound, LogOut, Tablet } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { consoleCopy, lockErrors } from '@/lib/console/copy'
import { DESK_PATH } from '@/lib/auth/roles'
import { QrScanner } from '@/components/admin/qr-scanner'
import { signInWithCard } from '@/app/console/lock-actions'

// A registered counter tablet with nobody working on it: staff scan their
// own member card to start (Vault R2). A password sign-in stays available
// for a forgotten phone.
export function TabletLock({
  deviceName,
  notStaff,
  signOutAction,
}: {
  deviceName: string
  notStaff: boolean
  signOutAction: () => Promise<void>
}) {
  const { tr } = useLanguage()
  const [busy, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [clock, setClock] = useState('')

  useEffect(() => {
    const fmt = () =>
      setClock(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' }).format(new Date()))
    fmt()
    const id = setInterval(fmt, 15_000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (!error) return
    const id = setTimeout(() => setError(null), 6000)
    return () => clearTimeout(id)
  }, [error])

  const onCode = (text: string) => {
    if (busy || done) return
    if (!text.trim().startsWith('RV1.')) return setError('qr_invalid')
    start(async () => {
      setError(null)
      const res = await signInWithCard(text)
      if (!res.ok) return setError(res.error)
      setDone(true)
      window.location.replace(res.to)
    })
  }

  return (
    <main className="flex min-h-dvh flex-col bg-background px-5 py-5 md:px-8">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Image src="/images/logo-emblem.png" alt="" width={405} height={404} className="h-9 w-9" priority />
          <Image src="/images/logo-wordmark.png" alt="RAVENTA" width={1166} height={157} className="hidden h-[17px] w-auto sm:block" priority />
          <span className="rounded-full border border-border bg-secondary px-2.5 py-0.5 font-display text-[10px] font-bold tracking-[0.14em] text-secondary-foreground uppercase">
            {tr(consoleCopy.backOffice)}
          </span>
        </div>
        <span className="flex items-center gap-2 text-sm text-muted-foreground">
          <Tablet className="h-4 w-4" aria-hidden="true" />
          {deviceName}
          {clock && <b className="font-semibold text-foreground">· {clock}</b>}
        </span>
      </header>

      {notStaff ? (
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center text-center">
          <p className="text-base font-semibold text-destructive">{tr(consoleCopy.lockNotStaff)}</p>
          <form action={signOutAction} className="mt-5 w-full">
            <button type="submit" className="flex h-12 w-full items-center justify-center gap-2 rounded-full border border-border text-sm font-semibold text-foreground">
              <LogOut className="h-4 w-4" aria-hidden="true" />
              {tr(consoleCopy.lockSignOut)}
            </button>
          </form>
        </div>
      ) : (
        <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center py-6">
          <p className="text-center text-sm font-semibold text-accent">{tr(consoleCopy.lockRegistered)}</p>
          <h1 className="mt-1 text-center font-display text-2xl font-extrabold text-foreground md:text-3xl">{tr(consoleCopy.lockHeading)}</h1>
          <p className="mt-2 text-center text-sm text-muted-foreground">{tr(consoleCopy.lockHint)}</p>

          <div className="relative mt-5">
            <QrScanner
              onCode={onCode}
              paused={busy || done}
              pausedText={tr(done ? consoleCopy.lockWelcome : consoleCopy.lockChecking)}
              hint={null}
            />
          </div>

          <div className="mt-3 min-h-6 text-center" aria-live="polite">
            {error && <p className="text-sm font-semibold text-destructive">{tr(lockErrors[error] ?? lockErrors.failed)}</p>}
            {done && (
              <p className="flex items-center justify-center gap-1.5 text-sm font-semibold text-accent">
                <Check className="h-4 w-4" aria-hidden="true" /> {tr(consoleCopy.lockWelcome)}
              </p>
            )}
          </div>

          <a
            href={`/login?next=${encodeURIComponent(DESK_PATH)}`}
            className="mx-auto mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            <KeyRound className="h-4 w-4" aria-hidden="true" />
            {tr(consoleCopy.lockSignIn)}
          </a>
        </div>
      )}
      <AppVersion className="text-center" />
    </main>
  )
}

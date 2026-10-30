'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { HeartPulse, X } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { Spinner } from '@/components/ui/spinner'
import { authCopy, waiverCopy as c } from '@/lib/auth/copy'
import { waiverText } from '@/lib/legal/content'
import { acceptWaiver } from '@/app/account/waiver-actions'

// The health-risk waiver, accepted by the member themselves (§54, v0.43.0):
// a card on My account, and a step before the member QR shows. Same text as
// the desk's card (lib/legal/content.ts). Once accepted for this version,
// neither shows again — and staff at the desk aren't asked to confirm it.

function WaiverForm({ acceptLabel, onAccepted, onSkip }: { acceptLabel: string; onAccepted: () => void; onSkip?: () => void }) {
  const { tr } = useLanguage()
  const [ticked, setTicked] = useState(false)
  const [failed, setFailed] = useState(false)
  const [pending, start] = useTransition()

  const accept = () =>
    start(async () => {
      const res = await acceptWaiver().catch(() => ({ ok: false }))
      setFailed(!res.ok)
      if (res.ok) onAccepted()
    })

  return (
    <>
      <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-card-foreground">
        {waiverText.points.map((pt, i) => (
          <li key={i}>{tr(pt)}</li>
        ))}
      </ul>
      <label className="mt-4 flex items-start gap-2.5 text-sm font-semibold text-card-foreground">
        <input
          type="checkbox"
          checked={ticked}
          onChange={(e) => setTicked(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-border text-primary focus:ring-2 focus:ring-primary"
        />
        <span>{tr(c.self)}</span>
      </label>
      {failed && <p className="mt-2 text-xs text-destructive">{tr(c.failed)}</p>}
      <button
        type="button"
        disabled={!ticked || pending}
        onClick={accept}
        aria-busy={pending}
        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending && <Spinner />}
        {acceptLabel}
      </button>
      {onSkip && (
        <button type="button" onClick={onSkip} className="mt-3 w-full text-center text-xs font-semibold text-muted-foreground underline-offset-2 hover:underline">
          {tr(c.skip)}
        </button>
      )}
    </>
  )
}

function Heading() {
  const { tr } = useLanguage()
  return (
    <>
      <p className="flex items-center gap-2 font-display text-lg font-bold text-card-foreground">
        <HeartPulse className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
        {tr(waiverText.title)}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">{tr(c.intro)}</p>
    </>
  )
}

/** My account: a card until the member has accepted the current version. */
export function WaiverCard({ onAccepted }: { onAccepted: () => void }) {
  const { tr } = useLanguage()
  return (
    <section className="mt-4 rounded-2xl border border-primary/30 bg-card p-5">
      <Heading />
      <WaiverForm acceptLabel={tr(c.accept)} onAccepted={onAccepted} />
    </section>
  )
}

/** Opening the member card: this step first, then the QR (or skip → the QR). */
export function WaiverStep({ onAccepted, onSkip, onClose }: { onAccepted: () => void; onSkip: () => void; onClose: () => void }) {
  const { tr } = useLanguage()
  const ref = useRef<HTMLDivElement>(null)

  // Behave like a dialog (same as the QR screen): no page scroll behind,
  // Escape closes.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    ref.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={tr(waiverText.title)}
      className="fixed inset-0 z-[100] flex flex-col overflow-y-auto bg-background text-foreground outline-none"
    >
      <div className="mx-auto flex h-16 w-full max-w-md shrink-0 items-center px-5">
        <button
          type="button"
          onClick={onClose}
          aria-label={tr(authCopy.memberCardClose)}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-card text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="mx-auto w-full max-w-md px-5 pb-10">
        <div className="rounded-2xl border border-border bg-card p-6">
          <Heading />
          <WaiverForm acceptLabel={tr(c.acceptShowQr)} onAccepted={onAccepted} onSkip={onSkip} />
        </div>
      </div>
    </div>
  )
}

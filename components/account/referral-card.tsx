'use client'

import { useEffect, useState } from 'react'
import { Check, ChevronDown, Copy, UserPlus } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { cmCopy } from '@/lib/commission'
import { cn } from '@/lib/utils'

// My account › My work (team): my referral code and QR (§36, v0.36). A new
// guest scans the QR with their phone camera → the sign-up page with my
// code filled in. I earn once, on their first paid bill.

export type MyReferral = { code: string; link: string; earns: boolean }

export function ReferralCard({ data, startOpen = false }: { data: MyReferral; startOpen?: boolean }) {
  const { tr } = useLanguage()
  const [open, setOpen] = useState(startOpen)
  const [qr, setQr] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!open || qr) return
    let alive = true
    void import('qrcode').then(({ default: QRCode }) =>
      QRCode.toDataURL(data.link, { margin: 1, width: 480, errorCorrectionLevel: 'M', color: { dark: '#2b2521', light: '#ffffff' } }).then((u) => alive && setQr(u)),
    )
    return () => {
      alive = false
    }
  }, [open, qr, data.link])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(data.link)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {}
  }

  return (
    <section className="mt-3 rounded-2xl border border-border bg-card">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-3 p-4 text-left">
        <UserPlus className="h-6 w-6 shrink-0 text-primary" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{tr(cmCopy.myRef)}</span>
          <span className="block text-xs text-muted-foreground">
            {tr(cmCopy.myRefCode)} <span className="font-mono font-bold tracking-widest text-foreground">{data.code}</span>
          </span>
        </span>
        <ChevronDown className={cn('h-5 w-5 text-muted-foreground transition-transform', open && 'rotate-180')} aria-hidden="true" />
      </button>
      {open && (
        <div className="border-t border-border px-4 pb-4 pt-3 text-center">
          <p className="text-xs text-muted-foreground">{tr(cmCopy.myRefSub)}</p>
          <div className="mx-auto mt-3 aspect-square w-full max-w-[15rem] rounded-2xl bg-white p-3">
            {qr ? <img src={qr} alt={`${tr(cmCopy.myRef)} ${data.code}`} className="h-full w-full" /> : <div className="h-full w-full animate-pulse rounded-xl bg-secondary" />}
          </div>
          <p className="mt-3 font-mono text-2xl font-extrabold tracking-[0.3em]">{data.code}</p>
          <button
            type="button"
            onClick={copy}
            className="mt-3 inline-flex h-10 items-center gap-1.5 rounded-full border border-border px-4 text-sm font-semibold hover:bg-secondary"
          >
            {copied ? <Check className="h-4 w-4 text-accent" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
            {tr(copied ? cmCopy.copied : cmCopy.copyLink)}
          </button>
          {!data.earns && <p className="mt-3 rounded-xl bg-amber-500/15 px-3 py-2 text-xs font-semibold text-amber-800 dark:text-amber-300">{tr(cmCopy.myRefOff)}</p>}
        </div>
      )}
    </section>
  )
}

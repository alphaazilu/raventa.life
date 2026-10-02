'use client'

import { useEffect, useState } from 'react'
import { Check, Copy, Download, Share, SquarePlus, X } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { consoleCopy as c } from '@/lib/console/copy'
import { cn } from '@/lib/utils'

// "Add to Home Screen" for the counter tablet (/tablet).
// - Android / desktop Chrome: a real install button (beforeinstallprompt).
// - iPad / iPhone: browsers can't add the icon for you, so the button opens
//   the exact steps (Safari's Share → Add to Home Screen). Chrome on iPad
//   often lacks that menu item, so it says to open the page in Safari.
// Hidden once the page is already running from the home-screen icon.
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }
type Platform = 'ios-safari' | 'ios-other' | 'other'

export function InstallApp({ className }: { className?: string }) {
  const { tr } = useLanguage()
  const [installed, setInstalled] = useState(true) // until we know (avoids a flash)
  const [platform, setPlatform] = useState<Platform>('other')
  const [prompt, setPrompt] = useState<InstallEvent | null>(null)
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true
    setInstalled(standalone)
    const ua = navigator.userAgent
    const ios = /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1)
    setPlatform(ios ? (/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua) ? 'ios-other' : 'ios-safari') : 'other')
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setPrompt(e as InstallEvent)
    }
    const onInstalled = () => setInstalled(true)
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  // Nothing to offer: already an app, or a browser with no install route.
  if (installed || (platform === 'other' && !prompt)) return null

  const click = async () => {
    if (prompt) {
      await prompt.prompt()
      const { outcome } = await prompt.userChoice
      if (outcome === 'accepted') setInstalled(true)
      setPrompt(null)
      return
    }
    setOpen(true)
  }

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      /* clipboard blocked — the address is shown for typing */
    }
  }

  return (
    <div className={cn('rounded-2xl border-2 border-primary/30 bg-primary/5 p-4', className)}>
      <p className="text-sm font-bold text-foreground">{tr(c.installTitle)}</p>
      <p className="mt-1 text-sm text-muted-foreground">{tr(c.installWhy)}</p>
      <button
        type="button"
        onClick={click}
        className="mt-3 inline-flex h-12 items-center gap-2 rounded-full bg-primary px-5 text-sm font-bold text-primary-foreground"
      >
        {prompt ? <Download className="h-4 w-4" aria-hidden="true" /> : <SquarePlus className="h-4 w-4" aria-hidden="true" />}
        {tr(c.installButton)}
      </button>

      {open && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-[95] flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md rounded-3xl bg-background p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-display text-xl font-extrabold">{tr(c.installButton)}</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label={tr(c.installClose)} className="text-muted-foreground">
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            {platform === 'ios-safari' ? (
              <ol className="mt-4 space-y-3 text-[15px]">
                <li className="flex items-center gap-3">
                  <Step n={1} />
                  <span>
                    {tr(c.installIos1)} <Share className="inline h-4 w-4 align-[-2px] text-primary" aria-label="Share" />{' '}
                    {tr(c.installIos1b)}
                  </span>
                </li>
                <li className="flex items-center gap-3">
                  <Step n={2} />
                  <span>
                    {tr(c.installIos2)} <SquarePlus className="inline h-4 w-4 align-[-2px] text-primary" aria-hidden="true" />{' '}
                    <b>{tr(c.installIos2b)}</b>
                  </span>
                </li>
                <li className="flex items-center gap-3">
                  <Step n={3} />
                  <span>{tr(c.installIos3)}</span>
                </li>
                <li className="flex items-center gap-3">
                  <Step n={4} />
                  <span>{tr(c.installIos4)}</span>
                </li>
              </ol>
            ) : (
              <div className="mt-4 space-y-3 text-[15px]">
                <p>{tr(c.installUseSafari)}</p>
                <p className="rounded-xl bg-secondary px-3 py-2 font-mono text-sm">{typeof window !== 'undefined' ? window.location.host + window.location.pathname : ''}</p>
                <button type="button" onClick={copyLink} className="inline-flex h-11 items-center gap-2 rounded-full border border-border px-4 text-sm font-semibold">
                  {copied ? <Check className="h-4 w-4 text-accent" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
                  {tr(copied ? c.installCopied : c.installCopy)}
                </button>
              </div>
            )}
            <p className="mt-5 text-xs text-muted-foreground">{tr(c.installNote)}</p>
          </div>
        </div>
      )}
    </div>
  )
}

function Step({ n }: { n: number }) {
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-bold text-secondary-foreground">{n}</span>
  )
}

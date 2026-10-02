'use client'

import { useEffect, useState } from 'react'
import { RotateCw } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { consoleCopy as c } from '@/lib/console/copy'

const CHECK_EVERY_MS = 5 * 60 * 1000
const MINE = `${process.env.NEXT_PUBLIC_APP_VERSION ?? ''}|${process.env.NEXT_PUBLIC_COMMIT_SHA ?? ''}`

// A home-screen app on the tablet has no reload button and can keep an old
// build for days. Every few minutes (and when the screen wakes) ask which
// build is live; if it isn't this one, offer a one-tap reload.
export function UpdateBanner() {
  const { tr } = useLanguage()
  const [stale, setStale] = useState(false)
  useEffect(() => {
    const check = async () => {
      try {
        const r = await fetch('/api/version', { cache: 'no-store' })
        if (!r.ok) return
        const v = (await r.json()) as { version: string; sha: string }
        if (`${v.version}|${v.sha}` !== MINE) setStale(true)
      } catch {
        /* offline — try later */
      }
    }
    void check()
    const id = setInterval(check, CHECK_EVERY_MS)
    const onVisible = () => document.visibilityState === 'visible' && void check()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])
  if (!stale) return null
  return (
    <button
      type="button"
      onClick={() => window.location.reload()}
      className="fixed inset-x-0 bottom-4 z-[80] mx-auto flex w-fit items-center gap-2 rounded-full bg-foreground px-5 py-3 text-sm font-semibold text-background shadow-lg"
    >
      <RotateCw className="h-4 w-4" aria-hidden="true" />
      {tr(c.updateReady)}
    </button>
  )
}

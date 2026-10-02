'use client'

import { useEffect, useRef, useState } from 'react'
import { useLanguage } from '@/components/language-provider'
import { Spinner } from '@/components/ui/spinner'

// One "working on it" indicator for the whole Back Office. Every button or
// tab in the console ends in a request to the server (a server action, or
// the data for the next page), and on a slow connection the screen used to
// just sit there. This watches those requests and dims the screen with a
// spinner while one that YOU started is still running.
//
// "You started" = it began within a moment of a tap, click or key press, so
// the background refreshes (the floor list every 30 s, the dashboard every
// minute) never flash the overlay. It only appears after a short delay, so
// fast answers don't flicker, and it blocks taps meanwhile — no double
// submits.

const SHOW_AFTER_MS = 250
const USER_WINDOW_MS = 1500
const GIVE_UP_MS = 30_000

function isAppRequest(input: RequestInfo | URL, init?: RequestInit): boolean {
  try {
    const req = input instanceof Request ? input : null
    const url = new URL(req ? req.url : String(input), window.location.href)
    if (url.origin !== window.location.origin) return false
    const headers = new Headers(init?.headers ?? req?.headers)
    // Background prefetches aren't something anyone is waiting for.
    if (headers.has('next-router-prefetch')) return false
    // Server actions carry Next-Action; page/data navigations carry RSC.
    return headers.has('next-action') || headers.has('rsc')
  } catch {
    return false
  }
}

export function BusyOverlay() {
  const { tr } = useLanguage()
  const [visible, setVisible] = useState(false)
  const pending = useRef(0)
  const lastInput = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const giveUp = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const mark = () => {
      lastInput.current = Date.now()
    }
    const opts = { capture: true, passive: true } as const
    window.addEventListener('pointerdown', mark, opts)
    window.addEventListener('keydown', mark, opts)
    window.addEventListener('submit', mark, opts)

    const update = () => {
      if (pending.current > 0) {
        if (!timer.current && !visible) timer.current = setTimeout(() => setVisible(true), SHOW_AFTER_MS)
        if (giveUp.current) clearTimeout(giveUp.current)
        giveUp.current = setTimeout(() => {
          pending.current = 0
          update()
        }, GIVE_UP_MS)
      } else {
        if (timer.current) clearTimeout(timer.current)
        if (giveUp.current) clearTimeout(giveUp.current)
        timer.current = null
        giveUp.current = null
        setVisible(false)
      }
    }

    const original = window.fetch
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const tracked = Date.now() - lastInput.current < USER_WINDOW_MS && isAppRequest(input, init)
      if (tracked) {
        pending.current += 1
        update()
      }
      try {
        return await original(input, init)
      } finally {
        if (tracked) {
          pending.current = Math.max(0, pending.current - 1)
          // Let React paint the result before lifting the dim.
          requestAnimationFrame(update)
        }
      }
    }

    return () => {
      window.fetch = original
      window.removeEventListener('pointerdown', mark, opts)
      window.removeEventListener('keydown', mark, opts)
      window.removeEventListener('submit', mark, opts)
      if (timer.current) clearTimeout(timer.current)
      if (giveUp.current) clearTimeout(giveUp.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!visible) return null
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/30 backdrop-blur-[1px] motion-safe:animate-fade-in"
    >
      <div className="flex items-center gap-3 rounded-full bg-background px-6 py-3.5 text-sm font-semibold text-foreground shadow-lg">
        <Spinner className="h-5 w-5 text-primary" />
        {tr({ th: 'กำลังดำเนินการ…', en: 'Working on it…' })}
      </div>
    </div>
  )
}

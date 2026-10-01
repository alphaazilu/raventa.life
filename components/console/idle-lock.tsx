'use client'

import { useEffect, useRef, useState } from 'react'
import { useLanguage } from '@/components/language-provider'
import { consoleCopy } from '@/lib/console/copy'
import { lockConsole } from '@/app/console/lock-actions'

const WARN_MS = 30_000

// Counter tablet only: nobody touching it for a while signs the person out
// and returns to the lock screen (10 min for staff, 5 for an admin). Uses
// the wall clock, so a tablet that slept past the limit locks on waking.
export function IdleLock({ minutes }: { minutes: number }) {
  const { tr } = useLanguage()
  const limit = minutes * 60_000
  const lastRef = useRef(Date.now())
  const [left, setLeft] = useState<number | null>(null)
  const lockingRef = useRef(false)

  useEffect(() => {
    const bump = () => {
      lastRef.current = Date.now()
      setLeft(null)
    }
    const events = ['pointerdown', 'keydown', 'touchstart', 'wheel'] as const
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }))
    const check = () => {
      const remaining = limit - (Date.now() - lastRef.current)
      if (remaining <= 0) {
        if (!lockingRef.current) {
          lockingRef.current = true
          void lockConsole('idle')
        }
      } else setLeft(remaining <= WARN_MS ? remaining : null)
    }
    const id = setInterval(check, 1000)
    document.addEventListener('visibilitychange', check)
    return () => {
      events.forEach((e) => window.removeEventListener(e, bump))
      clearInterval(id)
      document.removeEventListener('visibilitychange', check)
    }
  }, [limit])

  if (left === null) return null
  return (
    <div role="alert" className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
      <div className="flex items-center gap-3 rounded-full bg-foreground px-5 py-3 text-sm text-background shadow-lg">
        {tr(consoleCopy.idleWarn)} {Math.ceil(left / 1000)} s
        <button type="button" className="rounded-full bg-background px-3 py-1 text-xs font-semibold text-foreground">
          {tr(consoleCopy.idleStay)}
        </button>
      </div>
    </div>
  )
}

'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Tablet } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { consoleCopy } from '@/lib/console/copy'
import { TABLET_SETUP_PATH } from '@/lib/auth/roles'

// The Back Office home-screen icon on a tablet that isn't registered can land
// on the login page, and that full-screen app has no address bar to type
// /tablet. Only there (opened from the home screen) offer the way to
// register this tablet instead of signing in.
export function TabletSetupHint() {
  const { tr } = useLanguage()
  const [show, setShow] = useState(false)
  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true
    setShow(standalone)
  }, [])
  if (!show) return null
  return (
    <div className="mx-auto mb-6 w-full max-w-md px-4">
      <Link
        href={TABLET_SETUP_PATH}
        className="flex items-center gap-3 rounded-2xl border-2 border-primary bg-background px-4 py-4 text-left hover:bg-secondary"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Tablet className="h-5 w-5" aria-hidden="true" />
        </span>
        <span className="flex flex-col">
          <span className="text-base font-bold text-foreground">{tr(consoleCopy.setupHintTitle)}</span>
          <span className="text-sm text-muted-foreground">{tr(consoleCopy.setupHintBody)}</span>
        </span>
      </Link>
    </div>
  )
}

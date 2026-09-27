'use client'

import Image from 'next/image'
import { useEffect, useRef, useState } from 'react'
import { useLanguage } from '@/components/language-provider'
import { authCopy } from '@/lib/auth/copy'
import { startOAuth } from '@/components/auth/oauth-buttons'
import { Spinner } from '@/components/ui/spinner'

// What someone sees after tapping the LINE OA rich menu (/login?via=line):
// just the logo and a spinner while LINE signs them in — never the
// email/password form, which only confused people arriving from LINE.
export function LineAutoLogin({ next }: { next: string }) {
  const { tr } = useLanguage()
  const [failed, setFailed] = useState(false)
  // React runs effects twice in development; one redirect is enough.
  const started = useRef(false)

  const go = async () => {
    setFailed(false)
    const { error } = await startOAuth('custom:line', next)
    if (error) {
      console.error('LINE auto-login could not start', error.message)
      setFailed(true)
    }
  }

  useEffect(() => {
    if (started.current) return
    started.current = true
    void go()
    // Once on mount by design.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-sm flex-col items-center justify-center px-4 py-16 text-center">
      <Image
        src="/images/logo-icon.png"
        alt="RAVENTA"
        width={72}
        height={72}
        className="h-18 w-18 rounded-2xl object-cover"
        priority
      />
      {failed ? (
        <>
          <p className="mt-6 text-sm text-destructive">{tr(authCopy.oauthFailed)}</p>
          <button
            type="button"
            onClick={go}
            className="mt-4 rounded-full bg-[#06C755] px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#05B34C]"
          >
            {tr(authCopy.line)}
          </button>
          <a href="/login" className="mt-3 text-xs font-semibold text-muted-foreground underline-offset-2 hover:underline">
            {tr(authCopy.otherSignInOptions)}
          </a>
        </>
      ) : (
        <p className="mt-6 flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
          <Spinner className="h-5 w-5 text-[#06C755]" />
          {tr(authCopy.lineConnecting)}
        </p>
      )}
    </div>
  )
}

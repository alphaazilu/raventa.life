'use client'

import { useState } from 'react'
import { useLanguage } from '@/components/language-provider'
import { authCopy } from '@/lib/auth/copy'
import { createClient } from '@/lib/supabase/client'
import { LineIcon } from '@/components/auth/oauth-buttons'

export type LinkLineResult = 'linked' | 'already_used' | 'failed' | null

// Lets a member who joined with email or Google attach their LINE account,
// so LINE sign-in lands on the same membership (same member number) and we
// get their LINE user ID for OA messages. Needs "Allow manual linking" on in
// Supabase → Authentication → Sign In / Providers.
export function LinkLine({ linked, result }: { linked: boolean; result: LinkLineResult }) {
  const { tr } = useLanguage()
  const [pending, setPending] = useState(false)
  const [startError, setStartError] = useState(false)

  const handleLink = async () => {
    setPending(true)
    setStartError(false)
    const supabase = createClient()
    // Same callback as a normal sign-in; `link=line` tells it to send any
    // failure back here rather than to the login page.
    const next = encodeURIComponent('/account?linked=line')
    const redirectTo = `${window.location.origin}/auth/callback?link=line&next=${next}`
    const { error } = await supabase.auth.linkIdentity({
      provider: 'custom:line',
      options: { redirectTo, scopes: 'openid profile' },
    })
    // Only reached when linking can't even start (e.g. manual linking is
    // switched off in Supabase) — otherwise the browser is already on LINE.
    if (error) {
      console.error('linkIdentity failed to start', error.message)
      setPending(false)
      setStartError(true)
    }
  }

  const message =
    result === 'linked'
      ? { text: tr(authCopy.lineLinkedSuccess), tone: 'text-accent' }
      : result === 'already_used'
        ? { text: tr(authCopy.lineLinkAlreadyUsed), tone: 'text-destructive' }
        : result === 'failed' || startError
          ? { text: tr(authCopy.lineLinkFailed), tone: 'text-destructive' }
          : null

  return (
    <div className="mt-6 border-t border-border pt-5">
      <p className="text-xs font-semibold tracking-wide uppercase text-muted-foreground">
        {tr(authCopy.lineLinkLabel)}
      </p>
      {linked ? (
        <p className="mt-2 flex items-center gap-2 text-sm text-card-foreground">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#06C755]">
            <LineIcon className="h-4 w-4 text-white" />
          </span>
          {tr(authCopy.lineLinked)}
        </p>
      ) : (
        <>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{tr(authCopy.lineLinkHint)}</p>
          <button
            type="button"
            onClick={handleLink}
            disabled={pending}
            className="mt-3 inline-flex items-center gap-2 rounded-full bg-[#06C755] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#05B34C] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <LineIcon className="h-5 w-5 shrink-0 text-white" />
            {tr(authCopy.lineLinkButton)}
          </button>
        </>
      )}
      {message && <p className={`mt-2 text-sm ${message.tone}`}>{message.text}</p>}
    </div>
  )
}

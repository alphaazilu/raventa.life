'use client'

import { useState } from 'react'
import { useLanguage } from '@/components/language-provider'
import { authCopy } from '@/lib/auth/copy'
import { codeErrorText } from '@/lib/auth/code-errors'
import { confirmGoogleLinkCode, sendGoogleLinkCode } from '@/app/login/google-link-actions'
import { getBrowserClient } from '@/lib/supabase/client'
import { GoogleIcon } from '@/components/auth/oauth-buttons'
import { Spinner } from '@/components/ui/spinner'

// Shown on /login after a Google sign-in was refused because the email
// already has an account: send a code to that account's email → enter it →
// signed in (server) → link Google (browser) → back on Settings.
export function GoogleLinkPanel({ maskedEmail }: { maskedEmail: string }) {
  const { tr } = useLanguage()
  const [sent, setSent] = useState(false)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [linking, setLinking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const send = async () => {
    setBusy(true)
    setError(null)
    const res = await sendGoogleLinkCode()
    setBusy(false)
    if (!res.ok) return setError(res.error)
    setSent(true)
    setCode('')
  }

  const confirm = async () => {
    setBusy(true)
    setError(null)
    const res = await confirmGoogleLinkCode(code)
    if (!res.ok) {
      setBusy(false)
      return setError(res.error)
    }
    setLinking(true)
    const supabase = await getBrowserClient()
    const next = encodeURIComponent('/account/settings?linked=google')
    const { error: linkError } = await supabase.auth.linkIdentity({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback?link=google&next=${next}` },
    })
    // Only reached if linking can't start — they're signed in by now, so
    // Settings is where they can try again.
    if (linkError) window.location.assign('/account/settings?link=google&link_error=start')
  }

  return (
    <div className="rounded-2xl border-2 border-primary/30 bg-primary/5 p-4 text-sm">
      <p className="flex items-center gap-2 font-bold text-foreground">
        <GoogleIcon className="h-4 w-4" />
        {tr(authCopy.googleLinkTitle)}
      </p>
      <p className="mt-1.5 leading-relaxed text-secondary-foreground">{tr(authCopy.googleLinkIntro)}</p>

      {!sent ? (
        <button
          type="button"
          onClick={send}
          disabled={busy}
          className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-primary px-5 font-semibold text-primary-foreground disabled:opacity-50"
        >
          {busy && <Spinner className="h-4 w-4" />}
          {tr(authCopy.googleLinkSend)} {maskedEmail}
        </button>
      ) : (
        <div className="mt-3 space-y-3">
          <p>
            {tr(authCopy.emailCodeSentTo)} <span className="font-semibold">{maskedEmail}</span>
            <span className="mt-1 block text-xs text-muted-foreground">{tr(authCopy.emailCodeCheckSpam)}</span>
          </p>
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            aria-label={tr(authCopy.emailCodeLabel)}
            maxLength={6}
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && code.length === 6 && !busy) confirm()
            }}
            className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-center font-mono text-xl tracking-[0.5em] outline-none focus:border-primary"
          />
          <button
            type="button"
            onClick={confirm}
            disabled={busy || code.length !== 6}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-primary px-5 font-semibold text-primary-foreground disabled:opacity-50"
          >
            {busy && <Spinner className="h-4 w-4" />}
            {tr(linking ? authCopy.googleLinkLinking : authCopy.googleLinkConfirm)}
          </button>
          {!linking && (
            <button type="button" onClick={send} disabled={busy} className="w-full text-center font-semibold text-primary disabled:opacity-50">
              {tr(authCopy.emailCodeResend)}
            </button>
          )}
        </div>
      )}
      {error && <p className="mt-3 text-destructive">{codeErrorText(error, tr)}</p>}
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{tr(authCopy.googleLinkNoInbox)}</p>
    </div>
  )
}

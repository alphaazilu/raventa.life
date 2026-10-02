'use client'

import { useState } from 'react'
import { useLanguage } from '@/components/language-provider'
import { authCopy } from '@/lib/auth/copy'
import { getBrowserClient } from '@/lib/supabase/client'
import { Spinner } from '@/components/ui/spinner'
import { LineIcon } from '@/components/auth/oauth-buttons'
import {
  startMerge,
  verifyMerge,
  type MergeTarget,
  type StartMergeResult,
  type VerifyMergeResult,
} from '@/app/complete-profile/merge-actions'

type Step = 'offer' | 'code' | 'linking'

const START_ERRORS: Record<Exclude<StartMergeResult, { ok: true }>['reason'], keyof typeof authCopy> = {
  not_allowed: 'mergeFailed',
  not_found: 'mergeNotFound',
  target_has_line: 'mergeTargetHasLine',
  too_soon: 'mergeTooSoon',
  target_limit: 'mergeTargetLimit',
  failed: 'mergeFailed',
}

const VERIFY_ERRORS: Record<Exclude<VerifyMergeResult, { ok: true }>['reason'], keyof typeof authCopy> = {
  not_allowed: 'mergeFailed',
  wrong_code: 'mergeWrongCode',
  expired: 'mergeExpired',
  too_many_attempts: 'mergeTooMany',
  failed: 'mergeFailed',
}

const buttonBase =
  'inline-flex w-full items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-semibold transition-opacity disabled:cursor-not-allowed disabled:opacity-50'

// Shown on /complete-profile when a LINE sign-in types an email or phone
// that's already a member's. The person chooses: prove it's theirs with a
// code (sent to that membership's own email) and carry on as that member,
// or go back and use a different email/phone.
export function MergePanel({ target, onUseAnother }: { target: MergeTarget; onUseAnother: () => void }) {
  const byEmail = 'email' in target
  const { tr } = useLanguage()
  const [step, setStep] = useState<Step>('offer')
  const [busy, setBusy] = useState(false)
  const [maskedEmail, setMaskedEmail] = useState('')
  const [code, setCode] = useState('')
  const [errorKey, setErrorKey] = useState<keyof typeof authCopy | null>(null)

  const sendCode = async () => {
    setBusy(true)
    setErrorKey(null)
    const result = await startMerge(target)
    setBusy(false)
    if (result.ok) {
      setMaskedEmail(result.maskedEmail)
      setCode('')
      setStep('code')
    } else {
      setErrorKey(START_ERRORS[result.reason])
    }
  }

  const verify = async () => {
    setBusy(true)
    setErrorKey(null)
    const result = await verifyMerge(code)
    if (!result.ok) {
      setBusy(false)
      setErrorKey(VERIFY_ERRORS[result.reason])
      return
    }
    // Now signed in as the existing member (the server switched the session
    // cookies). Attach LINE to it and land on the account page.
    setStep('linking')
    await linkLineAfterMerge(result.canLinkLine)
  }

  return (
    <div className="mt-6 space-y-4">
      {step === 'offer' && (
        <>
          <div className="rounded-xl bg-secondary p-4">
            <p className="font-semibold text-foreground">
              {tr(byEmail ? authCopy.mergeTitle : authCopy.mergeTitlePhone)}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{'email' in target ? target.email : target.phone}</p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{tr(authCopy.mergeBody)}</p>
          </div>
          <button
            type="button"
            onClick={sendCode}
            disabled={busy}
            aria-busy={busy}
            className={`${buttonBase} bg-[#06C755] text-white hover:opacity-90`}
          >
            {busy ? <Spinner className="h-5 w-5" /> : <LineIcon className="h-5 w-5 shrink-0 text-white" />}
            {tr(authCopy.mergeLinkButton)}
          </button>
          <button
            type="button"
            onClick={onUseAnother}
            disabled={busy}
            className={`${buttonBase} border border-border bg-background text-foreground hover:border-primary/40`}
          >
            {tr(byEmail ? authCopy.mergeUseAnother : authCopy.mergeUseAnotherPhone)}
          </button>
        </>
      )}

      {step === 'code' && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void verify()
          }}
          className="space-y-4"
        >
          <p className="text-sm leading-relaxed text-muted-foreground">
            {tr(authCopy.mergeCodeSent)} <span className="font-semibold text-foreground">{maskedEmail}</span>
            <span className="mt-1 block text-xs text-muted-foreground">{tr(authCopy.emailCodeCheckSpam)}</span>
          </p>
          <div>
            <label className="text-xs font-semibold tracking-wide uppercase text-muted-foreground" htmlFor="mergeCode">
              {tr(authCopy.mergeCodeLabel)}
            </label>
            <input
              id="mergeCode"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              className="mt-1 w-full rounded-xl border border-border bg-background px-4 py-3 text-center font-mono text-2xl tracking-[0.4em] text-foreground outline-none focus:border-primary"
            />
          </div>
          <button
            type="submit"
            disabled={busy || code.length !== 6}
            aria-busy={busy}
            className={`${buttonBase} bg-primary text-primary-foreground hover:opacity-90`}
          >
            {busy && <Spinner />}
            {tr(authCopy.mergeVerifyButton)}
          </button>
          <div className="flex items-center justify-between text-xs font-semibold">
            <button type="button" onClick={sendCode} disabled={busy} className="text-primary hover:underline disabled:opacity-50">
              {tr(authCopy.mergeResend)}
            </button>
            <button
              type="button"
              onClick={onUseAnother}
              disabled={busy}
              className="text-muted-foreground hover:underline disabled:opacity-50"
            >
              {tr(byEmail ? authCopy.mergeUseAnother : authCopy.mergeUseAnotherPhone)}
            </button>
          </div>
        </form>
      )}

      {step === 'linking' && (
        <p className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground" aria-live="polite">
          <Spinner className="h-5 w-5 text-[#06C755]" />
          {tr(authCopy.mergeLinking)}
        </p>
      )}

      {errorKey && <p className="text-sm text-destructive">{tr(authCopy[errorKey])}</p>}
    </div>
  )
}

// After a merge the browser is signed into the existing membership; attach
// LINE to it — inside LINE's browser this is an instant round trip — and
// land on the account page.
export async function linkLineAfterMerge(canLinkLine: boolean) {
  if (!canLinkLine) {
    window.location.href = '/account'
    return
  }
  const next = encodeURIComponent('/account?linked=line')
  const { error } = await (await getBrowserClient()).auth.linkIdentity({
    provider: 'custom:line',
    options: {
      redirectTo: `${window.location.origin}/auth/callback?link=line&next=${next}`,
      scopes: 'openid profile',
    },
  })
  if (error) {
    // Still signed into the right membership; LINE can be linked later from
    // the account page, which will say so.
    console.error('linkIdentity after merge failed', error.message)
    window.location.href = '/account?link_error=link_failed'
  }
}

'use client'

import { useActionState, useState } from 'react'
import { useLanguage } from '@/components/language-provider'
import { authCopy } from '@/lib/auth/copy'
import { finishEmailVerification, type VerifyEmailState } from '@/app/complete-profile/actions'
import { requestEmailCode } from '@/app/account/login-actions'
import { Spinner } from '@/components/ui/spinner'
import { codeErrorText } from '@/lib/auth/code-errors'

const initial: VerifyEmailState = null

// Step 2 of a LINE sign-up on /complete-profile: the 6-digit code emailed
// to the address they typed. Everything else is already saved.
export function VerifyEmailPanel({
  email,
  maskedEmail,
  next,
  onChangeEmail,
}: {
  email: string
  maskedEmail: string
  next: string
  onChangeEmail: () => void
}) {
  const { tr } = useLanguage()
  const [state, action, pending] = useActionState(finishEmailVerification, initial)
  const [code, setCode] = useState('')
  const [resend, setResend] = useState<{ busy: boolean; message: string | null; ok: boolean }>({
    busy: false,
    message: null,
    ok: true,
  })

  const handleResend = async () => {
    setResend({ busy: true, message: null, ok: true })
    const res = await requestEmailCode(email)
    setResend({
      busy: false,
      ok: res.ok,
      message: res.ok ? tr(authCopy.emailCodeResent) : codeErrorText(res.error, tr),
    })
  }

  return (
    <form action={action} className="mt-6 space-y-4">
      <input type="hidden" name="next" value={next} />
      <div className="rounded-xl bg-secondary px-4 py-3 text-sm leading-relaxed text-secondary-foreground">
        {tr(authCopy.emailCodeSentTo)} <span className="font-semibold">{maskedEmail}</span>
        <span className="mt-1 block text-xs text-muted-foreground">{tr(authCopy.emailCodeCheckSpam)}</span>
      </div>

      <div>
        <label className="text-xs font-semibold tracking-wide uppercase text-muted-foreground" htmlFor="code">
          {tr(authCopy.emailCodeLabel)}
        </label>
        <input
          id="code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          required
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          className="mt-1 w-full rounded-xl border border-border bg-background px-4 py-3 text-center font-mono text-2xl tracking-[0.5em] text-foreground outline-none focus:border-primary"
        />
      </div>

      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}

      <button
        type="submit"
        disabled={pending || code.length !== 6}
        className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending && <Spinner />}
        {tr(authCopy.emailCodeConfirm)}
      </button>

      <div className="flex items-center justify-between text-sm">
        <button type="button" onClick={onChangeEmail} className="text-muted-foreground hover:text-foreground">
          {tr(authCopy.emailCodeChangeEmail)}
        </button>
        <button
          type="button"
          onClick={handleResend}
          disabled={resend.busy}
          className="inline-flex items-center gap-1.5 font-semibold text-primary disabled:opacity-50"
        >
          {resend.busy && <Spinner className="h-3.5 w-3.5" />}
          {tr(authCopy.emailCodeResend)}
        </button>
      </div>
      {resend.message && (
        <p className={`text-xs ${resend.ok ? 'text-muted-foreground' : 'text-destructive'}`}>{resend.message}</p>
      )}
    </form>
  )
}

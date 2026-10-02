'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLanguage } from '@/components/language-provider'
import { authCopy } from '@/lib/auth/copy'
import { confirmEmailCode, requestEmailCode, setLoginPassword } from '@/app/account/login-actions'
import { Spinner } from '@/components/ui/spinner'
import { codeErrorText } from '@/lib/auth/code-errors'
import { CodeInput } from '@/components/ui/code-input'


const inputClass =
  'mt-1 w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none focus:border-primary'
const labelClass = 'text-xs font-semibold tracking-wide uppercase text-muted-foreground'
const primaryBtn =
  'inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50'
const ghostBtn =
  'inline-flex h-11 items-center justify-center rounded-full border border-border px-5 text-sm font-semibold text-foreground hover:border-primary/40'

type Step = 'email' | 'code' | 'password' | 'done'

// "Email & password" set-up on /account/settings. A LINE member first
// proves an email is theirs (6-digit code), which makes it the account's
// login email; anyone with a login email can then add a password.
export function EmailLoginSetup({
  authEmail,
  suggestedEmail,
  onClose,
}: {
  authEmail: string | null
  suggestedEmail: string
  onClose: () => void
}) {
  const { tr } = useLanguage()
  const router = useRouter()
  const [step, setStep] = useState<Step>(authEmail ? 'password' : 'email')
  // The address they'll sign in with: the account's, or the one just verified.
  const [loginEmail, setLoginEmail] = useState(authEmail ?? '')
  const [email, setEmail] = useState(suggestedEmail)
  const [masked, setMasked] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const run = async (task: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await task()
    } finally {
      setBusy(false)
    }
  }

  const sendCode = () =>
    run(async () => {
      const res = await requestEmailCode(email)
      if (!res.ok) return setError(res.error)
      setMasked(res.data.maskedEmail)
      setCode('')
      setStep('code')
    })

  const verify = () =>
    run(async () => {
      const res = await confirmEmailCode(code)
      if (!res.ok) return setError(res.error)
      setLoginEmail(res.data.email)
      setNotice(tr(authCopy.emailVerifiedDone))
      setStep('password')
      router.refresh()
    })

  const savePassword = () =>
    run(async () => {
      const res = await setLoginPassword(password, confirm)
      if (!res.ok) return setError(res.error)
      setStep('done')
      router.refresh()
    })

  return (
    <div className="mb-3 rounded-2xl border border-border bg-secondary/60 p-4">
      {step === 'email' && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            sendCode()
          }}
          className="space-y-3"
        >
          <p className="text-sm leading-relaxed text-secondary-foreground">{tr(authCopy.emailSetupIntro)}</p>
          <label className="block">
            <span className={labelClass}>{tr(authCopy.emailLabel)}</span>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className={inputClass}
            />
          </label>
          <div className="flex gap-2">
            <button type="submit" disabled={busy || !email.trim()} className={primaryBtn}>
              {busy && <Spinner className="h-4 w-4" />}
              {tr(authCopy.sendCodeButton)}
            </button>
            <button type="button" onClick={onClose} className={ghostBtn}>
              {tr(authCopy.cancelButton)}
            </button>
          </div>
        </form>
      )}

      {step === 'code' && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            verify()
          }}
          className="space-y-3"
        >
          <p className="text-sm leading-relaxed text-secondary-foreground">
            {tr(authCopy.emailCodeSentTo)} <span className="font-semibold">{masked}</span>
            <span className="mt-1 block text-xs text-muted-foreground">{tr(authCopy.emailCodeCheckSpam)}</span>
          </p>
          <label className="block">
            <span className={labelClass}>{tr(authCopy.emailCodeLabel)}</span>
            <CodeInput value={code} onChange={setCode} autoFocus className="mt-1" />
          </label>
          <div className="flex gap-2">
            <button type="submit" disabled={busy || code.length !== 6} className={primaryBtn}>
              {busy && <Spinner className="h-4 w-4" />}
              {tr(authCopy.emailCodeConfirm)}
            </button>
          </div>
          <div className="flex justify-between text-sm">
            <button type="button" onClick={() => setStep('email')} className="text-muted-foreground hover:text-foreground">
              {tr(authCopy.emailCodeChangeEmail)}
            </button>
            <button type="button" onClick={sendCode} disabled={busy} className="font-semibold text-primary disabled:opacity-50">
              {tr(authCopy.emailCodeResend)}
            </button>
          </div>
        </form>
      )}

      {step === 'password' && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            savePassword()
          }}
          className="space-y-3"
        >
          {notice && <p className="text-sm font-semibold text-accent">{notice}</p>}
          <p className="text-sm leading-relaxed text-secondary-foreground">
            {tr(authCopy.passwordSetupIntroBefore)} <span className="font-semibold break-all">{loginEmail}</span>{' '}
            {tr(authCopy.passwordSetupIntroAfter)}
          </p>
          <label className="block">
            <span className={labelClass}>{tr(authCopy.passwordLabel)}</span>
            <input
              type="password"
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
            />
            <span className="mt-1 block text-xs text-muted-foreground">{tr(authCopy.passwordHint)}</span>
          </label>
          <label className="block">
            <span className={labelClass}>{tr(authCopy.confirmPasswordLabel)}</span>
            <input
              type="password"
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className={inputClass}
            />
          </label>
          <div className="flex gap-2">
            <button type="submit" disabled={busy || !password || !confirm} className={primaryBtn}>
              {busy && <Spinner className="h-4 w-4" />}
              {tr(authCopy.setPasswordButton)}
            </button>
            <button type="button" onClick={onClose} className={ghostBtn}>
              {tr(authCopy.skipForNow)}
            </button>
          </div>
        </form>
      )}

      {step === 'done' && (
        <div className="space-y-3">
          <p className="text-sm font-semibold text-accent">{tr(authCopy.emailLoginReady)}</p>
          <button type="button" onClick={onClose} className={ghostBtn}>
            OK
          </button>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-destructive">{codeErrorText(error, tr)}</p>}
    </div>
  )
}

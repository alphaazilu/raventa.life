'use client'

import { useActionState, useState } from 'react'
import { useLanguage } from '@/components/language-provider'
import { authCopy } from '@/lib/auth/copy'
import { fieldClass } from '@/lib/form-field-class'
import { updatePassword, type ResetPasswordState } from '@/app/reset-password/actions'

const initialState: ResetPasswordState = null
const PASSWORD_PATTERN = '(?=.*[A-Za-z])(?=.*\\d).{8,}'

export function ResetPasswordForm() {
  const { tr } = useLanguage()
  const [state, formAction, pending] = useActionState(updatePassword, initialState)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const mismatch = confirmPassword.length > 0 && password !== confirmPassword

  return (
    <div className="mx-auto flex w-full max-w-md flex-col justify-center px-4 py-16 md:py-24">
      <div className="rounded-2xl border border-border bg-card p-8 shadow-sm">
        <h1 className="font-display text-2xl font-extrabold text-foreground">
          {tr(authCopy.resetPasswordHeading)}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{tr(authCopy.resetPasswordSub)}</p>

        <form action={formAction} className="mt-6 space-y-4">
          <div>
            <label className="text-xs font-semibold tracking-wide uppercase text-muted-foreground" htmlFor="password">
              {tr(authCopy.newPasswordLabel)}
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              pattern={PASSWORD_PATTERN}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={fieldClass(
                'mt-1 w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none focus:border-primary',
                Boolean(state?.fieldErrors?.password),
              )}
            />
            <p className="mt-1.5 text-xs text-muted-foreground">{tr(authCopy.passwordHint)}</p>
          </div>

          <div>
            <label
              className="text-xs font-semibold tracking-wide uppercase text-muted-foreground"
              htmlFor="confirmPassword"
            >
              {tr(authCopy.confirmPasswordLabel)}
            </label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={fieldClass(
                'mt-1 w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none focus:border-primary',
                mismatch || Boolean(state?.fieldErrors?.confirmPassword),
              )}
            />
            {mismatch && <p className="mt-1.5 text-xs text-destructive">{tr(authCopy.passwordMismatch)}</p>}
          </div>

          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}

          <button
            type="submit"
            disabled={pending || mismatch}
            className="w-full rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {tr(authCopy.resetPasswordButton)}
          </button>
        </form>
      </div>
    </div>
  )
}

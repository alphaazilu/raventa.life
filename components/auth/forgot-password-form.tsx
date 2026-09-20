'use client'

import { useActionState } from 'react'
import { useLanguage } from '@/components/language-provider'
import { authCopy } from '@/lib/auth/copy'
import { requestPasswordReset, type ForgotPasswordState } from '@/app/forgot-password/actions'

const initialState: ForgotPasswordState = null

export function ForgotPasswordForm() {
  const { tr } = useLanguage()
  const [state, formAction, pending] = useActionState(requestPasswordReset, initialState)

  return (
    <div className="mx-auto flex w-full max-w-md flex-col justify-center px-4 py-16 md:py-24">
      <div className="rounded-2xl border border-border bg-card p-8 shadow-sm">
        <h1 className="font-display text-2xl font-extrabold text-foreground">
          {tr(authCopy.forgotPasswordHeading)}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{tr(authCopy.forgotPasswordSub)}</p>

        {state?.sent ? (
          <p className="mt-6 rounded-xl bg-accent/10 p-4 text-sm leading-relaxed text-accent">
            {tr(authCopy.forgotPasswordSuccess)}
          </p>
        ) : (
          <form action={formAction} className="mt-6 space-y-4">
            <div>
              <label className="text-xs font-semibold tracking-wide uppercase text-muted-foreground" htmlFor="email">
                {tr(authCopy.emailLabel)}
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="mt-1 w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none focus:border-primary"
              />
            </div>

            {state?.error && <p className="text-sm text-destructive">{state.error}</p>}

            <button
              type="submit"
              disabled={pending}
              className="w-full rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {tr(authCopy.forgotPasswordButton)}
            </button>
          </form>
        )}

        <a
          href="/login"
          className="mt-6 inline-block text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          {tr(authCopy.backToLogin)}
        </a>
      </div>
    </div>
  )
}

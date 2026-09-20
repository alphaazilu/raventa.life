'use client'

import { useActionState, useState } from 'react'
import { useLanguage } from '@/components/language-provider'
import { authCopy } from '@/lib/auth/copy'
import { OAuthButtons } from '@/components/auth/oauth-buttons'
import { signIn, signUp, type AuthActionState } from './actions'

type Mode = 'login' | 'signup'

const initialState: AuthActionState = null

export function LoginForm({ next }: { next: string }) {
  const { tr } = useLanguage()
  const [mode, setMode] = useState<Mode>('login')

  const [loginState, loginAction, loginPending] = useActionState(signIn, initialState)
  const [signupState, signupAction, signupPending] = useActionState(signUp, initialState)

  const state = mode === 'login' ? loginState : signupState
  const pending = mode === 'login' ? loginPending : signupPending

  return (
    <div className="mx-auto flex w-full max-w-md flex-col justify-center px-4 py-16 md:py-24">
      <div className="rounded-2xl border border-border bg-card p-8 shadow-sm">
        <div className="mb-6 flex rounded-full bg-secondary p-1 text-sm font-semibold">
          <button
            type="button"
            onClick={() => setMode('login')}
            className={`flex-1 rounded-full py-2 transition-colors ${
              mode === 'login' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
            }`}
          >
            {tr(authCopy.loginHeading)}
          </button>
          <button
            type="button"
            onClick={() => setMode('signup')}
            className={`flex-1 rounded-full py-2 transition-colors ${
              mode === 'signup' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
            }`}
          >
            {tr(authCopy.signupHeading)}
          </button>
        </div>

        {state?.success === 'checkEmail' ? (
          <p className="rounded-xl bg-accent/10 p-4 text-sm leading-relaxed text-accent">
            {tr(authCopy.signupSuccess)}
          </p>
        ) : (
          <form action={mode === 'login' ? loginAction : signupAction} className="space-y-4">
            <input type="hidden" name="next" value={next} />
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
            <div>
              <label className="text-xs font-semibold tracking-wide uppercase text-muted-foreground" htmlFor="password">
                {tr(authCopy.passwordLabel)}
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                required
                minLength={6}
                className="mt-1 w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none focus:border-primary"
              />
            </div>

            {state?.error && <p className="text-sm text-destructive">{state.error}</p>}

            <button
              type="submit"
              disabled={pending}
              className="w-full rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {mode === 'login' ? tr(authCopy.loginButton) : tr(authCopy.signupButton)}
            </button>
          </form>
        )}

        <div className="mt-6 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          {tr(authCopy.orContinueWith)}
          <span className="h-px flex-1 bg-border" />
        </div>

        <OAuthButtons next={next} />
      </div>
    </div>
  )
}

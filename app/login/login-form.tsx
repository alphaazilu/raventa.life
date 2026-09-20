'use client'

import { useActionState, useState } from 'react'
import { useLanguage } from '@/components/language-provider'
import { authCopy } from '@/lib/auth/copy'
import { THAILAND_PROVINCES } from '@/lib/thailand-provinces'
import { OAuthButtons } from '@/components/auth/oauth-buttons'
import { signIn, signUp, type AuthActionState } from './actions'

type Mode = 'login' | 'signup'

const initialState: AuthActionState = null

// Signup passwords need at least 8 characters with a letter and a number.
// Login keeps a looser check — an existing account's real password must
// never be rejected client-side just because it predates this rule.
const SIGNUP_PASSWORD_PATTERN = '(?=.*[A-Za-z])(?=.*\\d).{8,}'

export function LoginForm({ next }: { next: string }) {
  const { tr } = useLanguage()
  const [mode, setMode] = useState<Mode>('login')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [password, setPassword] = useState('')

  const [loginState, loginAction, loginPending] = useActionState(signIn, initialState)
  const [signupState, signupAction, signupPending] = useActionState(signUp, initialState)

  const state = mode === 'login' ? loginState : signupState
  const pending = mode === 'login' ? loginPending : signupPending
  const passwordsMismatch = mode === 'signup' && confirmPassword.length > 0 && password !== confirmPassword

  return (
    <div className="mx-auto flex w-full max-w-md flex-col justify-center px-4 py-16 md:py-24">
      <div className="rounded-2xl border border-border bg-card p-8 shadow-sm">
        <div className="mb-6 flex rounded-full bg-secondary p-1 text-sm font-semibold">
          <button
            type="button"
            onClick={() => {
              setMode('login')
              setPassword('')
              setConfirmPassword('')
            }}
            className={`flex-1 rounded-full py-2 transition-colors ${
              mode === 'login' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
            }`}
          >
            {tr(authCopy.loginHeading)}
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('signup')
              setPassword('')
              setConfirmPassword('')
            }}
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

            {mode === 'signup' && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label
                      className="text-xs font-semibold tracking-wide uppercase text-muted-foreground"
                      htmlFor="firstName"
                    >
                      {tr(authCopy.firstNameLabel)}
                    </label>
                    <input
                      id="firstName"
                      name="firstName"
                      type="text"
                      autoComplete="given-name"
                      required
                      className="mt-1 w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none focus:border-primary"
                    />
                  </div>
                  <div>
                    <label
                      className="text-xs font-semibold tracking-wide uppercase text-muted-foreground"
                      htmlFor="lastName"
                    >
                      {tr(authCopy.lastNameLabel)}
                    </label>
                    <input
                      id="lastName"
                      name="lastName"
                      type="text"
                      autoComplete="family-name"
                      required
                      className="mt-1 w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none focus:border-primary"
                    />
                  </div>
                </div>

                <div>
                  <label
                    className="text-xs font-semibold tracking-wide uppercase text-muted-foreground"
                    htmlFor="phone"
                  >
                    {tr(authCopy.phoneLabel)}
                  </label>
                  <input
                    id="phone"
                    name="phone"
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel"
                    placeholder="0812345678"
                    pattern="[0-9]{9,10}"
                    title="กรอกเบอร์โทรศัพท์ 9-10 หลัก ไม่ต้องมีขีดหรือเว้นวรรค"
                    required
                    className="mt-1 w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none focus:border-primary"
                  />
                </div>

                <div>
                  <label
                    className="text-xs font-semibold tracking-wide uppercase text-muted-foreground"
                    htmlFor="province"
                  >
                    {tr(authCopy.provinceLabel)}
                  </label>
                  <select
                    id="province"
                    name="province"
                    required
                    defaultValue=""
                    className="mt-1 w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none focus:border-primary"
                  >
                    <option value="" disabled>
                      {tr(authCopy.provincePlaceholder)}
                    </option>
                    {THAILAND_PROVINCES.map((province) => (
                      <option key={province} value={province}>
                        {province}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}

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
                minLength={mode === 'signup' ? 8 : 1}
                pattern={mode === 'signup' ? SIGNUP_PASSWORD_PATTERN : undefined}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none focus:border-primary"
              />
              {mode === 'signup' && (
                <p className="mt-1.5 text-xs text-muted-foreground">{tr(authCopy.passwordHint)}</p>
              )}
              {mode === 'login' && (
                <a
                  href="/forgot-password"
                  className="mt-1.5 inline-block text-xs font-medium text-muted-foreground transition-colors hover:text-primary"
                >
                  {tr(authCopy.forgotPasswordLink)}
                </a>
              )}
            </div>

            {mode === 'signup' && (
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
                  className="mt-1 w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none focus:border-primary"
                />
                {passwordsMismatch && (
                  <p className="mt-1.5 text-xs text-destructive">{tr(authCopy.passwordMismatch)}</p>
                )}
              </div>
            )}

            {state?.error && <p className="text-sm text-destructive">{state.error}</p>}

            <button
              type="submit"
              disabled={pending || passwordsMismatch}
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

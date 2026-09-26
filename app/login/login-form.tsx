'use client'

import { useActionState, useState } from 'react'
import { useLanguage } from '@/components/language-provider'
import { authCopy } from '@/lib/auth/copy'
import { THAILAND_PROVINCES } from '@/lib/thailand-provinces'
import { OAuthButtons } from '@/components/auth/oauth-buttons'
import { fieldClass } from '@/lib/form-field-class'
import { signIn, signUp, type AuthActionState } from './actions'

type Mode = 'login' | 'signup'

const initialState: AuthActionState = null

// Signup passwords need at least 8 characters with a letter and a number.
// Login keeps a looser check — an existing account's real password must
// never be rejected client-side just because it predates this rule.
const SIGNUP_PASSWORD_PATTERN = '(?=.*[A-Za-z])(?=.*\\d).{8,}'

const inputBaseClass =
  'mt-1 w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none focus:border-primary'

export function LoginForm({ next }: { next: string }) {
  const { tr } = useLanguage()
  const [mode, setMode] = useState<Mode>('login')

  // Every field is a controlled input. Without this, React resets
  // uncontrolled <form> fields after a Server Action finishes — including
  // on a *failed* submission — which was silently wiping out everything
  // the person had typed the moment validation caught a problem.
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [province, setProvince] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [acceptPrivacy, setAcceptPrivacy] = useState(false)

  const [loginState, loginAction, loginPending] = useActionState(signIn, initialState)
  const [signupState, signupAction, signupPending] = useActionState(signUp, initialState)

  const state = mode === 'login' ? loginState : signupState
  const pending = mode === 'login' ? loginPending : signupPending
  const passwordsMismatch = mode === 'signup' && confirmPassword.length > 0 && password !== confirmPassword
  const invalid = (field: string) => Boolean(state?.fieldErrors?.[field])

  function resetFields() {
    setFirstName('')
    setLastName('')
    setPhone('')
    setProvince('')
    setEmail('')
    setPassword('')
    setConfirmPassword('')
    setAcceptPrivacy(false)
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col justify-center px-4 py-16 md:py-24">
      <div className="rounded-2xl border border-border bg-card p-8 shadow-sm">
        <div className="mb-6 flex rounded-full bg-secondary p-1 text-sm font-semibold">
          <button
            type="button"
            onClick={() => {
              setMode('login')
              resetFields()
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
              resetFields()
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
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      className={fieldClass(inputBaseClass, invalid('firstName'))}
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
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      className={fieldClass(inputBaseClass, invalid('lastName'))}
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
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className={fieldClass(inputBaseClass, invalid('phone'))}
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
                    value={province}
                    onChange={(e) => setProvince(e.target.value)}
                    className={fieldClass(inputBaseClass, invalid('province'))}
                  >
                    <option value="" disabled>
                      {tr(authCopy.provincePlaceholder)}
                    </option>
                    {THAILAND_PROVINCES.map((p) => (
                      <option key={p} value={p}>
                        {p}
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
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={fieldClass(inputBaseClass, invalid('email'))}
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
                className={fieldClass(inputBaseClass, invalid('password'))}
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
                  className={fieldClass(inputBaseClass, passwordsMismatch || invalid('confirmPassword'))}
                />
                {passwordsMismatch && (
                  <p className="mt-1.5 text-xs text-destructive">{tr(authCopy.passwordMismatch)}</p>
                )}
              </div>
            )}

            {mode === 'signup' && (
              <div>
                <label className="flex items-start gap-2.5 text-xs leading-relaxed text-muted-foreground">
                  <input
                    type="checkbox"
                    name="acceptPrivacy"
                    required
                    checked={acceptPrivacy}
                    onChange={(e) => setAcceptPrivacy(e.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-border text-primary focus:ring-2 focus:ring-primary"
                  />
                  <span>
                    {tr(authCopy.acceptPrivacyBefore)}{' '}
                    <a
                      href="/privacy"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-primary underline-offset-2 hover:underline"
                    >
                      {tr(authCopy.acceptPrivacyPolicyLink)}
                    </a>{' '}
                    {tr(authCopy.acceptPrivacyAnd)}{' '}
                    <a
                      href="/terms"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-primary underline-offset-2 hover:underline"
                    >
                      {tr(authCopy.acceptPrivacyTermsLink)}
                    </a>
                  </span>
                </label>
                {invalid('acceptPrivacy') && (
                  <p className="mt-1.5 text-xs text-destructive">{tr(authCopy.acceptPrivacyRequired)}</p>
                )}
              </div>
            )}

            {state?.error && <p className="text-sm text-destructive">{state.error}</p>}

            <button
              type="submit"
              disabled={pending || passwordsMismatch || (mode === 'signup' && !acceptPrivacy)}
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
        <p className="mt-3 text-center text-[11px] leading-relaxed text-muted-foreground/80">
          {tr(authCopy.oauthConsentNote)}
        </p>
      </div>
    </div>
  )
}

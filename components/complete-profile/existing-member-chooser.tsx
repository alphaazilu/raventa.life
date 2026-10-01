'use client'

import { useState } from 'react'
import { useLanguage } from '@/components/language-provider'
import { authCopy } from '@/lib/auth/copy'
import { Spinner } from '@/components/ui/spinner'
import { LineIcon } from '@/components/auth/oauth-buttons'
import { MergePanel, linkLineAfterMerge } from '@/components/complete-profile/merge-panel'
import { findMergeTarget, mergeWithPassword, type MergeTarget } from '@/app/complete-profile/merge-actions'
import { cn } from '@/lib/utils'

type Step = 'ask' | 'find' | 'linking'
type Method = 'code' | 'password'

const inputClass =
  'mt-1 w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none focus:border-primary'
const buttonBase =
  'inline-flex w-full items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-semibold transition-opacity disabled:cursor-not-allowed disabled:opacity-50'

// First thing a LINE sign-in without a membership sees on /complete-profile:
// are you already a member? Yes → find that membership (by email,
// proven with an emailed code, or by its email + password) and link LINE
// onto it. No → the normal sign-up form.
export function ExistingMemberChooser({ onNew }: { onNew: () => void }) {
  const { tr } = useLanguage()
  const [step, setStep] = useState<Step>('ask')
  const [method, setMethod] = useState<Method>('code')
  const [lookup, setLookup] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [target, setTarget] = useState<MergeTarget | null>(null)
  const [busy, setBusy] = useState(false)
  const [errorKey, setErrorKey] = useState<keyof typeof authCopy | null>(null)

  const find = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setErrorKey(null)
    const res = await findMergeTarget(lookup)
    setBusy(false)
    if (res.ok) return setTarget(res.target)
    setErrorKey(
      res.reason === 'not_found' ? 'existingNotFound' : res.reason === 'target_has_line' ? 'mergeTargetHasLine' : 'mergeFailed',
    )
  }

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setErrorKey(null)
    const res = await mergeWithPassword(email, password)
    if (!res.ok) {
      setBusy(false)
      setErrorKey(
        res.reason === 'wrong_password' || res.reason === 'not_found'
          ? 'existingWrongPassword'
          : res.reason === 'target_has_line'
            ? 'mergeTargetHasLine'
            : res.reason === 'too_many_attempts'
              ? 'mergeTargetLimit'
              : 'mergeFailed',
      )
      return
    }
    setStep('linking')
    await linkLineAfterMerge(res.canLinkLine)
  }

  if (step === 'ask') {
    return (
      <div className="mt-6 space-y-3">
        <div className="rounded-xl bg-secondary p-4">
          <p className="flex items-center gap-2 font-semibold text-foreground">
            <LineIcon className="h-5 w-5 shrink-0 text-[#06C755]" />
            {tr(authCopy.existingAskHeading)}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{tr(authCopy.existingAskBody)}</p>
        </div>
        <button type="button" onClick={() => setStep('find')} className={cn(buttonBase, 'bg-primary text-primary-foreground hover:opacity-90')}>
          {tr(authCopy.existingYes)}
        </button>
        <button
          type="button"
          onClick={onNew}
          className={cn(buttonBase, 'border border-border bg-background text-foreground hover:border-primary/40')}
        >
          {tr(authCopy.existingNo)}
        </button>
      </div>
    )
  }

  if (step === 'linking') {
    return (
      <p className="mt-6 flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground" aria-live="polite">
        <Spinner className="h-5 w-5 text-[#06C755]" />
        {tr(authCopy.mergeLinking)}
      </p>
    )
  }

  // step === 'find'
  if (target) {
    return (
      <MergePanel
        target={target}
        onUseAnother={() => {
          setTarget(null)
          setErrorKey(null)
        }}
      />
    )
  }

  return (
    <div className="mt-6 space-y-4">
      <div className="flex items-center justify-between">
        <p className="font-semibold text-foreground">{tr(authCopy.existingFindHeading)}</p>
        <button
          type="button"
          onClick={() => {
            setStep('ask')
            setErrorKey(null)
          }}
          className="text-xs font-semibold text-muted-foreground hover:text-foreground"
        >
          {tr(authCopy.existingBack)}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-1 rounded-full border border-border p-1" role="tablist">
        {(['code', 'password'] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={method === m}
            onClick={() => {
              setMethod(m)
              setErrorKey(null)
            }}
            className={cn(
              'rounded-full py-2 text-xs font-semibold transition-colors',
              method === m ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {tr(m === 'code' ? authCopy.existingByCode : authCopy.existingByPassword)}
          </button>
        ))}
      </div>

      {method === 'code' ? (
        <form onSubmit={find} className="space-y-3">
          <label className="block">
            <span className="text-xs font-semibold tracking-wide uppercase text-muted-foreground">{tr(authCopy.existingFindLabel)}</span>
            <input
              value={lookup}
              onChange={(e) => setLookup(e.target.value)}
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              autoFocus
              placeholder="you@example.com"
              className={inputClass}
            />
          </label>
          <p className="text-xs leading-relaxed text-muted-foreground">{tr(authCopy.existingGoogleHint)}</p>
          <button
            type="submit"
            disabled={busy || !lookup.trim()}
            className={cn(buttonBase, 'bg-primary text-primary-foreground hover:opacity-90')}
          >
            {busy && <Spinner />}
            {tr(authCopy.existingFindButton)}
          </button>
        </form>
      ) : (
        <form onSubmit={signIn} className="space-y-3">
          <label className="block">
            <span className="text-xs font-semibold tracking-wide uppercase text-muted-foreground">{tr(authCopy.emailLabel)}</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
              autoFocus
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold tracking-wide uppercase text-muted-foreground">
              {tr(authCopy.existingPasswordLabel)}
            </span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              className={inputClass}
            />
          </label>
          <button
            type="submit"
            disabled={busy || !email.trim() || !password}
            className={cn(buttonBase, 'bg-primary text-primary-foreground hover:opacity-90')}
          >
            {busy && <Spinner />}
            {tr(authCopy.existingPasswordButton)}
          </button>
          <p className="text-xs text-muted-foreground">{tr(authCopy.existingForgot)}</p>
        </form>
      )}

      {errorKey && (
        <div className="space-y-2">
          <p role="alert" className="text-sm text-destructive">
            {tr(authCopy[errorKey])}
          </p>
          {errorKey === 'existingNotFound' && (
            <button type="button" onClick={onNew} className="text-sm font-semibold text-primary hover:underline">
              {tr(authCopy.existingNo)}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

'use client'

import { useActionState, useState } from 'react'
import { useLanguage } from '@/components/language-provider'
import { authCopy } from '@/lib/auth/copy'
import { THAILAND_PROVINCES } from '@/lib/thailand-provinces'
import { COUNTRIES } from '@/lib/countries'
import { fieldClass } from '@/lib/form-field-class'
import { completeProfile, type CompleteProfileState } from '@/app/complete-profile/actions'

const initialState: CompleteProfileState = null

const inputBaseClass =
  'mt-1 w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none focus:border-primary'

export function CompleteProfileForm({
  next,
  defaultFirstName,
  defaultLastName,
  defaultPhone,
  defaultProvince,
  defaultNationality,
}: {
  next: string
  defaultFirstName: string
  defaultLastName: string
  defaultPhone: string
  defaultProvince: string
  defaultNationality: string
}) {
  const { tr } = useLanguage()
  const [state, formAction, pending] = useActionState(completeProfile, initialState)

  // Controlled so a failed submission (Server Actions reset uncontrolled
  // <form> fields once the action call resolves, success or not) never
  // wipes out what the person already typed. Defaults are seeded from
  // whatever the profile already has — this screen isn't only reached by
  // brand-new Google signups any more; an existing member who's only
  // missing nationality shouldn't have to retype a phone/province they
  // already gave.
  const [firstName, setFirstName] = useState(defaultFirstName)
  const [lastName, setLastName] = useState(defaultLastName)
  const [phone, setPhone] = useState(defaultPhone)
  const [province, setProvince] = useState(defaultProvince)
  const [nationality, setNationality] = useState(defaultNationality)
  const [acceptPrivacy, setAcceptPrivacy] = useState(false)
  const invalid = (field: string) => Boolean(state?.fieldErrors?.[field])

  return (
    <div className="mx-auto flex w-full max-w-md flex-col justify-center px-4 py-16 md:py-24">
      <div className="rounded-2xl border border-border bg-card p-8 shadow-sm">
        <h1 className="font-display text-2xl font-extrabold text-foreground">
          {tr(authCopy.completeProfileHeading)}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{tr(authCopy.completeProfileSub)}</p>

        <form action={formAction} className="mt-6 space-y-4">
          <input type="hidden" name="next" value={next} />

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
            <label className="text-xs font-semibold tracking-wide uppercase text-muted-foreground" htmlFor="phone">
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
            <label className="text-xs font-semibold tracking-wide uppercase text-muted-foreground" htmlFor="province">
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

          <div>
            <label
              className="text-xs font-semibold tracking-wide uppercase text-muted-foreground"
              htmlFor="nationality"
            >
              {tr(authCopy.nationalityLabel)}
            </label>
            <select
              id="nationality"
              name="nationality"
              required
              value={nationality}
              onChange={(e) => setNationality(e.target.value)}
              className={fieldClass(inputBaseClass, invalid('nationality'))}
            >
              <option value="" disabled>
                {tr(authCopy.nationalityPlaceholder)}
              </option>
              {COUNTRIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

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

          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}

          <button
            type="submit"
            disabled={pending || !acceptPrivacy}
            className="w-full rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {tr(authCopy.saveButton)}
          </button>
        </form>
      </div>
    </div>
  )
}

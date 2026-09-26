'use client'

import { useActionState, useEffect, useState } from 'react'
import { useLanguage } from '@/components/language-provider'
import { authCopy } from '@/lib/auth/copy'
import { fieldClass } from '@/lib/form-field-class'
import { updateOwnPhone, type UpdatePhoneState } from '@/app/account/actions'

const initialPhoneState: UpdatePhoneState = null

export function AccountView({
  email,
  firstName,
  lastName,
  phone,
  province,
  role,
  memberNo,
  signOutAction,
}: {
  email: string
  firstName: string | null
  lastName: string | null
  phone: string | null
  province: string | null
  role: string
  memberNo: string | null
  signOutAction: () => Promise<void>
}) {
  const { tr } = useLanguage()
  const fullName = [firstName, lastName].filter(Boolean).join(' ')

  // Members can edit only their phone number themselves — name and
  // province are admin-managed (see /admin), and the membership number
  // is never editable through the app at all.
  const [editingPhone, setEditingPhone] = useState(false)
  const [phoneValue, setPhoneValue] = useState(phone ?? '')
  const [phoneState, phoneAction, phonePending] = useActionState(updateOwnPhone, initialPhoneState)

  // Close the little editor once a save actually lands, so the person
  // sees their new number reflected back rather than the form just sitting
  // there open.
  useEffect(() => {
    if (phoneState?.success) setEditingPhone(false)
  }, [phoneState])

  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="font-display text-3xl font-extrabold text-foreground md:text-4xl">
        {tr(authCopy.accountHeading)}
      </h1>

      <div className="mt-8 rounded-2xl border border-border bg-card p-6">
        {memberNo && (
          <>
            <p className="mt-4 text-xs font-semibold tracking-wide uppercase text-muted-foreground first:mt-0">
              {tr(authCopy.memberNoFieldLabel)}
            </p>
            <p className="mt-1 font-mono text-lg tracking-wider text-primary">{memberNo}</p>
          </>
        )}

        {fullName && (
          <>
            <p className="mt-4 text-xs font-semibold tracking-wide uppercase text-muted-foreground first:mt-0">
              {tr(authCopy.nameFieldLabel)}
            </p>
            <p className="mt-1 text-card-foreground">{fullName}</p>
          </>
        )}

        <p className="mt-4 text-xs font-semibold tracking-wide uppercase text-muted-foreground first:mt-0">
          {tr(authCopy.emailFieldLabel)}
        </p>
        <p className="mt-1 text-card-foreground">{email}</p>

        {phone && (
          <>
            <p className="mt-4 text-xs font-semibold tracking-wide uppercase text-muted-foreground first:mt-0">
              {tr(authCopy.phoneFieldLabel)}
            </p>
            {editingPhone ? (
              <form action={phoneAction} className="mt-1 flex flex-wrap items-center gap-2">
                <input
                  type="tel"
                  name="phone"
                  inputMode="numeric"
                  autoComplete="tel"
                  pattern="[0-9]{9,10}"
                  value={phoneValue}
                  onChange={(e) => setPhoneValue(e.target.value)}
                  className={fieldClass(
                    'w-full max-w-[200px] rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary',
                    Boolean(phoneState?.fieldErrors?.phone),
                  )}
                />
                <button
                  type="submit"
                  disabled={phonePending}
                  className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {tr(authCopy.saveButton)}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPhoneValue(phone)
                    setEditingPhone(false)
                  }}
                  className="text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
                >
                  {tr(authCopy.cancelButton)}
                </button>
                {phoneState?.fieldErrors?.phone && (
                  <p className="w-full text-xs text-destructive">{phoneState.fieldErrors.phone}</p>
                )}
              </form>
            ) : (
              <p className="mt-1 flex items-center gap-3 text-card-foreground">
                {phone}
                <button
                  type="button"
                  onClick={() => {
                    setPhoneValue(phone)
                    setEditingPhone(true)
                  }}
                  className="text-xs font-semibold text-primary underline-offset-2 hover:underline"
                >
                  {tr(authCopy.editButton)}
                </button>
              </p>
            )}
          </>
        )}

        {province && (
          <>
            <p className="mt-4 text-xs font-semibold tracking-wide uppercase text-muted-foreground first:mt-0">
              {tr(authCopy.provinceFieldLabel)}
            </p>
            <p className="mt-1 text-card-foreground">{province}</p>
          </>
        )}

        <p className="mt-4 text-xs font-semibold tracking-wide uppercase text-muted-foreground first:mt-0">
          {tr(authCopy.roleFieldLabel)}
        </p>
        <p className="mt-1 text-card-foreground">{role === 'admin' ? tr(authCopy.roleAdmin) : tr(authCopy.roleCustomer)}</p>

        {role === 'admin' && (
          <a
            href="/admin"
            className="mt-4 inline-block text-sm font-semibold text-primary underline-offset-2 hover:underline"
          >
            {tr(authCopy.goToAdmin)}
          </a>
        )}

        <a
          href="/reset-password"
          className="mt-4 inline-block text-sm font-semibold text-primary underline-offset-2 hover:underline"
        >
          {tr(authCopy.changePasswordLink)}
        </a>
      </div>

      <form action={signOutAction} className="mt-6">
        <button
          type="submit"
          className="rounded-full border border-border px-6 py-2.5 text-sm font-semibold text-foreground transition-colors hover:border-primary/40"
        >
          {tr(authCopy.signOutButton)}
        </button>
      </form>
    </div>
  )
}

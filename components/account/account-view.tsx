'use client'

import { useActionState, useEffect, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { authCopy } from '@/lib/auth/copy'
import { fieldClass } from '@/lib/form-field-class'
import { updateOwnPhone, type UpdatePhoneState } from '@/app/account/actions'
import { LinkLine, type LinkLineResult } from '@/components/account/link-line'
import { AvatarEditor } from '@/components/account/avatar'
import { MemberCard } from '@/components/account/member-card'
import { Spinner } from '@/components/ui/spinner'

const initialPhoneState: UpdatePhoneState = null

export function AccountView({
  email,
  firstName,
  lastName,
  phone,
  province,
  nationality,
  role,
  memberNo,
  signOutAction,
  lineLinked,
  lineLinkResult,
  hasPassword,
  userId,
  avatarUrl,
  hasUploadedAvatar,
  openCardOnLoad,
}: {
  email: string
  firstName: string | null
  lastName: string | null
  phone: string | null
  province: string | null
  nationality: string | null
  role: string
  memberNo: string | null
  signOutAction: () => Promise<void>
  lineLinked: boolean
  lineLinkResult: LinkLineResult
  hasPassword: boolean
  userId: string
  avatarUrl: string | null
  hasUploadedAvatar: boolean
  openCardOnLoad: boolean
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
    <div className="mx-auto max-w-lg px-4 py-16">
      <h1 className="font-display text-3xl font-extrabold text-foreground md:text-4xl">
        {tr(authCopy.accountHeading)}
      </h1>

      <div className="mt-8">
        <MemberCard
          name={fullName || email || '—'}
          memberNo={memberNo}
          avatarUrl={avatarUrl}
          autoOpen={openCardOnLoad}
        />
      </div>

      <section className="mt-8 rounded-2xl border border-border bg-card p-5">
        <h2 className="mb-4 text-base font-semibold text-card-foreground">{tr(authCopy.profilePhotoHeading)}</h2>
        <AvatarEditor
          userId={userId}
          src={avatarUrl}
          name={fullName || email || '?'}
          hasUploaded={hasUploadedAvatar}
        />
      </section>

      <section className="mt-4 rounded-2xl border border-border bg-card px-5 pt-5 pb-2">
        <h2 className="mb-1 text-base font-semibold text-card-foreground">{tr(authCopy.personalInfoHeading)}</h2>
        {fullName && <InfoRow label={tr(authCopy.nameFieldLabel)}>{fullName}</InfoRow>}
        {/* LINE accounts often have no email at all. */}
        <InfoRow label={tr(authCopy.emailFieldLabel)}>{email || '—'}</InfoRow>
        {phone && (
          <InfoRow label={tr(authCopy.phoneFieldLabel)}>
            {editingPhone ? (
              <form action={phoneAction} className="flex flex-wrap items-center justify-end gap-2">
                <input
                  type="tel"
                  name="phone"
                  inputMode="numeric"
                  autoComplete="tel"
                  pattern="[0-9]{9,10}"
                  value={phoneValue}
                  onChange={(e) => setPhoneValue(e.target.value)}
                  aria-label={tr(authCopy.phoneFieldLabel)}
                  className={fieldClass(
                    'w-full max-w-[160px] rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary',
                    Boolean(phoneState?.fieldErrors?.phone),
                  )}
                />
                <button
                  type="submit"
                  disabled={phonePending}
                  className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  aria-busy={phonePending}
                >
                  {phonePending && <Spinner className="h-3.5 w-3.5" />}
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
                  <p className="w-full text-right text-xs text-destructive">{phoneState.fieldErrors.phone}</p>
                )}
              </form>
            ) : (
              <span className="inline-flex items-center gap-3">
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
              </span>
            )}
          </InfoRow>
        )}
        {province && <InfoRow label={tr(authCopy.provinceFieldLabel)}>{province}</InfoRow>}
        {nationality && <InfoRow label={tr(authCopy.nationalityFieldLabel)}>{nationality}</InfoRow>}
        <InfoRow label={tr(authCopy.roleFieldLabel)} last>
          {role === 'admin' ? tr(authCopy.roleAdmin) : tr(authCopy.roleCustomer)}
        </InfoRow>
      </section>

      <section className="mt-4 rounded-2xl border border-border bg-card p-5">
        <LinkLine linked={lineLinked} result={lineLinkResult} />
      </section>

      {(hasPassword || role === 'admin') && (
        <nav className="mt-4 overflow-hidden rounded-2xl border border-border bg-card">
          {hasPassword && <LinkRow href="/reset-password">{tr(authCopy.changePasswordLink)}</LinkRow>}
          {role === 'admin' && <LinkRow href="/admin">{tr(authCopy.adminLinkLabel)}</LinkRow>}
        </nav>
      )}

      <form action={signOutAction} className="mt-8">
        <button
          type="submit"
          className="h-12 w-full rounded-2xl border border-border bg-transparent text-sm font-semibold text-foreground transition-colors hover:border-primary/40 hover:text-primary"
        >
          {tr(authCopy.signOutButton)}
        </button>
      </form>
    </div>
  )
}

// One "label ........ value" line of the personal-info box.
function InfoRow({ label, children, last }: { label: string; children: React.ReactNode; last?: boolean }) {
  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3 text-sm ${last ? '' : 'border-b border-border'}`}
    >
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium text-card-foreground">{children}</span>
    </div>
  )
}

// A tappable row that goes somewhere (change password, admin).
function LinkRow({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="flex min-h-[52px] items-center justify-between border-b border-border px-5 text-sm font-medium text-card-foreground transition-colors last:border-b-0 hover:bg-background"
    >
      <span>{children}</span>
      <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
    </a>
  )
}

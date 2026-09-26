'use client'

import { useActionState, useState } from 'react'
import { useLanguage } from '@/components/language-provider'
import { authCopy } from '@/lib/auth/copy'
import { THAILAND_PROVINCES } from '@/lib/thailand-provinces'
import { fieldClass } from '@/lib/form-field-class'
import { updateMemberProfile, type UpdateMemberState } from '@/app/admin/actions'

const initialState: UpdateMemberState = null

const inputBaseClass =
  'mt-1 w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none focus:border-primary'

type Member = {
  id: string
  member_no: string | null
  first_name: string | null
  last_name: string | null
  email: string | null
  phone: string | null
  province: string | null
}

export function MemberEditForm({ member }: { member: Member }) {
  const { tr } = useLanguage()
  const [state, formAction, pending] = useActionState(updateMemberProfile, initialState)

  // Controlled for the same reason as every other form here — a failed
  // submission must never wipe out what the admin already edited.
  const [firstName, setFirstName] = useState(member.first_name ?? '')
  const [lastName, setLastName] = useState(member.last_name ?? '')
  const [phone, setPhone] = useState(member.phone ?? '')
  const [province, setProvince] = useState(member.province ?? '')
  const invalid = (field: string) => Boolean(state?.fieldErrors?.[field])

  return (
    <div className="mx-auto flex w-full max-w-md flex-col justify-center px-4 py-16 md:py-24">
      <a
        href="/admin"
        className="mb-4 inline-block text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
      >
        {tr(authCopy.adminBackToMembers)}
      </a>

      <div className="rounded-2xl border border-border bg-card p-8 shadow-sm">
        <h1 className="font-display text-2xl font-extrabold text-foreground">{tr(authCopy.adminEditMemberHeading)}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{member.email}</p>

        <div className="mt-4 rounded-xl bg-secondary p-4">
          <p className="text-xs font-semibold tracking-wide uppercase text-muted-foreground">
            {tr(authCopy.memberNoFieldLabel)}
          </p>
          <p className="mt-1 font-mono text-lg tracking-wider text-primary">{member.member_no ?? '—'}</p>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            {tr(authCopy.adminMemberNoReadonlyNote)}
          </p>
        </div>

        <form action={formAction} className="mt-6 space-y-4">
          <input type="hidden" name="memberId" value={member.id} />

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

          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}

          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {tr(authCopy.saveButton)}
          </button>
        </form>
      </div>
    </div>
  )
}

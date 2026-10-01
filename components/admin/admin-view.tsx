'use client'

import { useMemo, useState } from 'react'
import { useLanguage } from '@/components/language-provider'
import { authCopy } from '@/lib/auth/copy'
import { AvatarCircle } from '@/components/account/avatar'
import { MEMBERS_PATH } from '@/lib/auth/roles'
import { consoleCopy } from '@/lib/console/copy'

export type AdminMember = {
  id: string
  member_no: string | null
  first_name: string | null
  last_name: string | null
  email: string | null
  phone: string | null
  province: string | null
  nationality: string | null
  role: string
  avatar_url: string | null
}

export function AdminView({ members, readOnly = false }: { members: AdminMember[]; readOnly?: boolean }) {
  const { tr } = useLanguage()
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return members
    return members.filter((m) => {
      const name = [m.first_name, m.last_name].filter(Boolean).join(' ').toLowerCase()
      return (
        (m.member_no ?? '').toLowerCase().includes(q) ||
        name.includes(q) ||
        (m.email ?? '').toLowerCase().includes(q) ||
        (m.phone ?? '').toLowerCase().includes(q)
      )
    })
  }, [members, query])

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-2xl font-extrabold text-foreground md:text-3xl">
          {tr(consoleCopy.membersHeading)} <span className="text-base font-semibold text-muted-foreground">({members.length.toLocaleString()})</span>
        </h1>
        {readOnly && (
          <span className="rounded-full border border-border bg-secondary px-3 py-1 text-xs font-semibold text-secondary-foreground">
            {tr(consoleCopy.membersReadOnly)}
          </span>
        )}
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={tr(authCopy.adminSearchPlaceholder)}
          aria-label={tr(authCopy.adminSearchPlaceholder)}
          className="w-full max-w-xs rounded-full border border-border bg-background px-4 py-2 text-sm text-foreground outline-none focus:border-primary"
        />
      </div>

      <div className="mt-4 overflow-x-auto rounded-2xl border border-border">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-secondary text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3">{tr(authCopy.memberNoFieldLabel)}</th>
              <th className="px-4 py-3">{tr(authCopy.nameFieldLabel)}</th>
              <th className="px-4 py-3">{tr(authCopy.emailFieldLabel)}</th>
              <th className="px-4 py-3">{tr(authCopy.phoneFieldLabel)}</th>
              <th className="px-4 py-3">{tr(authCopy.provinceFieldLabel)}</th>
              <th className="px-4 py-3">{tr(authCopy.nationalityFieldLabel)}</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((m) => (
              <tr key={m.id} className="bg-card">
                <td className="whitespace-nowrap px-4 py-3 font-mono text-primary">{m.member_no ?? '—'}</td>
                <td className="px-4 py-3">
                  <span className="flex items-center gap-2.5">
                    <AvatarCircle
                      src={m.avatar_url}
                      name={[m.first_name, m.last_name].filter(Boolean).join(' ') || m.email || '?'}
                      className="h-8 w-8 text-xs"
                    />
                    {[m.first_name, m.last_name].filter(Boolean).join(' ') || '—'}
                  </span>
                </td>
                <td className="px-4 py-3">{m.email ?? '—'}</td>
                <td className="whitespace-nowrap px-4 py-3">{m.phone ?? '—'}</td>
                <td className="px-4 py-3">{m.province ?? '—'}</td>
                <td className="px-4 py-3">{m.nationality ?? '—'}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  {!readOnly && (
                  <a
                    href={`${MEMBERS_PATH}/${m.id}`}
                    className="text-xs font-semibold text-primary underline-offset-2 hover:underline"
                  >
                    {tr(authCopy.editButton)}
                  </a>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">
                  {tr(authCopy.adminNoMembersFound)}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

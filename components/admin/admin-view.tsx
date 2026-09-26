'use client'

import { useMemo, useState } from 'react'
import { useLanguage } from '@/components/language-provider'
import { authCopy } from '@/lib/auth/copy'

export type AdminMember = {
  id: string
  member_no: string | null
  first_name: string | null
  last_name: string | null
  email: string | null
  phone: string | null
  province: string | null
  role: string
}

export function AdminView({ email, members }: { email: string; members: AdminMember[] }) {
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
    <div className="mx-auto max-w-5xl px-4 py-16">
      <p className="text-xs font-semibold tracking-brand uppercase text-primary">{tr(authCopy.adminWelcome)}</p>
      <h1 className="mt-2 font-display text-3xl font-extrabold text-foreground md:text-4xl">
        {tr(authCopy.adminHeading)}
      </h1>
      <p className="mt-3 text-sm text-muted-foreground">{email}</p>

      <div className="mt-10 flex flex-wrap items-center justify-between gap-4">
        <h2 className="font-display text-xl font-bold text-foreground">{tr(authCopy.adminMembersHeading)}</h2>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={tr(authCopy.adminSearchPlaceholder)}
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
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((m) => (
              <tr key={m.id} className="bg-card">
                <td className="whitespace-nowrap px-4 py-3 font-mono text-primary">{m.member_no ?? '—'}</td>
                <td className="px-4 py-3">{[m.first_name, m.last_name].filter(Boolean).join(' ') || '—'}</td>
                <td className="px-4 py-3">{m.email ?? '—'}</td>
                <td className="whitespace-nowrap px-4 py-3">{m.phone ?? '—'}</td>
                <td className="px-4 py-3">{m.province ?? '—'}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  <a
                    href={`/admin/members/${m.id}`}
                    className="text-xs font-semibold text-primary underline-offset-2 hover:underline"
                  >
                    {tr(authCopy.editButton)}
                  </a>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">
                  {tr(authCopy.adminNoMembersFound)}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <a
        href="/"
        className="mt-8 inline-block text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
      >
        {tr(authCopy.backHome)}
      </a>
    </div>
  )
}

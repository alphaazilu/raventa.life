'use client'

import { useLanguage } from '@/components/language-provider'
import { RoleSwitch } from '@/components/console/team-view'
import { TEAM_PATH, type Role } from '@/lib/auth/roles'

// Members › one member: their role, changeable here too (v0.27).
export function MemberRole({ person, meId }: { person: { id: string; name: string; role: Role }; meId: string }) {
  const { tr } = useLanguage()
  return (
    <section className="mb-6 flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3">
      <div>
        <h2 className="text-sm font-bold">{tr({ th: 'สิทธิ์ในระบบ', en: 'Role' })}</h2>
        <a href={TEAM_PATH} className="text-xs text-primary hover:underline">
          {tr({ th: 'ดูทีมงานทั้งหมด', en: 'See the whole team' })}
        </a>
      </div>
      <RoleSwitch person={person} meId={meId} />
    </section>
  )
}

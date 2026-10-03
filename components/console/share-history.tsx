'use client'

import { Gift, Undo2, UserMinus, UserPlus, XCircle } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { formatMemberDate } from '@/lib/format-date'
import { bangkokTime } from '@/lib/check-in/day'
import { MEMBERS_PATH } from '@/lib/auth/roles'
import type { ShareEvent } from '@/lib/package-share-history'

type L = { th: string; en: string }
const t = {
  heading: { th: 'ประวัติการแชร์แพ็กเกจ', en: 'Package sharing history' },
  // {n} visits, {p} the other person
  give_out: { th: 'ส่งของขวัญ {n} ครั้งให้ {p}', en: 'Gifted {n} visit(s) to {p}' },
  give_in: { th: 'ได้รับของขวัญ {n} ครั้งจาก {p}', en: 'Got {n} visit(s) from {p}' },
  take_back_out: { th: 'ดึงคืน {n} ครั้งจาก {p}', en: 'Took back {n} visit(s) from {p}' },
  take_back_in: { th: '{p} ดึงของขวัญคืน {n} ครั้ง', en: '{p} took back {n} visit(s)' },
  join_out: { th: '{p} เข้าร่วมใช้แพ็กเกจ', en: '{p} joined the package' },
  join_in: { th: 'เข้าร่วมใช้แพ็กเกจของ {p}', en: 'Joined {p}’s package' },
  remove_out: { th: 'เอา {p} ออกจากแพ็กเกจ', en: 'Removed {p} from the package' },
  remove_in: { th: '{p} เอาออกจากแพ็กเกจ', en: 'Removed by {p}' },
  cancelled_out: { th: 'ของขวัญที่ให้ {p} ถูกยกเลิกพร้อมบิล ({n} ครั้ง)', en: 'Gift to {p} cancelled with the bill ({n})' },
  cancelled_in: { th: 'ของขวัญจาก {p} ถูกยกเลิกพร้อมบิล ({n} ครั้ง)', en: 'Gift from {p} cancelled with the bill ({n})' },
  qr: { th: 'ผ่าน QR', en: 'by QR' },
  email: { th: 'ผ่านอีเมล', en: 'by email' },
} satisfies Record<string, L>

const ICON = { give: Gift, take_back: Undo2, join: UserPlus, remove: UserMinus, cancelled: XCircle }

// Back Office › Members › one member: every share they gave or got.
export function ShareHistory({ events, className }: { events: ShareEvent[]; className?: string }) {
  const { tr, lang } = useLanguage()
  if (events.length === 0) return null
  return (
    <section className={className}>
      <h2 className="mb-2 font-display text-xl font-extrabold text-foreground">{tr(t.heading)}</h2>
      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
        {events.map((e) => {
          const Icon = ICON[e.action]
          const key = `${e.action}_${e.outgoing ? 'out' : 'in'}` as keyof typeof t
          const [before, after] = tr(t[key]).replace('{n}', String(e.visits ?? 1)).split('{p}')
          return (
            <li key={e.id} className="flex items-start gap-3 px-4 py-3 text-sm">
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block text-card-foreground">
                  {before}
                  {e.otherId ? (
                    <a href={`${MEMBERS_PATH}/${e.otherId}`} className="font-semibold text-primary hover:underline">
                      {e.otherName}
                    </a>
                  ) : (
                    <span className="font-semibold">{e.otherName}</span>
                  )}
                  {after}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {e.packageName}
                  {e.via && ` · ${tr(t[e.via])}`}
                </span>
              </span>
              <span className="shrink-0 text-right text-xs text-muted-foreground">
                {formatMemberDate(e.at, lang, true)}
                <br />
                {bangkokTime(e.at)}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

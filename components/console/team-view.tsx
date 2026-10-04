'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Copy, Search, ShieldCheck, UserPlus, Users } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { Spinner } from '@/components/ui/spinner'
import { formatMemberDate } from '@/lib/format-date'
import { MEMBERS_PATH, type Role } from '@/lib/auth/roles'
import { findPeople, setRole } from '@/app/console/team/actions'
import type { Person, RoleChange } from '@/lib/console/team'
import { cn } from '@/lib/utils'

type L = { th: string; en: string }
const t = {
  title: { th: 'ทีมงานและสิทธิ์', en: 'Team & roles' },
  intro: { th: 'ใครเป็นพนักงานหรือแอดมิน · เปลี่ยนแล้วมีผลทันที ไม่ต้องแก้ใน Supabase', en: 'Who is staff or admin · changes apply at once, no Supabase editing' },
  customer: { th: 'ลูกค้า', en: 'Customer' },
  staff: { th: 'พนักงาน', en: 'Staff' },
  admin: { th: 'แอดมิน', en: 'Admin' },
  customerHint: { th: 'ใช้บัญชีสมาชิกอย่างเดียว', en: 'Member account only' },
  staffHint: { th: 'ขาย/เช็คอิน · ลงเวลา · Tablet', en: 'Sell / check in · time clock · tablet' },
  adminHint: { th: 'ทุกอย่าง รวมยอดขาย รายงาน ตั้งค่า', en: 'Everything incl. takings, reports, settings' },
  team: { th: 'ทีมงานตอนนี้', en: 'Current team' },
  none: { th: 'ยังไม่มีพนักงาน', en: 'No staff yet' },
  you: { th: 'คุณ', en: 'You' },
  since: { th: 'ตั้งแต่ {d}', en: 'since {d}' },
  add: { th: 'เพิ่มทีมงาน', en: 'Add to the team' },
  searchPh: { th: 'ค้นหาชื่อ อีเมล เบอร์โทร หรือเลขสมาชิก', en: 'Search name, email, phone or member no.' },
  noResult: { th: 'ไม่พบ — ถ้ายังไม่เป็นสมาชิก ส่งลิงก์นี้ให้สมัครก่อน แล้วค้นหาอีกครั้ง', en: 'Not found — if they aren’t a member yet, send this link to sign up, then search again' },
  copy: { th: 'คัดลอกลิงก์', en: 'Copy link' },
  copied: { th: 'คัดลอกแล้ว', en: 'Copied' },
  makeStaff: { th: 'ตั้งเป็นพนักงาน', en: 'Make staff' },
  makeAdmin: { th: 'ตั้งเป็นแอดมิน', en: 'Make admin' },
  already: { th: 'เป็น{r}อยู่แล้ว', en: 'Already {r}' },
  confirmAdmin: { th: 'ตั้ง {n} เป็นแอดมิน? แอดมินเห็นยอดขายและแก้ได้ทุกอย่าง รวมถึงเปลี่ยนสิทธิ์คนอื่น', en: 'Make {n} an admin? Admins see takings and can change everything, including roles' },
  confirmCustomer: { th: 'เอา {n} ออกจากทีม (กลับเป็นลูกค้า)? เข้าหลังร้านไม่ได้ตั้งแต่หน้าถัดไป', en: 'Remove {n} from the team (back to customer)? Back Office access ends on their next page' },
  confirmSwitch: { th: 'เปลี่ยน {n} เป็น{r}?', en: 'Change {n} to {r}?' },
  clearShifts: { th: 'ล้างกะที่จัดไว้ตั้งแต่วันนี้', en: 'Clear their planned shifts from today' },
  clearPhone: { th: 'ปิดสิทธิ์ขาย/เช็คอินบนมือถือ', en: 'Turn off selling from their phone' },
  confirm: { th: 'ยืนยัน', en: 'Confirm' },
  cancel: { th: 'ยกเลิก', en: 'Cancel' },
  history: { th: 'ประวัติการเปลี่ยนสิทธิ์', en: 'Role changes' },
  historyLine: { th: '{who} เปลี่ยน {whom}: {from} → {to}', en: '{who} changed {whom}: {from} → {to}' },
  noHistory: { th: 'ยังไม่มีการเปลี่ยนผ่านหน้านี้', en: 'No changes made here yet' },
} satisfies Record<string, L>

const errors: Record<string, L> = {
  self: { th: 'ลดสิทธิ์ตัวเองไม่ได้ — ให้แอดมินคนอื่นทำ', en: 'You can’t lower your own role — ask another admin' },
  last_admin: { th: 'ต้องมีแอดมินอย่างน้อย 1 คน — ตั้งคนอื่นเป็นแอดมินก่อน', en: 'There must be at least one admin — make someone else admin first' },
  open_entry: { th: 'คนนี้ยังลงเวลาเข้างานค้างอยู่ — ลงเวลาออกให้ก่อน (หลังร้าน › ลงเวลาทำงาน)', en: 'Still clocked in — clock them out first (Time clock)' },
  not_found: { th: 'ไม่พบสมาชิกคนนี้', en: 'Member not found' },
  not_admin: { th: 'เฉพาะแอดมินเท่านั้น', en: 'Admins only' },
  failed: { th: 'บันทึกไม่สำเร็จ ลองอีกครั้ง', en: 'Couldn’t save — try again' },
}

const ROLES: Role[] = ['customer', 'staff', 'admin']

// The three-way switch for one person, with its confirmation step. Also
// used on Members › one member.
export function RoleSwitch({
  person,
  meId,
  compact = false,
  onChanged,
}: {
  person: Pick<Person, 'id' | 'name' | 'role'>
  meId: string
  compact?: boolean
  onChanged?: (role: Role) => void
}) {
  const { tr } = useLanguage()
  const router = useRouter()
  const [pending, start] = useTransition()
  const [ask, setAsk] = useState<Role | null>(null)
  const [clearShifts, setClearShifts] = useState(true)
  const [clearPhone, setClearPhone] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const self = person.id === meId

  const apply = (role: Role) =>
    start(async () => {
      setError(null)
      const r = await setRole(person.id, role, { confirmAdmin: role === 'admin', clearShifts, clearPhone })
      if (!r.ok) setError(r.error)
      else {
        setAsk(null)
        onChanged?.(role)
      }
      router.refresh()
    })

  return (
    <div className={cn('flex flex-col gap-2', compact ? 'items-start' : 'items-end')}>
      <div className="inline-flex rounded-full bg-secondary p-1 text-xs font-semibold" role="radiogroup">
        {ROLES.map((r) => (
          <button
            key={r}
            type="button"
            role="radio"
            aria-checked={person.role === r}
            disabled={pending || (self && r !== 'admin')}
            onClick={() => {
              setError(null)
              if (r !== person.role) setAsk(r)
            }}
            title={tr(t[`${r}Hint`])}
            className={cn(
              'rounded-full px-3 py-1.5 disabled:cursor-not-allowed',
              person.role === r ? (r === 'admin' ? 'bg-primary text-primary-foreground' : 'bg-background shadow-sm') : 'text-muted-foreground hover:text-foreground',
              self && r !== 'admin' && person.role !== r && 'opacity-40',
            )}
          >
            {tr(t[r])}
          </button>
        ))}
      </div>
      {ask && (
        <div className="w-full max-w-sm rounded-xl border border-border bg-background p-3 text-left text-sm">
          <p className="font-semibold">
            {ask === 'admin'
              ? tr(t.confirmAdmin).replace('{n}', person.name)
              : ask === 'customer'
                ? tr(t.confirmCustomer).replace('{n}', person.name)
                : tr(t.confirmSwitch).replace('{n}', person.name).replace('{r}', tr(t[ask]))}
          </p>
          {ask === 'customer' && (
            <div className="mt-2 space-y-1.5 text-xs">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={clearShifts} onChange={(e) => setClearShifts(e.target.checked)} className="h-4 w-4 accent-[var(--primary)]" />
                {tr(t.clearShifts)}
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={clearPhone} onChange={(e) => setClearPhone(e.target.checked)} className="h-4 w-4 accent-[var(--primary)]" />
                {tr(t.clearPhone)}
              </label>
            </div>
          )}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => apply(ask)}
              className={cn(
                'inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-xs font-bold disabled:opacity-50',
                ask === 'customer' ? 'bg-destructive text-white' : 'bg-primary text-primary-foreground',
              )}
            >
              {pending && <Spinner className="h-3.5 w-3.5" />}
              {tr(t.confirm)}
            </button>
            <button type="button" onClick={() => setAsk(null)} className="h-9 rounded-full border border-border px-4 text-xs font-semibold">
              {tr(t.cancel)}
            </button>
          </div>
        </div>
      )}
      {error && <p className="text-xs font-semibold text-destructive">{tr(errors[error] ?? errors.failed)}</p>}
    </div>
  )
}

export function TeamView({ team, history, meId }: { team: Person[]; history: RoleChange[]; meId: string }) {
  const { tr, lang } = useLanguage()
  const date = (iso: string | null) => (iso ? formatMemberDate(iso, lang, true) : null)

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5 px-4 py-6 md:px-6 md:py-8">
      <div>
        <h1 className="font-display text-2xl font-extrabold md:text-3xl">{tr(t.title)}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{tr(t.intro)}</p>
        <div className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
          {ROLES.map((r) => (
            <div key={r} className="rounded-xl border border-border bg-card px-3 py-2">
              <p className="font-bold">{tr(t[r])}</p>
              <p className="text-muted-foreground">{tr(t[`${r}Hint`])}</p>
            </div>
          ))}
        </div>
      </div>

      <AddPeople meId={meId} />

      <section className="rounded-2xl border border-border bg-card p-4 md:p-5">
        <h2 className="mb-2 flex items-center gap-2 font-display text-lg font-extrabold">
          <Users className="h-5 w-5 text-primary" aria-hidden="true" />
          {tr(t.team)} ({team.length})
        </h2>
        {team.length === 0 && <p className="py-3 text-sm text-muted-foreground">{tr(t.none)}</p>}
        <ul className="divide-y divide-border">
          {team.map((p) => (
            <li key={p.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
              <div className="min-w-0">
                <a href={`${MEMBERS_PATH}/${p.id}`} className="font-semibold hover:text-primary hover:underline">
                  {p.name}
                </a>
                {p.id === meId && <span className="ml-2 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold">{tr(t.you)}</span>}
                <p className="text-xs text-muted-foreground">
                  {[p.memberNo, p.email, p.since ? tr(t.since).replace('{d}', date(p.since) ?? '') : null].filter(Boolean).join(' · ')}
                </p>
              </div>
              <RoleSwitch person={p} meId={meId} />
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-border bg-card p-4 md:p-5">
        <h2 className="mb-2 flex items-center gap-2 font-display text-lg font-extrabold">
          <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />
          {tr(t.history)}
        </h2>
        {history.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">{tr(t.noHistory)}</p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {history.map((h) => (
              <li key={h.id} className="flex justify-between gap-3 py-2">
                <span>
                  {tr(t.historyLine)
                    .replace('{who}', h.who)
                    .replace('{whom}', h.whom)
                    .replace('{from}', tr(t[h.from]))
                    .replace('{to}', tr(t[h.to]))}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">{date(h.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function AddPeople({ meId }: { meId: string }) {
  const { tr } = useLanguage()
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Person[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults(null)
      return
    }
    let stop = false
    setLoading(true)
    const id = setTimeout(async () => {
      const r = await findPeople(q)
      if (!stop) {
        setResults(r)
        setLoading(false)
      }
    }, 300)
    return () => {
      stop = true
      clearTimeout(id)
    }
  }, [q])

  const signupUrl = typeof window === 'undefined' ? '/login' : `${window.location.origin}/login`

  return (
    <section className="rounded-2xl border border-border bg-card p-4 md:p-5">
      <h2 className="mb-2 flex items-center gap-2 font-display text-lg font-extrabold">
        <UserPlus className="h-5 w-5 text-primary" aria-hidden="true" />
        {tr(t.add)}
      </h2>
      <label className="relative block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={tr(t.searchPh)}
          aria-label={tr(t.searchPh)}
          className="h-11 w-full rounded-full border border-border bg-background pl-9 pr-10 text-base outline-none focus:border-primary sm:text-sm"
        />
        {loading && <Spinner className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2" />}
      </label>
      {results && results.length === 0 && !loading && (
        <div className="mt-3 rounded-xl bg-secondary px-3 py-2.5 text-sm">
          <p>{tr(t.noResult)}</p>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(signupUrl)
              setCopied(true)
            }}
            className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-semibold"
          >
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
            {copied ? tr(t.copied) : tr(t.copy)} · {signupUrl}
          </button>
        </div>
      )}
      {results && results.length > 0 && (
        <ul className="mt-3 divide-y divide-border">
          {results.map((p) => (
            <li key={p.id} className="flex flex-wrap items-start justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="font-semibold">{p.name}</p>
                <p className="text-xs text-muted-foreground">{[p.memberNo, p.email, p.phone].filter(Boolean).join(' · ')}</p>
              </div>
              <RoleSwitch person={p} meId={meId} onChanged={(role) => setResults((cur) => cur?.map((x) => (x.id === p.id ? { ...x, role } : x)) ?? null)} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

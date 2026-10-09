'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Copy, RotateCcw, Search, ShieldCheck, UserMinus, UserPlus, Users, X } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { Spinner } from '@/components/ui/spinner'
import { formatMemberDate } from '@/lib/format-date'
import { MEMBERS_PATH, type Role } from '@/lib/auth/roles'
import { findPerson, personFromQr, setPayType, setRole } from '@/app/console/team/actions'
import { PAY_TYPES, type PayType } from '@/lib/console/pay-cycle'
import { QrScanner } from '@/components/admin/qr-scanner'
import { AvatarCircle } from '@/components/account/avatar-circle'
import { SearchInput } from '@/components/ui/search-input'
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
  now: { th: 'ตอนนี้', en: 'Now' },
  you: { th: 'คุณ', en: 'You' },
  since: { th: 'ตั้งแต่ {d}', en: 'since {d}' },
  add: { th: 'เพิ่มทีมงาน', en: 'Add to the team' },
  searchPh: { th: 'เลขสมาชิก อีเมลเต็ม หรือเบอร์โทรเต็ม', en: 'Member no., full email or full phone' },
  addHow: { th: 'สแกนบัตรสมาชิกของคนนั้น (แนะนำ) หรือพิมพ์เลขสมาชิก/อีเมล/เบอร์โทรให้ตรงทั้งค่า — ไม่ค้นจากชื่อ เพื่อไม่ให้ใช้ไล่ดูรายชื่อลูกค้า', en: 'Scan their member card (best) or type their exact member no. / email / phone — no name search, so it can’t be used to browse members' },
  scanCard: { th: 'สแกนบัตรสมาชิก', en: 'Scan member card' },
  scanHint: { th: 'เปิดบัตรสมาชิกในมือถือ แตะให้ขึ้น QR แล้วยื่นให้กล้อง · หรือแตะแว่นขยายเพื่อค้นหา', en: 'Open the member card and hold up the QR · or tap the magnifier to look up' },
  find: { th: 'ค้นหา', en: 'Find' },
  searchHeading: { th: 'ค้นหาแบบตรงทั้งค่า', en: 'Exact look-up' },
  checking: { th: 'กำลังตรวจ…', en: 'Checking…' },
  next: { th: 'คนถัดไป', en: 'Next person' },
  chooseRole: { th: 'ให้สิทธิ์เป็น', en: 'Give them the role' },
  noResult: { th: 'ไม่พบ (ต้องพิมพ์ให้ตรงทั้งค่า) — ถ้ายังไม่เป็นสมาชิก ส่งลิงก์นี้ให้สมัครก่อน', en: 'No exact match — if they aren’t a member yet, send this link to sign up' },
  copy: { th: 'คัดลอกลิงก์', en: 'Copy link' },
  copied: { th: 'คัดลอกแล้ว', en: 'Copied' },
  makeStaff: { th: 'ตั้งเป็นพนักงาน', en: 'Make staff' },
  makeAdmin: { th: 'ตั้งเป็นแอดมิน', en: 'Make admin' },
  already: { th: 'เป็น{r}อยู่แล้ว', en: 'Already {r}' },
  confirmAdmin: { th: 'ตั้ง {n} เป็นแอดมิน? แอดมินเห็นยอดขายและแก้ได้ทุกอย่าง รวมถึงเปลี่ยนสิทธิ์คนอื่น', en: 'Make {n} an admin? Admins see takings and can change everything, including roles' },
  confirmCustomer: { th: 'ยกเลิกการเป็นพนักงานของ {n}? (กลับเป็นลูกค้า) เข้าหลังร้านไม่ได้ตั้งแต่หน้าถัดไป', en: '{n} is no longer staff? (back to customer) Back Office access ends on their next page' },
  remove: { th: 'ยกเลิกการเป็นพนักงาน', en: 'No longer staff' },
  tabEmpty: { th: 'ยังไม่มี{r}', en: 'No {r} yet' },
  monthly: { th: 'รายเดือน', en: 'Monthly' },
  daily: { th: 'รายวัน', en: 'Daily' },
  payHeading: { th: 'จ้างแบบ', en: 'Paid' },
  payUnset: { th: 'ยังไม่ระบุ', en: 'Not set' },
  payNotSetUp: { th: 'ระบุพนักงานรายวัน/รายเดือนได้หลังรัน supabase/schema.sql (§28)', en: 'Daily / monthly pay can be set after running supabase/schema.sql (§28)' },
  payUnsetCount: { th: '{n} คนยังไม่ได้ระบุว่าเป็นรายวันหรือรายเดือน — ใช้แยกในรายงานการลงเวลา', en: '{n} people have no pay type yet — the time report splits by it' },
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
  qr_expired: { th: 'QR หมดอายุ — ให้แตะบัตรเพื่อขึ้น QR ใหม่', en: 'QR expired — tap the card for a fresh one' },
  qr_invalid: { th: 'ไม่ใช่ QR บัตรสมาชิก RAVENTA', en: 'Not a RAVENTA member card QR' },
  failed: { th: 'บันทึกไม่สำเร็จ ลองอีกครั้ง', en: 'Couldn’t save — try again' },
  not_team: { th: 'ต้องเป็นพนักงานหรือแอดมินก่อน', en: 'Make them staff or admin first' },
  pay_not_set_up: { th: 'ยังไม่ได้รัน supabase/schema.sql (§28)', en: 'Run supabase/schema.sql (§28) first' },
}

// v0.27.1: the switch only moves people within the team; leaving the team
// is its own button ("no longer staff"), not a third "customer" choice.
const TEAM_ROLES: Role[] = ['staff', 'admin']

// The three-way switch for one person, with its confirmation step. Also
// used on Members › one member.
export function RoleSwitch({
  person,
  meId,
  compact = false,
  cards = false,
  onChanged,
}: {
  person: Pick<Person, 'id' | 'name' | 'role'>
  meId: string
  compact?: boolean
  // Big choice cards (the add-to-team station) instead of the small switch.
  cards?: boolean
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
      const r = await setRole(person.id, role, {
        confirmAdmin: role === 'admin',
        clearShifts,
        clearPhone,
      })
      if (!r.ok) setError(r.error)
      else {
        setAsk(null)
        onChanged?.(role)
      }
      router.refresh()
    })

  const inTeam = person.role !== 'customer'
  const removeBtn = inTeam && !self && (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        setError(null)
        setAsk('customer')
      }}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-full border text-xs font-semibold transition-colors disabled:opacity-40',
        ask === 'customer'
          ? 'border-destructive bg-destructive/5 text-destructive'
          : cards
            ? 'border-destructive/30 text-destructive hover:border-destructive'
            : 'border-border text-muted-foreground hover:border-destructive hover:text-destructive',
        cards ? 'h-10 w-full' : 'h-8 px-3',
      )}
    >
      <UserMinus className="h-3.5 w-3.5" aria-hidden="true" />
      {tr(t.remove)}
    </button>
  )

  return (
    <div className={cn('flex flex-col gap-2', cards ? 'items-stretch' : compact ? 'items-start' : 'items-end')}>
      {cards ? (
        <>
          <div className="grid grid-cols-2 gap-2" role="radiogroup">
            {TEAM_ROLES.map((r) => {
              const current = person.role === r
              const picked = ask === r
              return (
                <button
                  key={r}
                  type="button"
                  role="radio"
                  aria-checked={current}
                  disabled={pending || (self && r !== 'admin')}
                  onClick={() => {
                    setError(null)
                    if (!current) setAsk(r)
                  }}
                  className={cn(
                    'relative rounded-2xl border-2 px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40',
                    current ? 'border-primary bg-primary/5' : picked ? 'border-foreground' : 'border-border hover:border-primary/40',
                  )}
                >
                  {current && (
                    <span className="absolute -top-2.5 right-2 whitespace-nowrap rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">
                      {tr(t.now)}
                    </span>
                  )}
                  <span className="block font-display text-base font-extrabold">{tr(t[r])}</span>
                  <span className="mt-1 block text-[11px] leading-snug text-muted-foreground">{tr(t[`${r}Hint`])}</span>
                </button>
              )
            })}
          </div>
          {removeBtn}
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-full bg-secondary p-1 text-xs font-semibold" role="radiogroup">
            {TEAM_ROLES.map((r) => (
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
                  person.role === r
                    ? r === 'admin'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-background shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                  self && r !== 'admin' && person.role !== r && 'opacity-40',
                )}
              >
                {tr(t[r])}
              </button>
            ))}
          </div>
          {removeBtn}
        </div>
      )}
      {ask && (
        <div className={cn('w-full rounded-xl border border-border bg-background p-3 text-left text-sm', !cards && 'max-w-sm')}>
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

// Paid by the day or by the month (v0.28) — a small switch on each team
// row and at the add-to-team station.
export function PaySwitch({
  person,
  big = false,
  onChanged,
}: {
  person: Pick<Person, 'id' | 'payType'>
  big?: boolean
  onChanged?: (p: PayType) => void
}) {
  const { tr } = useLanguage()
  const router = useRouter()
  const [pending, start] = useTransition()
  const [value, setValue] = useState<PayType | null>(person.payType ?? null)
  const [error, setError] = useState<string | null>(null)
  const pick = (p: PayType) =>
    start(async () => {
      setError(null)
      const before = value
      setValue(p)
      const r = await setPayType(person.id, p)
      if (!r.ok) {
        setValue(before)
        setError(r.error)
      } else onChanged?.(p)
      router.refresh()
    })
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-2', big && 'w-full')}>
      <span
        className={cn(
          'inline-flex rounded-full p-0.5 font-semibold',
          big ? 'w-full bg-secondary text-sm' : 'text-[11px]',
          !big && (value ? 'bg-secondary' : 'bg-amber-500/15 ring-1 ring-amber-500/40'),
        )}
        role="radiogroup"
        aria-label={tr(t.payHeading)}
      >
        {PAY_TYPES.map((p) => (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={value === p}
            disabled={pending}
            onClick={() => value !== p && pick(p)}
            className={cn(
              'rounded-full transition-colors disabled:opacity-60',
              big ? 'flex-1 py-2' : 'px-2.5 py-0.5',
              value === p ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {tr(t[p])}
          </button>
        ))}
      </span>
      {!value && !big && <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">{tr(t.payUnset)}</span>}
      {error && <span className="text-[11px] font-semibold text-destructive">{tr(errors[error] ?? errors.failed)}</span>}
    </span>
  )
}

export function TeamView({ team, history, meId, paySetUp = true }: { team: Person[]; history: RoleChange[]; meId: string; paySetUp?: boolean }) {
  const { tr, lang } = useLanguage()
  const date = (iso: string | null) => (iso ? formatMemberDate(iso, lang, true) : null)
  // The team in tabs by role (v0.27.1); staff first — the longer list.
  const [tab, setTab] = useState<Role>('staff')
  const shown = team.filter((p) => p.role === tab)
  const unsetPay = team.filter((p) => !p.payType).length

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-6 md:px-6 md:py-8">
      <div>
        <h1 className="font-display text-2xl font-extrabold md:text-3xl">{tr(t.title)}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{tr(t.intro)}</p>
      </div>
      {!paySetUp && <p className="rounded-2xl bg-amber-500/15 px-4 py-3 text-sm font-semibold text-amber-800 dark:text-amber-300">{tr(t.payNotSetUp)}</p>}
      {paySetUp && unsetPay > 0 && (
        <p className="rounded-2xl bg-amber-500/15 px-4 py-3 text-sm font-semibold text-amber-800 dark:text-amber-300">
          {tr(t.payUnsetCount).replace('{n}', String(unsetPay))}
        </p>
      )}

      <AddPeople meId={meId} paySetUp={paySetUp}>
        <section className="rounded-2xl border border-border bg-card p-4 md:p-5">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 font-display text-lg font-extrabold">
              <Users className="h-5 w-5 text-primary" aria-hidden="true" />
              {tr(t.team)} ({team.length})
            </h2>
            <div className="inline-flex rounded-full bg-secondary p-1 text-sm font-semibold" role="tablist">
              {TEAM_ROLES.map((r) => (
                <button
                  key={r}
                  type="button"
                  role="tab"
                  aria-selected={tab === r}
                  onClick={() => setTab(r)}
                  className={cn('rounded-full px-4 py-1.5', tab === r ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground')}
                >
                  {tr(t[r])} <span className="text-muted-foreground">{team.filter((p) => p.role === r).length}</span>
                </button>
              ))}
            </div>
          </div>
          {shown.length === 0 && <p className="py-3 text-sm text-muted-foreground">{tr(t.tabEmpty).replace('{r}', tr(t[tab]))}</p>}
          <ul className="divide-y divide-border">
            {shown.map((p) => (
              <li key={p.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <a href={`${MEMBERS_PATH}/${p.id}`} className="font-semibold hover:text-primary hover:underline">
                    {p.name}
                  </a>
                  {p.id === meId && <span className="ml-2 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold">{tr(t.you)}</span>}
                  <p className="text-xs text-muted-foreground">
                    {[p.memberNo, p.email, p.since ? tr(t.since).replace('{d}', date(p.since) ?? '') : null].filter(Boolean).join(' · ')}
                  </p>
                  {paySetUp && (
                    <div className="mt-1.5">
                      <PaySwitch key={`${p.id}-${p.payType ?? ''}`} person={p} />
                    </div>
                  )}
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
                    {tr(t.historyLine).replace('{who}', h.who).replace('{whom}', h.whom).replace('{from}', tr(t[h.from])).replace('{to}', tr(t[h.to]))}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{date(h.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </AddPeople>
    </div>
  )
}

// Add someone, laid out like the front desk (v0.27.1): a round camera on
// the left — scan their member card (best: it's them, in person), or tap
// the magnifier to type one exact member no. / email / phone. Once found,
// their photo takes the camera's place and the role choice sits under it.
// On tablet and up this whole left column stays put while the right
// column (the team by role, then the history) scrolls past it.
function AddPeople({ meId, paySetUp, children }: { meId: string; paySetUp: boolean; children?: React.ReactNode }) {
  const { tr } = useLanguage()
  const [searchOpen, setSearchOpen] = useState(false)
  const [q, setQ] = useState('')
  const [found, setFound] = useState<Person | null>(null)
  const [miss, setMiss] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const [copied, setCopied] = useState(false)
  const signupUrl = typeof window === 'undefined' ? '/login' : `${window.location.origin}/login`

  const reset = () => {
    setFound(null)
    setMiss(null)
    setQ('')
  }
  const onCode = (text: string) =>
    start(async () => {
      setMiss(null)
      const r = await personFromQr(text)
      if (r.ok) setFound(r.person)
      else setMiss(r.error)
    })
  const onSearch = (e: React.FormEvent) => {
    e.preventDefault()
    start(async () => {
      setMiss(null)
      const p = await findPerson(q)
      if (p) {
        setFound(p)
        setSearchOpen(false)
      } else setMiss('no_match')
    })
  }

  return (
    <div className="grid items-start gap-5 md:grid-cols-[17rem_minmax(0,1fr)] lg:grid-cols-[19rem_minmax(0,1fr)]">
      {/* Left: who — pinned under the console bar while the right scrolls */}
      <aside className="md:sticky md:top-[73px] md:max-h-[calc(100dvh-89px)] md:overflow-y-auto xl:top-[81px] xl:max-h-[calc(100dvh-97px)]">
        <h2 className="mb-2 flex items-center gap-2 font-display text-lg font-extrabold">
          <UserPlus className="h-5 w-5 text-primary" aria-hidden="true" />
          {tr(t.add)}
        </h2>
        <div className="relative rounded-2xl border border-border bg-card p-4">
          <div className="relative mx-auto w-full max-w-[15rem]">
            <QrScanner
              round
              hint={null}
              onCode={onCode}
              paused={pending || found !== null || searchOpen}
              pausedText={tr(t.checking)}
              cover={found ? <AvatarCircle src={found.avatarUrl ?? null} name={found.name} className="h-full w-full text-6xl" /> : undefined}
              corner={
                found ? (
                  <CornerButton label={tr(t.next)} onClick={reset}>
                    <RotateCcw className="h-5 w-5" aria-hidden="true" />
                  </CornerButton>
                ) : (
                  <CornerButton
                    label={tr(t.find)}
                    onClick={() => {
                      setMiss(null)
                      setSearchOpen(true)
                    }}
                  >
                    <Search className="h-5 w-5" aria-hidden="true" />
                  </CornerButton>
                )
              }
            />
            {searchOpen && !found && (
              <form onSubmit={onSearch} className="absolute inset-x-[-0.5rem] top-[35%] z-20 rounded-2xl border border-border bg-card p-3 shadow-xl">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground">{tr(t.searchHeading)}</span>
                  <button type="button" onClick={() => setSearchOpen(false)} aria-label={tr(t.cancel)} className="text-muted-foreground">
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
                <SearchInput value={q} onChange={setQ} placeholder={tr(t.searchPh)} clearLabel={tr(t.cancel)} autoFocus />
                <button
                  type="submit"
                  disabled={pending || q.trim().length < 4}
                  className="mt-2 inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-full bg-foreground text-sm font-semibold text-background disabled:opacity-40"
                >
                  {pending ? <Spinner className="h-4 w-4" /> : <Search className="h-4 w-4" aria-hidden="true" />}
                  {tr(t.find)}
                </button>
              </form>
            )}
          </div>

          <div className="mt-4 text-center">
            {found ? (
              <>
                <p className="font-display text-lg font-extrabold">{found.name}</p>
                {found.memberNo && <p className="font-mono text-sm text-primary">{found.memberNo}</p>}
                <p className="mt-1 text-xs text-muted-foreground">{[found.email, found.phone].filter(Boolean).join(' · ')}</p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">{tr(t.scanHint)}</p>
            )}
            {miss && (
              <div className="mt-3 rounded-xl bg-secondary px-3 py-2.5 text-left text-sm">
                <p>{tr(miss === 'no_match' ? t.noResult : (errors[miss] ?? errors.failed))}</p>
                {miss === 'no_match' && (
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard?.writeText(signupUrl)
                      setCopied(true)
                    }}
                    className="mt-2 inline-flex max-w-full items-center gap-1.5 truncate rounded-full border border-border bg-background px-3 py-1.5 text-xs font-semibold"
                  >
                    <Copy className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    {copied ? tr(t.copied) : tr(t.copy)}
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="mt-4 border-t border-border pt-3">
            <h3 className="mb-2 text-sm font-bold">{tr(t.chooseRole)}</h3>
            {found ? (
              <>
                <RoleSwitch person={found} meId={meId} cards onChanged={(role) => setFound({ ...found, role })} />
                {paySetUp && found.role !== 'customer' && (
                  <div className="mt-3">
                    <h3 className="mb-2 text-sm font-bold">{tr(t.payHeading)}</h3>
                    <PaySwitch key={found.id} person={found} big onChanged={(payType) => setFound({ ...found, payType })} />
                  </div>
                )}
              </>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {TEAM_ROLES.map((r) => (
                  <div key={r} className="rounded-2xl border-2 border-dashed border-border px-3 py-2.5 opacity-60">
                    <p className="font-display text-base font-extrabold">{tr(t[r])}</p>
                    <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{tr(t[`${r}Hint`])}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
          {pending && (
            <div className="absolute inset-0 z-30 flex items-center justify-center rounded-2xl bg-card/50">
              <Spinner className="h-6 w-6 text-primary" />
            </div>
          )}
        </div>
        <p className="mt-3 px-1 text-xs leading-relaxed text-muted-foreground">{tr(t.addHow)}</p>
      </aside>

      {/* Right: the team by role, then its history */}
      <div className="flex min-w-0 flex-col gap-5 md:pt-9">
        {children}
      </div>
    </div>
  )
}

function CornerButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-12 w-12 items-center justify-center rounded-full border-4 border-card bg-primary text-primary-foreground shadow-md"
    >
      {children}
    </button>
  )
}

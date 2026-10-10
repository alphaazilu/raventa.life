'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { CalendarOff, ChevronRight, Clock, Lock, Receipt, Smartphone, Users, Wallet } from 'lucide-react'
import { LEAVE_KINDS, leaveCopy } from '@/lib/leave'
import { useLanguage } from '@/components/language-provider'
import { Spinner } from '@/components/ui/spinner'
import { settingsCopy as c, settingsErrors } from '@/lib/console/copy'
import { CATALOG_PATH, DEVICES_PATH, SETTINGS_PATH, TIME_PATH } from '@/lib/auth/roles'
import type { AppSettings } from '@/lib/console/settings'
import { cycleOf, type DailyCycle } from '@/lib/console/pay-cycle'
import { formatMemberDate } from '@/lib/format-date'
import { bangkokToday } from '@/lib/check-in/day'
import { saveAccessSettings, savePayCycle, setPhoneAccess } from '@/app/console/settings/actions'
import { saveTimeSettings } from '@/app/console/time/shift-actions'
import { shiftErrors, timeCopy } from '@/lib/console/copy'
import type { TimeSettings } from '@/lib/console/shift-math'
import { cn } from '@/lib/utils'

const card = 'rounded-2xl border border-border bg-card p-5'
const input = 'w-20 rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary'
const select = 'rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-50'

const SETTINGS_TABS = ['team', 'work', 'shop'] as const
export type SettingsTab = (typeof SETTINGS_TABS)[number]
const TAB_LABEL = { team: c.tabTeam, work: c.tabWork, shop: c.tabShop }

const WEEKDAYS = [
  { th: 'อาทิตย์', en: 'Sunday' },
  { th: 'จันทร์', en: 'Monday' },
  { th: 'อังคาร', en: 'Tuesday' },
  { th: 'พุธ', en: 'Wednesday' },
  { th: 'พฤหัสบดี', en: 'Thursday' },
  { th: 'ศุกร์', en: 'Friday' },
  { th: 'เสาร์', en: 'Saturday' },
]

function Toggle({ on, onChange, label, hint }: { on: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 py-2">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => onChange(!on)}
        className={cn('mt-0.5 flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors', on ? 'bg-accent' : 'bg-muted')}
      >
        <span className={cn('h-5 w-5 rounded-full bg-white shadow transition-transform', on && 'translate-x-5')} />
      </button>
      <span>
        <span className="block text-sm font-semibold text-foreground">{label}</span>
        {hint && <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span>}
      </span>
    </label>
  )
}

function Links({ items }: { items: { href: string; text: { th: string; en: string } }[] }) {
  const { tr } = useLanguage()
  return (
    <ul className="divide-y divide-border">
      {items.map((e) => (
        <li key={e.href}>
          <Link href={e.href} className="flex items-center justify-between py-2.5 text-sm hover:text-primary">
            {tr(e.text)}
            <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          </Link>
        </li>
      ))}
    </ul>
  )
}

// Back Office › Settings in three tabs (v0.28): staff & devices, work time &
// leave, shop & accounts. One save bar for all of them, shown while
// something is changed; switching tabs keeps what was typed.
export function SettingsView({
  settings,
  staff,
  phoneAccess,
  setUp,
  initialTab = 'team',
  timeRules,
}: {
  settings: AppSettings
  staff: { id: string; name: string }[]
  phoneAccess: string[]
  setUp: boolean
  initialTab?: SettingsTab
  // Late / OT / minimum people a day (§17, §26) — moved here from Time (v0.30).
  timeRules: TimeSettings
}) {
  const { tr, lang } = useLanguage()
  const router = useRouter()
  const [pending, start] = useTransition()
  const [tab, setTab] = useState<SettingsTab>(initialTab)
  const [form, setForm] = useState(settings)
  const [rules, setRules] = useState(timeRules)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  useEffect(() => {
    if (!saved) return
    const id = setTimeout(() => setSaved(false), 2500)
    return () => clearTimeout(id)
  }, [saved])

  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
  const dirtyBy: Record<SettingsTab, boolean> = {
    team:
      form.staffDeskOnPhone !== settings.staffDeskOnPhone ||
      form.staffMembersOnTablet !== settings.staffMembersOnTablet ||
      form.staffIdleMinutes !== settings.staffIdleMinutes ||
      form.adminIdleMinutes !== settings.adminIdleMinutes,
    work: !same(form.leave, settings.leave) || !same(form.pay, settings.pay) || !same(rules, timeRules),
    shop: form.vatRegistered !== settings.vatRegistered,
  }
  const dirty = SETTINGS_TABS.some((k) => dirtyBy[k])
  const payDirty = !same(form.pay, settings.pay)
  const restDirty = dirtyBy.team || dirtyBy.shop || !same(form.leave, settings.leave)

  const go = (k: SettingsTab) => {
    setTab(k)
    try {
      window.history.replaceState(null, '', `${SETTINGS_PATH}?tab=${k}`)
    } catch {}
  }

  const save = () =>
    start(async () => {
      setError(null)
      setSaved(false)
      if (restDirty) {
        const r = await saveAccessSettings(form)
        if (!r.ok) return setError(r.error)
      }
      if (payDirty) {
        const r = await savePayCycle(form.pay)
        if (!r.ok) return setError(r.error)
      }
      if (!same(rules, timeRules)) {
        const r = await saveTimeSettings(rules.lateGraceMinutes, rules.otMinMinutes, rules.minStaffPerDay)
        if (!r.ok) return setError(`rules:${r.error}`)
      }
      setSaved(true)
      router.refresh()
    })

  const togglePhone = (id: string, allowed: boolean) =>
    start(async () => {
      setError(null)
      setBusyId(id)
      const r = await setPhoneAccess(id, allowed)
      setBusyId(null)
      if (!r.ok) setError(r.error)
      router.refresh()
    })

  const today = bangkokToday()
  const day = (d: string) => formatMemberDate(`${d}T12:00:00+07:00`, lang, true) ?? d
  const rangeText = (type: 'monthly' | 'daily') => {
    const r = cycleOf(today, type, form.pay)
    return tr(c.payNow).replace('{r}', `${day(r.from)} – ${day(r.to)}`)
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 pb-6 pt-5">
      <h1 className="font-display text-2xl font-extrabold">{tr(c.title)}</h1>

      {/* Tabs: three equal columns on a phone (labels may wrap), pills from sm up */}
      <div className="grid grid-cols-3 gap-1 rounded-2xl bg-secondary p-1 text-xs font-semibold sm:inline-flex sm:rounded-full sm:text-sm" role="tablist">
        {SETTINGS_TABS.map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => go(k)}
            className={cn(
              'relative rounded-xl px-2 py-2 leading-tight sm:rounded-full sm:px-4',
              tab === k ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {tr(TAB_LABEL[k])}
            {dirtyBy[k] && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary" aria-label={tr(c.unsaved)} />}
          </button>
        ))}
      </div>

      {!setUp && <p className="rounded-2xl bg-amber-500/15 p-4 text-sm font-semibold text-amber-800 dark:text-amber-300">{tr(c.notSetUp)}</p>}
      {error && (
        <p role="alert" className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive">
          {error.startsWith('rules:') ? tr(shiftErrors[error.slice(6)] ?? shiftErrors.failed) : tr(settingsErrors[error] ?? settingsErrors.failed)}
        </p>
      )}

      {tab === 'team' && (
        <>
          <section className={card}>
            <h2 className="flex items-center gap-2 text-base font-bold">
              <Users className="h-4 w-4" aria-hidden="true" /> {tr(c.accessHeading)}
            </h2>
            <div className="mt-2 divide-y divide-border">
              <Toggle on={form.staffDeskOnPhone} onChange={(v) => setForm({ ...form, staffDeskOnPhone: v })} label={tr(c.deskOnPhone)} hint={tr(c.deskOnPhoneHint)} />
              <Toggle on={form.staffMembersOnTablet} onChange={(v) => setForm({ ...form, staffMembersOnTablet: v })} label={tr(c.membersOnTablet)} />
            </div>
          </section>

          <section className={card}>
            <h2 className="flex items-center gap-2 text-base font-bold">
              <Smartphone className="h-4 w-4" aria-hidden="true" /> {tr(c.phoneHeading)}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">{settings.staffDeskOnPhone ? tr(c.allOn) : tr(c.phoneHint)}</p>
            {staff.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">{tr(c.noStaff)}</p>
            ) : (
              <ul className="mt-2 divide-y divide-border">
                {staff.map((s) => {
                  const on = phoneAccess.includes(s.id)
                  return (
                    <li key={s.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                      <span className="font-medium">{s.name}</span>
                      <button
                        type="button"
                        disabled={pending || settings.staffDeskOnPhone || !setUp}
                        onClick={() => togglePhone(s.id, !on)}
                        className={cn(
                          'inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-semibold disabled:opacity-50',
                          on ? 'bg-accent text-white' : 'border border-border text-foreground',
                        )}
                      >
                        {busyId === s.id && <Spinner className="h-3.5 w-3.5" />}
                        {tr(on || settings.staffDeskOnPhone ? c.allowed : c.tabletOnly)}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          <section className={card}>
            <h2 className="flex items-center gap-2 text-base font-bold">
              <Lock className="h-4 w-4" aria-hidden="true" /> {tr(c.lockHeading)}
            </h2>
            <div className="mt-3 flex flex-wrap items-center gap-5 text-sm">
              <label className="flex items-center gap-2">
                {tr(c.staffIdle)}
                <input className={input} inputMode="numeric" value={form.staffIdleMinutes} onChange={(e) => setForm({ ...form, staffIdleMinutes: Number(e.target.value.replace(/\D/g, '')) || 0 })} />
              </label>
              <label className="flex items-center gap-2">
                {tr(c.adminIdle)}
                <input className={input} inputMode="numeric" value={form.adminIdleMinutes} onChange={(e) => setForm({ ...form, adminIdleMinutes: Number(e.target.value.replace(/\D/g, '')) || 0 })} />
              </label>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{tr(c.lockHint)}</p>
            <div className="mt-3 border-t border-border">
              <Links items={[{ href: DEVICES_PATH, text: c.elsewhereDevices }]} />
            </div>
          </section>
        </>
      )}

      {tab === 'work' && (
        <>
          <section className={card}>
            <h2 className="flex items-center gap-2 text-base font-bold">
              <Clock className="h-4 w-4" aria-hidden="true" /> {tr(timeCopy.rules)}
            </h2>
            <div className="mt-3 grid gap-4 sm:grid-cols-3">
              {(
                [
                  ['lateGraceMinutes', timeCopy.ruleGrace, timeCopy.ruleGraceHint, 120],
                  ['otMinMinutes', timeCopy.ruleOt, timeCopy.ruleOtHint, 240],
                  ['minStaffPerDay', timeCopy.ruleMinStaff, timeCopy.ruleMinStaffHint, 50],
                ] as const
              ).map(([k, label, hint, max]) => (
                <label key={k} className="flex flex-col gap-1 text-sm">
                  <span className="font-semibold">{tr(label)}</span>
                  <input
                    className={cn(input, 'w-24')}
                    inputMode="numeric"
                    value={rules[k]}
                    onChange={(e) => setRules({ ...rules, [k]: Math.min(max, Number(e.target.value.replace(/\D/g, '')) || 0) })}
                  />
                  <span className="text-xs text-muted-foreground">{tr(hint)}</span>
                </label>
              ))}
            </div>
          </section>

          <section className={card}>
            <h2 className="flex items-center gap-2 text-base font-bold">
              <CalendarOff className="h-4 w-4" aria-hidden="true" /> {tr(c.leaveHeading)}
            </h2>
            <div className="mt-3 flex flex-wrap items-center gap-5 text-sm">
              <label className="flex items-center gap-2">
                {tr(c.leaveNotice)}
                <input
                  className={input}
                  inputMode="numeric"
                  value={form.leave.noticeDays}
                  onChange={(e) => setForm({ ...form, leave: { ...form.leave, noticeDays: Number(e.target.value.replace(/\D/g, '')) || 0 } })}
                />
              </label>
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {LEAVE_KINDS.map((k) => (
                <div key={k} className="rounded-xl border border-border px-3 py-2 text-sm">
                  <label className="flex items-center gap-2 font-semibold">
                    <input
                      type="checkbox"
                      checked={form.leave.kinds[k]}
                      onChange={(e) => setForm({ ...form, leave: { ...form.leave, kinds: { ...form.leave.kinds, [k]: e.target.checked } } })}
                      className="h-4 w-4 accent-[var(--primary)]"
                    />
                    {tr(leaveCopy[k])}
                  </label>
                  <label className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                    {tr(c.leaveQuota)}
                    <input
                      className={cn(input, 'w-16')}
                      inputMode="numeric"
                      value={form.leave.quotas[k]}
                      onChange={(e) =>
                        setForm({ ...form, leave: { ...form.leave, quotas: { ...form.leave.quotas, [k]: Number(e.target.value.replace(/\D/g, '')) || 0 } } })
                      }
                    />
                  </label>
                </div>
              ))}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{tr(c.leaveHint)}</p>
          </section>

          <section className={card}>
            <h2 className="flex items-center gap-2 text-base font-bold">
              <Wallet className="h-4 w-4" aria-hidden="true" /> {tr(c.payHeading)}
            </h2>
            {!settings.paySetUp && <p className="mt-2 rounded-xl bg-amber-500/15 px-3 py-2 text-xs font-semibold text-amber-800 dark:text-amber-300">{tr(c.payNotSetUp)}</p>}
            <fieldset disabled={!settings.paySetUp} className="mt-3 space-y-4 text-sm disabled:opacity-60">
              <div>
                <label className="flex flex-wrap items-center gap-2 font-semibold">
                  {tr(c.payMonthly)}
                  <select
                    className={select}
                    value={form.pay.monthlyCutoffDay}
                    onChange={(e) => setForm({ ...form, pay: { ...form.pay, monthlyCutoffDay: Number(e.target.value) } })}
                  >
                    <option value={0}>{tr(c.payEndOfMonth)}</option>
                    {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="mt-1 text-xs text-muted-foreground">{rangeText('monthly')}</p>
              </div>

              <div>
                <p className="font-semibold">{tr(c.payDaily)}</p>
                <div className="mt-1.5 space-y-1.5">
                  {(['weekly', 'half', 'monthly'] as DailyCycle[]).map((k) => (
                    <label key={k} className="flex flex-wrap items-center gap-2">
                      <input
                        type="radio"
                        name="daily-cycle"
                        checked={form.pay.dailyCycle === k}
                        onChange={() => setForm({ ...form, pay: { ...form.pay, dailyCycle: k } })}
                        className="h-4 w-4 accent-[var(--primary)]"
                      />
                      {tr(k === 'weekly' ? c.payWeekly : k === 'half' ? c.payHalf : c.paySameAsMonthly)}
                      {k === 'weekly' && (
                        <select
                          className={cn(select, 'py-1')}
                          value={form.pay.dailyWeekEnd}
                          onChange={(e) => setForm({ ...form, pay: { ...form.pay, dailyCycle: 'weekly', dailyWeekEnd: Number(e.target.value) } })}
                        >
                          {WEEKDAYS.map((w, i) => (
                            <option key={i} value={i}>
                              {tr(w)}
                            </option>
                          ))}
                        </select>
                      )}
                    </label>
                  ))}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{rangeText('daily')}</p>
              </div>
            </fieldset>
            <p className="mt-3 text-xs text-muted-foreground">{tr(c.payHint)}</p>
          </section>

          <section className={card}>
            <h2 className="text-base font-bold">{tr(c.elsewhereHeading)}</h2>
            <div className="mt-1">
              <Links items={[{ href: TIME_PATH + '?tab=shifts', text: c.workLinks }]} />
            </div>
          </section>
        </>
      )}

      {tab === 'shop' && (
        <>
          <section className={card}>
            <h2 className="flex items-center gap-2 text-base font-bold">
              <Receipt className="h-4 w-4" aria-hidden="true" /> {tr(c.accountingHeading)}
            </h2>
            <div className="mt-1 divide-y divide-border">
              <Toggle on={form.vatRegistered} onChange={(v) => setForm({ ...form, vatRegistered: v })} label={tr(c.vatRegistered)} hint={tr(c.vatRegisteredHint)} />
            </div>
          </section>
          <section className={card}>
            <h2 className="text-base font-bold">{tr(c.elsewhereHeading)}</h2>
            <div className="mt-1">
              <Links items={[{ href: CATALOG_PATH, text: c.elsewhereCatalog }]} />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{tr(c.elsewhereLater)}</p>
          </section>
        </>
      )}

      {/* Save bar: only while something is changed */}
      {(dirty || (saved && !dirty)) && (
        <div className="sticky bottom-0 z-30 -mx-4 border-t border-border bg-background/95 px-4 py-3 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] backdrop-blur print:hidden sm:rounded-t-2xl">
          <div className="flex flex-wrap items-center gap-3">
            {dirty ? (
              <>
                <span className="mr-auto text-sm font-semibold">{tr(c.unsaved)}</span>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    setForm(settings)
                    setRules(timeRules)
                    setError(null)
                  }}
                  className="h-10 rounded-full border border-border px-4 text-sm font-semibold"
                >
                  {tr(c.discard)}
                </button>
                <button
                  type="button"
                  disabled={pending || !setUp}
                  onClick={save}
                  className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-40"
                >
                  {pending && !busyId && <Spinner className="h-4 w-4" />}
                  {tr(c.save)}
                </button>
              </>
            ) : (
              <span className="text-sm font-semibold text-accent">{tr(c.saved)}</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

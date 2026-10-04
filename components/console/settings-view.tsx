'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { CalendarOff, ChevronRight, Lock, Receipt, Smartphone, Users } from 'lucide-react'
import { LEAVE_KINDS, leaveCopy } from '@/lib/leave'
import { useLanguage } from '@/components/language-provider'
import { Spinner } from '@/components/ui/spinner'
import { settingsCopy as c, settingsErrors } from '@/lib/console/copy'
import { CATALOG_PATH, DEVICES_PATH, TIME_PATH } from '@/lib/auth/roles'
import type { AppSettings } from '@/lib/console/settings'
import { saveAccessSettings, setPhoneAccess } from '@/app/console/settings/actions'
import { cn } from '@/lib/utils'

const card = 'rounded-2xl border border-border bg-card p-5'
const input = 'w-20 rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary'

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

export function SettingsView({
  settings,
  staff,
  phoneAccess,
  setUp,
}: {
  settings: AppSettings
  staff: { id: string; name: string }[]
  phoneAccess: string[]
  setUp: boolean
}) {
  const { tr } = useLanguage()
  const router = useRouter()
  const [pending, start] = useTransition()
  const [form, setForm] = useState(settings)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const dirty = JSON.stringify(form) !== JSON.stringify(settings)

  const save = () =>
    start(async () => {
      setError(null)
      setSaved(false)
      const r = await saveAccessSettings(form)
      if (r.ok) {
        setSaved(true)
        router.refresh()
      } else setError(r.error)
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

  const elsewhere = [
    { href: TIME_PATH + '?view=shifts', text: c.elsewhereShifts },
    { href: CATALOG_PATH, text: c.elsewhereCatalog },
    { href: DEVICES_PATH, text: c.elsewhereDevices },
  ]

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-5">
      <h1 className="font-display text-2xl font-extrabold">{tr(c.title)}</h1>
      {!setUp && <p className="rounded-2xl bg-amber-500/15 p-4 text-sm font-semibold text-amber-800 dark:text-amber-300">{tr(c.notSetUp)}</p>}
      {error && (
        <p role="alert" className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive">
          {tr(settingsErrors[error] ?? settingsErrors.failed)}
        </p>
      )}

      <section className={card}>
        <h2 className="flex items-center gap-2 text-base font-bold">
          <Users className="h-4 w-4" aria-hidden="true" /> {tr(c.accessHeading)}
        </h2>
        <div className="mt-2 divide-y divide-border">
          <Toggle on={form.staffDeskOnPhone} onChange={(v) => setForm({ ...form, staffDeskOnPhone: v })} label={tr(c.deskOnPhone)} hint={tr(c.deskOnPhoneHint)} />
          <Toggle on={form.staffMembersOnTablet} onChange={(v) => setForm({ ...form, staffMembersOnTablet: v })} label={tr(c.membersOnTablet)} />
        </div>

        <h3 className="mt-5 flex items-center gap-2 text-sm font-bold">
          <Lock className="h-4 w-4" aria-hidden="true" /> {tr(c.lockHeading)}
        </h3>
        <div className="mt-2 flex flex-wrap items-center gap-5 text-sm">
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

        <h3 className="mt-5 flex items-center gap-2 text-sm font-bold">
          <CalendarOff className="h-4 w-4" aria-hidden="true" /> {tr(c.leaveHeading)}
        </h3>
        <div className="mt-2 flex flex-wrap items-center gap-5 text-sm">
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

        <h3 className="mt-5 flex items-center gap-2 text-sm font-bold">
          <Receipt className="h-4 w-4" aria-hidden="true" /> {tr(c.accountingHeading)}
        </h3>
        <div className="mt-1 divide-y divide-border">
          <Toggle on={form.vatRegistered} onChange={(v) => setForm({ ...form, vatRegistered: v })} label={tr(c.vatRegistered)} hint={tr(c.vatRegisteredHint)} />
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            disabled={pending || !dirty || !setUp}
            onClick={save}
            className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-40"
          >
            {pending && !busyId && <Spinner className="h-4 w-4" />}
            {tr(c.save)}
          </button>
          {saved && !dirty && <span className="text-sm font-semibold text-accent">{tr(c.saved)}</span>}
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
        <h2 className="text-base font-bold">{tr(c.elsewhereHeading)}</h2>
        <ul className="mt-2 divide-y divide-border">
          {elsewhere.map((e) => (
            <li key={e.href}>
              <Link href={e.href} className="flex items-center justify-between py-2.5 text-sm hover:text-primary">
                {tr(e.text)}
                <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">{tr(c.elsewhereLater)}</p>
      </section>
    </div>
  )
}

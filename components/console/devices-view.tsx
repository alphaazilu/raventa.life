'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Pencil, Plus, ScanLine, Tablet, X } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { consoleCopy, deviceErrors } from '@/lib/console/copy'
import { QrScanner } from '@/components/admin/qr-scanner'
import { Spinner } from '@/components/ui/spinner'
import { approveDevice, renameDevice, revokeDevice, type DeviceRow } from '@/app/console/devices/actions'
import { cn } from '@/lib/utils'
import { CodeInput } from '@/components/ui/code-input'

const ONLINE_MS = 10 * 60 * 1000

function formatWhen(iso: string, lang: 'th' | 'en') {
  return new Intl.DateTimeFormat(lang === 'th' ? 'th-TH' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Bangkok',
  }).format(new Date(iso))
}

// A pairing QR is a link …/console/devices?code=123456; a typed or scanned
// plain code works too.
function codeFrom(text: string): string | null {
  const m = /[?&]code=(\d{6})/.exec(text) ?? /^\s*(\d{3})\s?(\d{3})\s*$/.exec(text)
  if (!m) return null
  return m.length === 3 ? `${m[1]}${m[2]}` : m[1]
}

export function DevicesView({
  initialCode,
  devices,
  loadError,
}: {
  initialCode: string
  devices: DeviceRow[]
  loadError: string | null
}) {
  const { tr, lang } = useLanguage()
  const router = useRouter()
  const [code, setCode] = useState(initialCode)
  const [name, setName] = useState(() => tr(consoleCopy.defaultName))
  const [scan, setScan] = useState(false)
  const [error, setError] = useState<string | null>(loadError)
  const [done, setDone] = useState<string | null>(null)
  const [busy, start] = useTransition()

  const errText = (c: string) => tr(deviceErrors[c] ?? deviceErrors.failed)

  const register = (e: React.FormEvent) => {
    e.preventDefault()
    start(async () => {
      setError(null)
      setDone(null)
      const res = await approveDevice(code, name)
      if (!res.ok) return setError(res.error)
      setDone(res.data.name)
      setCode('')
      setScan(false)
      router.replace('/console/devices')
      router.refresh()
    })
  }

  const active = devices.filter((d) => !d.revokedAt)
  const revoked = devices.filter((d) => d.revokedAt)

  return (
    <div className="mx-auto grid max-w-7xl gap-5 px-4 py-6 md:px-6 md:py-8 lg:grid-cols-[420px_1fr]">
      <section className="rounded-2xl border border-border bg-card p-5 lg:self-start">
        <h1 className="flex items-center gap-2 font-display text-2xl font-extrabold text-foreground">
          <Plus className="h-5 w-5" aria-hidden="true" />
          {tr(consoleCopy.addDevice)}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{tr(consoleCopy.addDeviceIntro)}</p>

        {done && (
          <div role="status" className="mt-4 rounded-xl border border-border bg-secondary px-4 py-3 text-sm text-secondary-foreground">
            <p className="flex items-center gap-2 font-semibold">
              <Check className="h-4 w-4" aria-hidden="true" /> {tr(consoleCopy.registered)} {done}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{tr(consoleCopy.registeredHint)}</p>
          </div>
        )}

        <div className="mt-4">
          {scan ? (
            <QrScanner
              paused={busy}
              pausedText={tr(consoleCopy.register)}
              hint={null}
              autoStart
              onCode={(text) => {
                const c = codeFrom(text)
                if (c) {
                  setCode(c)
                  setScan(false)
                }
              }}
            />
          ) : (
            <button
              type="button"
              onClick={() => setScan(true)}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-full border border-border text-sm font-semibold text-foreground hover:border-primary/40"
            >
              <ScanLine className="h-4 w-4" aria-hidden="true" />
              {tr(consoleCopy.scanTabletQr)}
            </button>
          )}
        </div>

        <form onSubmit={register} className="mt-4 space-y-4">
          <label className="block">
            <span className="text-xs font-semibold tracking-wide text-muted-foreground">{tr(consoleCopy.codeLabel)}</span>
            <CodeInput value={code} onChange={setCode} label={tr(consoleCopy.codeLabel)} className="mt-1" />
          </label>
          <label className="block">
            <span className="text-xs font-semibold tracking-wide text-muted-foreground">{tr(consoleCopy.nameLabel)}</span>
            <input
              value={name}
              maxLength={60}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-4 text-sm text-foreground outline-none focus:border-primary"
            />
          </label>
          {error && (
            <p role="alert" className="text-sm font-semibold text-destructive">
              {errText(error)}
            </p>
          )}
          <button
            type="submit"
            disabled={busy || code.length !== 6 || !name.trim()}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy && <Spinner className="h-4 w-4" />}
            {tr(consoleCopy.register)}
          </button>
        </form>
      </section>

      <section>
        <h2 className="font-display text-2xl font-extrabold text-foreground">{tr(consoleCopy.devicesHeading)}</h2>
        {active.length === 0 && revoked.length === 0 ? (
          <p className="mt-6 rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
            {tr(consoleCopy.noDevices)}
          </p>
        ) : (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {active.map((d) => (
              <DeviceCard key={d.id} d={d} lang={lang} onError={setError} />
            ))}
          </div>
        )}
        {revoked.length > 0 && (
          <>
            <h3 className="mt-8 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{tr(consoleCopy.revoked)}</h3>
            <ul className="mt-2 divide-y divide-border rounded-2xl border border-border">
              {revoked.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm text-muted-foreground">
                  <span className="truncate">{d.name}</span>
                  <span className="shrink-0 text-xs">{formatWhen(d.revokedAt!, lang)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
        <p className="mt-4 text-xs text-muted-foreground">{tr(consoleCopy.revokeHint)}</p>
      </section>
    </div>
  )
}

function DeviceCard({ d, lang, onError }: { d: DeviceRow; lang: 'th' | 'en'; onError: (e: string) => void }) {
  const { tr } = useLanguage()
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(d.name)
  const [confirming, setConfirming] = useState(false)
  const [busy, start] = useTransition()

  const online = d.paired && d.lastSeenAt && Date.now() - Date.parse(d.lastSeenAt) < ONLINE_MS
  const status = !d.paired ? tr(consoleCopy.waitingKey) : online ? tr(consoleCopy.online) : tr(consoleCopy.offline)

  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) =>
    start(async () => {
      const res = await fn()
      if (!res.ok) return onError(res.error ?? 'failed')
      after?.()
      router.refresh()
    })

  return (
    <article className={cn('rounded-2xl border bg-card p-4', online ? 'border-accent/60' : 'border-border')}>
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
          <Tablet className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          {editing ? (
            <input
              value={name}
              maxLength={60}
              autoFocus
              aria-label={tr(consoleCopy.nameLabel)}
              onChange={(e) => setName(e.target.value)}
              className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary"
            />
          ) : (
            <p className="truncate text-base font-bold text-foreground">{d.name}</p>
          )}
          <p className="text-xs text-muted-foreground">
            {tr(consoleCopy.lastSeen)} {d.lastSeenAt ? formatWhen(d.lastSeenAt, lang) : tr(consoleCopy.never)} · {tr(consoleCopy.addedOn)}{' '}
            {formatWhen(d.createdAt, lang)}
          </p>
        </div>
        <span
          className={cn(
            'flex shrink-0 items-center gap-1.5 text-xs font-semibold',
            online ? 'text-accent' : 'text-muted-foreground',
          )}
        >
          <span className={cn('h-2 w-2 rounded-full', online ? 'bg-emerald-600' : 'bg-border')} />
          {status}
        </span>
      </div>

      <div className="mt-4 flex gap-2">
        {editing ? (
          <>
            <button
              type="button"
              disabled={busy || !name.trim()}
              onClick={() => act(() => renameDevice(d.id, name), () => setEditing(false))}
              className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {busy ? <Spinner className="h-4 w-4" /> : <Check className="h-4 w-4" aria-hidden="true" />}
              {tr(consoleCopy.save)}
            </button>
            <button
              type="button"
              onClick={() => {
                setName(d.name)
                setEditing(false)
              }}
              className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full border border-border text-sm font-semibold text-foreground"
            >
              <X className="h-4 w-4" aria-hidden="true" />
              {tr(consoleCopy.cancel)}
            </button>
          </>
        ) : confirming ? (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => act(() => revokeDevice(d.id))}
              className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full bg-destructive text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy && <Spinner className="h-4 w-4" />}
              {tr(consoleCopy.revokeConfirm)}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="h-10 flex-1 rounded-full border border-border text-sm font-semibold text-foreground"
            >
              {tr(consoleCopy.cancel)}
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full border border-border text-sm font-semibold text-foreground hover:border-primary/40"
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
              {tr(consoleCopy.rename)}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="h-10 flex-1 rounded-full border border-primary/40 text-sm font-semibold text-primary hover:bg-primary/5"
            >
              {tr(consoleCopy.revoke)}
            </button>
          </>
        )}
      </div>
    </article>
  )
}

'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ImageUp, Mail, MapPin, MessageCircle, Phone, RotateCcw, TriangleAlert } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { Spinner } from '@/components/ui/spinner'
import { toast } from '@/components/ui/toast'
import { brandCopy as c, brandErrors } from '@/lib/console/copy'
import { BRAND } from '@/lib/brand/config'
import { DEFAULT_BRAND, HEX_COLOR, type BrandInfo } from '@/lib/brand/info'
import { saveBrandSettings } from '@/app/console/settings/brand/actions'
import { cn } from '@/lib/utils'

// Back Office › Settings › Brand (§53, v0.39.0). See app/console/settings/brand/page.tsx.

const card = 'rounded-2xl border border-border bg-card p-5'
const label = 'text-xs font-semibold text-muted-foreground'
const field = 'mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary'
const CREAM = BRAND.colors.primaryForeground
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp']

type Form = {
  nameTh: string
  nameEn: string
  color: string
  phone: string
  line: string
  email: string
  address: string
  addressEn: string
}

const toForm = (b: BrandInfo): Form => ({
  nameTh: b.nameTh,
  nameEn: b.name,
  color: b.color,
  phone: b.phoneDisplay,
  line: b.lineHref,
  email: b.email,
  address: b.address.th,
  addressEn: b.address.en,
})

export function BrandSettingsView({ setUp, initial, updatedAt }: { setUp: boolean; initial: BrandInfo; updatedAt: string | null }) {
  const { tr, lang } = useLanguage()
  const router = useRouter()
  const [saved, setSaved] = useState<Form>(() => toForm(initial))
  const [f, setF] = useState<Form>(() => toForm(initial))
  const [logoUrl, setLogoUrl] = useState(initial.logoUrl)
  const [file, setFile] = useState<File | null>(null)
  const [resetLogo, setResetLogo] = useState(false)
  const [lastSaved, setLastSaved] = useState(updatedAt)
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null)
  const [pending, start] = useTransition()
  const fileRef = useRef<HTMLInputElement>(null)

  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setF((x) => ({ ...x, [k]: v }))
    setStatus(null)
  }

  // A picked file shows in the preview before it's uploaded.
  const filePreview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file])
  useEffect(() => () => {
    if (filePreview) URL.revokeObjectURL(filePreview)
  }, [filePreview])
  const shownLogo = filePreview ?? (resetLogo ? DEFAULT_BRAND.logoUrl : logoUrl)

  const dirty = file !== null || resetLogo || (Object.keys(f) as (keyof Form)[]).some((k) => f[k] !== saved[k])
  const colorOk = HEX_COLOR.test(f.color)
  const previewColor = colorOk ? f.color : saved.color

  const pickFile = (picked: File | undefined) => {
    if (!picked) return
    if (!IMAGE_TYPES.includes(picked.type) || picked.size > 2 * 1024 * 1024) {
      setStatus({ ok: false, text: tr(brandErrors.bad_image) })
      toast({ id: 'brand-save', kind: 'error', text: tr(brandErrors.bad_image) })
      return
    }
    setFile(picked)
    setResetLogo(false)
    setStatus(null)
  }

  const save = () =>
    start(async () => {
      setStatus(null)
      const fd = new FormData()
      for (const [k, v] of Object.entries(f)) fd.set(k, v)
      fd.set('logoUrl', logoUrl)
      if (resetLogo) fd.set('resetLogo', '1')
      if (file) fd.set('logo', file)
      const res = await saveBrandSettings(fd)
      if (!res.ok) {
        const text = tr(brandErrors[res.error] ?? brandErrors.failed)
        setStatus({ ok: false, text })
        toast({ id: 'brand-save', kind: 'error', text })
        return
      }
      setSaved({ ...f, color: f.color.toLowerCase() })
      setF((x) => ({ ...x, color: x.color.toLowerCase() }))
      setLogoUrl(res.logoUrl)
      setFile(null)
      setResetLogo(false)
      if (fileRef.current) fileRef.current.value = ''
      setLastSaved(res.updatedAt)
      setStatus({ ok: true, text: tr(c.saved) })
      toast({ id: 'brand-save', text: tr(c.saved) })
      router.refresh()
    })

  const when = lastSaved
    ? new Intl.DateTimeFormat(lang === 'th' ? 'th-TH' : 'en-GB', { timeZone: 'Asia/Bangkok', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(lastSaved))
    : null

  return (
    <div className="flex w-full flex-col gap-5 px-4 py-6 md:px-6 md:py-8 xl:px-8">
      <div>
        <h1 className="font-display text-2xl font-extrabold md:text-3xl">{tr(c.title)}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{tr(c.intro)}</p>
      </div>

      {!setUp && <p className="rounded-2xl bg-amber-500/15 p-4 text-sm font-semibold text-amber-800 dark:text-amber-300">{tr(c.notSetUp)}</p>}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        {/* Form */}
        <div className="flex min-w-0 flex-col gap-5">
          <section className={card}>
            <h2 className="text-base font-bold">{tr(c.identity)}</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className={label}>{tr(c.nameTh)}</span>
                <input value={f.nameTh} onChange={(e) => set('nameTh', e.target.value)} maxLength={80} className={field} />
              </label>
              <label className="block">
                <span className={label}>{tr(c.nameEn)}</span>
                <input value={f.nameEn} onChange={(e) => set('nameEn', e.target.value)} maxLength={80} className={field} />
                <span className="mt-1 block text-[11px] text-muted-foreground">{tr(c.nameEnHint)}</span>
              </label>
            </div>
            <div className="mt-4">
              <span className={label}>{tr(c.color)}</span>
              <div className="mt-1 flex flex-wrap items-center gap-3">
                <input
                  type="color"
                  value={colorOk ? f.color : saved.color}
                  onChange={(e) => set('color', e.target.value)}
                  aria-label={tr(c.color)}
                  className="h-11 w-14 cursor-pointer rounded-xl border border-border bg-background p-1"
                />
                <input
                  value={f.color}
                  onChange={(e) => set('color', e.target.value.trim())}
                  maxLength={7}
                  spellCheck={false}
                  className={cn(field, 'mt-0 w-32 font-mono uppercase', !colorOk && 'border-destructive')}
                />
                {f.color.toLowerCase() !== DEFAULT_BRAND.color && (
                  <button type="button" onClick={() => set('color', DEFAULT_BRAND.color)} className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground">
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                    {DEFAULT_BRAND.color}
                  </button>
                )}
              </div>
              <p className="mt-1.5 text-[11px] text-muted-foreground">{tr(c.colorHint)}</p>
            </div>
          </section>

          <section className={card}>
            <h2 className="text-base font-bold">{tr(c.logo)}</h2>
            <div className="mt-4 flex flex-wrap items-center gap-4">
              <div className="flex h-24 w-44 items-center justify-center rounded-xl border border-border bg-white p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={shownLogo} alt="" className="max-h-full max-w-full object-contain" />
              </div>
              <div className="flex flex-col items-start gap-2">
                <input ref={fileRef} type="file" accept={IMAGE_TYPES.join(',')} className="hidden" onChange={(e) => pickFile(e.target.files?.[0])} />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="inline-flex h-10 items-center gap-2 rounded-full border border-border px-4 text-sm font-semibold hover:border-primary/40"
                >
                  <ImageUp className="h-4 w-4" aria-hidden="true" />
                  {tr(c.logoPick)}
                </button>
                {(file || logoUrl !== DEFAULT_BRAND.logoUrl) && !resetLogo && (
                  <button
                    type="button"
                    onClick={() => {
                      setFile(null)
                      setResetLogo(true)
                      if (fileRef.current) fileRef.current.value = ''
                    }}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
                  >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                    {tr(c.logoReset)}
                  </button>
                )}
                {file && <span className="text-xs font-semibold text-primary">{tr(c.logoNew)} · {file.name}</span>}
              </div>
            </div>
            <p className="mt-3 text-[11px] text-muted-foreground">{tr(c.logoHint)}</p>
          </section>

          <section className={card}>
            <h2 className="text-base font-bold">{tr(c.contact)}</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className={label}>{tr(c.phone)}</span>
                <input value={f.phone} onChange={(e) => set('phone', e.target.value)} maxLength={40} inputMode="tel" className={field} />
              </label>
              <label className="block">
                <span className={label}>{tr(c.email)}</span>
                <input value={f.email} onChange={(e) => set('email', e.target.value)} maxLength={200} inputMode="email" className={field} />
              </label>
              <label className="block sm:col-span-2">
                <span className={label}>{tr(c.line)}</span>
                <input value={f.line} onChange={(e) => set('line', e.target.value)} maxLength={300} inputMode="url" placeholder="https://line.me/R/ti/p/@…" className={field} />
              </label>
              <label className="block sm:col-span-2">
                <span className={label}>{tr(c.addressTh)}</span>
                <textarea value={f.address} onChange={(e) => set('address', e.target.value)} maxLength={300} rows={2} className={cn(field, 'h-auto py-2')} />
              </label>
              <label className="block sm:col-span-2">
                <span className={label}>{tr(c.addressEn)}</span>
                <textarea value={f.addressEn} onChange={(e) => set('addressEn', e.target.value)} maxLength={300} rows={2} className={cn(field, 'h-auto py-2')} />
              </label>
            </div>
          </section>

          <p className="text-xs text-muted-foreground">{tr(c.stillCode)}</p>
        </div>

        {/* Live preview + save (stays in view on wide screens) */}
        <aside className="flex flex-col gap-4 xl:sticky xl:top-20">
          <section className={card}>
            <p className={label}>{tr(c.preview)}</p>
            <div className="mt-3 overflow-hidden rounded-xl border border-border">
              <div className="flex items-center gap-3 border-b border-border bg-white px-4 py-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={shownLogo} alt="" className="h-9 w-auto max-w-[8rem] object-contain" />
                <span className="min-w-0 truncate font-display text-sm font-extrabold" style={{ color: previewColor }}>
                  {f.nameEn || '—'}
                </span>
              </div>
              <div className="space-y-3 bg-background p-4">
                <p className="text-xs font-semibold tracking-brand uppercase" style={{ color: previewColor }}>
                  {f.nameTh || '—'}
                </p>
                <span className="inline-flex h-10 items-center rounded-full px-5 text-sm font-semibold" style={{ backgroundColor: previewColor, color: CREAM }}>
                  {tr(c.previewButton)}
                </span>
                <p className="text-sm">
                  <span className="underline underline-offset-2" style={{ color: previewColor }}>
                    {tr(c.previewLink)}
                  </span>
                </p>
                <ul className="space-y-1.5 border-t border-border pt-3 text-xs text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <Phone className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" /> {f.phone || '—'}
                  </li>
                  <li className="flex items-start gap-2">
                    <MessageCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" /> <span className="break-all">{f.line || '—'}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" /> {f.email || '—'}
                  </li>
                  <li className="flex items-start gap-2">
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" /> {(lang === 'th' ? f.address : f.addressEn) || '—'}
                  </li>
                </ul>
              </div>
            </div>
          </section>

          <section className={card}>
            <button
              type="button"
              disabled={pending || !dirty || !colorOk || !setUp}
              onClick={save}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-primary text-sm font-bold text-primary-foreground disabled:opacity-40"
            >
              {pending && <Spinner className="h-4 w-4" />}
              {tr(pending ? c.saving : c.save)}
            </button>
            {status ? (
              <p
                role={status.ok ? 'status' : 'alert'}
                className={cn('mt-3 flex items-start gap-2 text-sm font-semibold', status.ok ? 'text-accent' : 'text-destructive')}
              >
                {status.ok ? <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> : <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}
                {status.text}
              </p>
            ) : dirty ? (
              <p className="mt-3 text-xs font-semibold text-primary">{tr(c.unsaved)}</p>
            ) : null}
            {when && (
              <p className="mt-2 text-xs text-muted-foreground">
                {tr(c.lastSaved)}: {when}
              </p>
            )}
          </section>
        </aside>
      </div>
    </div>
  )
}

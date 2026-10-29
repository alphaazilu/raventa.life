'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ImageUp, Mail, MapPin, MessageCircle, Phone, RotateCcw, TriangleAlert, Wand2, X } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { Spinner } from '@/components/ui/spinner'
import { toast } from '@/components/ui/toast'
import { brandCopy as c, brandErrors } from '@/lib/console/copy'
import { BRAND } from '@/lib/brand/config'
import { bestTextOn, contrast, DEFAULT_BRAND, HEX_COLOR, isMapsUrl, mapEmbedUrl, type BrandInfo } from '@/lib/brand/info'
import { saveBrandSettings, type ImageSlot } from '@/app/console/settings/brand/actions'
import { cn } from '@/lib/utils'

// Back Office › Settings › Brand (v0.39.0; more in v0.41.0). See
// app/console/settings/brand/page.tsx.

const card = 'rounded-2xl border border-border bg-card p-5'
const label = 'text-xs font-semibold text-muted-foreground'
const hint = 'mt-1 block text-[11px] text-muted-foreground'
const field = 'mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary'
const ACCENT_TEXT = '#f3eee4' // text on the dark band (--accent-foreground)

type Saved = Record<ImageSlot | 'mapUrl' | 'seoTitle' | 'seoDescription', string>

type Form = {
  nameTh: string
  nameEn: string
  color: string
  fgColor: string
  accentColor: string
  softColor: string
  phone: string
  line: string
  email: string
  facebook: string
  instagram: string
  tiktok: string
  address: string
  addressEn: string
  city: string
  cityEn: string
  mapPin: string
  mapUrl: string
  hours: string
  hoursEn: string
  visitNote: string
  visitNoteEn: string
  tagline: string
  taglineEn: string
  seoTitle: string
  seoDescription: string
}

const toForm = (b: BrandInfo, s: Saved): Form => ({
  nameTh: b.nameTh,
  nameEn: b.name,
  color: b.color,
  fgColor: b.fgColor,
  accentColor: b.accentColor,
  softColor: b.softColor,
  phone: b.phoneDisplay,
  line: b.lineHref,
  email: b.email,
  facebook: b.socials.facebook ?? '',
  instagram: b.socials.instagram ?? '',
  tiktok: b.socials.tiktok ?? '',
  address: b.address.th,
  addressEn: b.address.en,
  city: b.city.th,
  cityEn: b.city.en,
  mapPin: `${b.map.lat}, ${b.map.lng}`,
  mapUrl: s.mapUrl,
  hours: b.hours.th,
  hoursEn: b.hours.en,
  visitNote: b.visitNote.th,
  visitNoteEn: b.visitNote.en,
  tagline: b.tagline.th,
  taglineEn: b.tagline.en,
  seoTitle: s.seoTitle,
  seoDescription: s.seoDescription,
})

/** Default picture for each slot when nothing is saved ('' = none). */
const SLOT_DEFAULT: Record<ImageSlot, string> = {
  logo: DEFAULT_BRAND.logoUrl,
  emblem: DEFAULT_BRAND.emblemUrl,
  wordmark: DEFAULT_BRAND.wordmarkUrl,
  icon: BRAND.logos.icon.src,
  og: '',
}
const SLOT_TYPES: Record<ImageSlot, string[]> = {
  logo: ['image/png', 'image/jpeg', 'image/webp'],
  emblem: ['image/png', 'image/jpeg', 'image/webp'],
  wordmark: ['image/png', 'image/jpeg', 'image/webp'],
  icon: ['image/png'],
  og: ['image/png', 'image/jpeg', 'image/webp'],
}
const SLOTS: ImageSlot[] = ['logo', 'emblem', 'wordmark', 'icon', 'og']

type Pic = { saved: string; file: File | null; reset: boolean }

function parsePin(pin: string): { lat: number; lng: number } | null {
  const m = pin.match(/^\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/)
  if (!m) return null
  const lat = Number(m[1])
  const lng = Number(m[2])
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 ? { lat, lng } : null
}

export function BrandSettingsView({
  setUp,
  v41,
  initial,
  saved: savedRaw,
  updatedAt,
}: {
  setUp: boolean
  v41: boolean
  initial: BrandInfo
  saved: Saved
  updatedAt: string | null
}) {
  const { tr, lang } = useLanguage()
  const router = useRouter()
  const [saved, setSaved] = useState<Form>(() => toForm(initial, savedRaw))
  const [f, setF] = useState<Form>(() => toForm(initial, savedRaw))
  const [pics, setPics] = useState<Record<ImageSlot, Pic>>(() =>
    Object.fromEntries(SLOTS.map((s) => [s, { saved: savedRaw[s], file: null, reset: false }])) as Record<ImageSlot, Pic>,
  )
  const [lastSaved, setLastSaved] = useState(updatedAt)
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null)
  const [pending, start] = useTransition()

  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setF((x) => ({ ...x, [k]: v }))
    setStatus(null)
  }
  const setPic = (slot: ImageSlot, p: Partial<Pic>) => {
    setPics((x) => ({ ...x, [slot]: { ...x[slot], ...p } }))
    setStatus(null)
  }

  // Picked files show in the previews before they're uploaded.
  const fileUrls = useMemo(
    () => Object.fromEntries(SLOTS.map((s) => [s, pics[s].file ? URL.createObjectURL(pics[s].file!) : null])) as Record<ImageSlot, string | null>,
    [pics],
  )
  useEffect(
    () => () => {
      for (const u of Object.values(fileUrls)) if (u) URL.revokeObjectURL(u)
    },
    [fileUrls],
  )
  const shown = (slot: ImageSlot) => fileUrls[slot] ?? (pics[slot].reset ? SLOT_DEFAULT[slot] : pics[slot].saved || SLOT_DEFAULT[slot])

  const dirty = SLOTS.some((s) => pics[s].file || pics[s].reset) || (Object.keys(f) as (keyof Form)[]).some((k) => f[k] !== saved[k])
  const colorsOk = [f.color, f.fgColor, f.accentColor, f.softColor].every((x) => HEX_COLOR.test(x))
  const pin = parsePin(f.mapPin)
  const pinOk = f.mapPin.trim() === '' || pin !== null
  const pc = (x: string, fallback: string) => (HEX_COLOR.test(x) ? x : fallback)
  const brand = pc(f.color, saved.color)
  const fg = pc(f.fgColor, saved.fgColor)
  const accent = pc(f.accentColor, saved.accentColor)
  const soft = pc(f.softColor, saved.softColor)

  const fail = (code: string) => {
    const text = tr(brandErrors[code] ?? brandErrors.failed)
    setStatus({ ok: false, text })
    toast({ id: 'brand-save', kind: 'error', text })
  }

  const pickFile = (slot: ImageSlot, file: File | undefined) => {
    if (!file) return
    if (!SLOT_TYPES[slot].includes(file.type) || file.size > 2 * 1024 * 1024) return fail(slot === 'icon' ? 'bad_icon' : 'bad_image')
    setPic(slot, { file, reset: false })
  }

  const save = () =>
    start(async () => {
      setStatus(null)
      const fd = new FormData()
      for (const [k, v] of Object.entries(f)) fd.set(k, v)
      for (const s of SLOTS) {
        fd.set(`${s}Url`, pics[s].saved)
        if (pics[s].reset) fd.set(`${s}Reset`, '1')
        if (pics[s].file) fd.set(`${s}File`, pics[s].file!)
      }
      const res = await saveBrandSettings(fd)
      if (!res.ok) return fail(res.error)
      const lower = { ...f, color: f.color.toLowerCase(), fgColor: f.fgColor.toLowerCase(), accentColor: f.accentColor.toLowerCase(), softColor: f.softColor.toLowerCase() }
      setSaved(lower)
      setF(lower)
      setPics(Object.fromEntries(SLOTS.map((s) => [s, { saved: res.images[s], file: null, reset: false }])) as Record<ImageSlot, Pic>)
      setLastSaved(res.updatedAt)
      setStatus({ ok: true, text: tr(c.saved) })
      toast({ id: 'brand-save', text: tr(c.saved) })
      router.refresh()
    })

  const when = lastSaved
    ? new Intl.DateTimeFormat(lang === 'th' ? 'th-TH' : 'en-GB', { timeZone: 'Asia/Bangkok', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(lastSaved))
    : null

  const seoTitlePh = `${f.nameEn === BRAND.name ? BRAND.fullName : `${f.nameEn} Wellness Retreat`} | Contrast Therapy · Sauna · ${f.cityEn || BRAND.city.en}`
  const text = (k: keyof Form, max: number, extra?: { ph?: string; mode?: 'tel' | 'email' | 'url' }) => (
    <input
      value={f[k]}
      onChange={(e) => set(k, e.target.value)}
      maxLength={max}
      placeholder={extra?.ph}
      inputMode={extra?.mode}
      className={field}
    />
  )

  return (
    <div className="flex w-full flex-col gap-5 px-4 py-6 md:px-6 md:py-8 xl:px-8">
      <div>
        <h1 className="font-display text-2xl font-extrabold md:text-3xl">{tr(c.title)}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{tr(c.intro)}</p>
      </div>

      {!setUp && <p className="rounded-2xl bg-amber-500/15 p-4 text-sm font-semibold text-amber-800 dark:text-amber-300">{tr(c.notSetUp)}</p>}
      {setUp && !v41 && <p className="rounded-2xl bg-amber-500/15 p-4 text-sm font-semibold text-amber-800 dark:text-amber-300">{tr(c.needSql)}</p>}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-5">
          {/* Name & colours */}
          <section className={card}>
            <h2 className="text-base font-bold">{tr(c.identity)}</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className={label}>{tr(c.nameTh)}</span>
                {text('nameTh', 80)}
              </label>
              <label className="block">
                <span className={label}>{tr(c.nameEn)}</span>
                {text('nameEn', 80)}
                <span className={hint}>{tr(c.nameEnHint)}</span>
              </label>
            </div>
            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <ColorField label={tr(c.color)} hint={tr(c.colorHint)} value={f.color} fallback={saved.color} def={DEFAULT_BRAND.color} onChange={(v) => set('color', v)} against="#ffffff" />
              <ColorField
                label={tr(c.fgColor)}
                value={f.fgColor}
                fallback={saved.fgColor}
                def={DEFAULT_BRAND.fgColor}
                onChange={(v) => set('fgColor', v)}
                against={brand}
                extra={
                  <button type="button" onClick={() => set('fgColor', bestTextOn(brand))} className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground">
                    <Wand2 className="h-3.5 w-3.5" aria-hidden="true" />
                    {tr(c.fgAuto)}
                  </button>
                }
              />
              <ColorField
                label={tr(c.accentColor)}
                hint={tr(c.accentHint)}
                value={f.accentColor}
                fallback={saved.accentColor}
                def={DEFAULT_BRAND.accentColor}
                onChange={(v) => set('accentColor', v)}
                against={ACCENT_TEXT}
              />
              <ColorField
                label={tr(c.softColor)}
                hint={tr(c.softHint)}
                value={f.softColor}
                fallback={saved.softColor}
                def={DEFAULT_BRAND.softColor}
                onChange={(v) => set('softColor', v)}
                against={brand}
              />
            </div>
          </section>

          {/* Logos & icon */}
          <section className={card}>
            <h2 className="text-base font-bold">{tr(c.logo)}</h2>
            <div className="mt-4 grid gap-5 lg:grid-cols-2">
              {(
                [
                  ['logo', c.logoFull, c.logoFullHint, 'h-20 w-40'],
                  ['emblem', c.logoEmblem, c.logoEmblemHint, 'h-20 w-20'],
                  ['wordmark', c.logoWordmark, c.logoWordmarkHint, 'h-12 w-48'],
                  ['icon', c.icon, c.iconHint, 'h-16 w-16'],
                ] as const
              ).map(([slot, name, sub, box]) => (
                <PicSlot
                  key={slot}
                  title={tr(name)}
                  sub={slot === 'icon' ? tr(sub) : `${tr(sub)} · ${tr(c.imageHint)}`}
                  src={shown(slot)}
                  boxClass={box}
                  accept={SLOT_TYPES[slot]}
                  file={pics[slot].file}
                  canReset={(pics[slot].file !== null || pics[slot].saved !== '' && pics[slot].saved !== SLOT_DEFAULT[slot]) && !pics[slot].reset}
                  disabled={!v41 && slot !== 'logo'}
                  onPick={(file) => pickFile(slot, file)}
                  onReset={() => setPic(slot, { file: null, reset: true })}
                  resetLabel={tr(c.useDefault)}
                  pickLabel={tr(c.pick)}
                  newLabel={tr(c.newFile)}
                />
              ))}
            </div>
          </section>

          {/* Contact */}
          <section className={card}>
            <h2 className="text-base font-bold">{tr(c.contact)}</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className={label}>{tr(c.phone)}</span>
                {text('phone', 40, { mode: 'tel' })}
              </label>
              <label className="block">
                <span className={label}>{tr(c.email)}</span>
                {text('email', 200, { mode: 'email' })}
              </label>
              <label className="block sm:col-span-2">
                <span className={label}>{tr(c.line)}</span>
                {text('line', 300, { ph: 'https://line.me/R/ti/p/@…', mode: 'url' })}
              </label>
            </div>
            <p className={cn(label, 'mt-5')}>{tr(c.socials)}</p>
            <div className="mt-1 grid gap-3 sm:grid-cols-3">
              {text('facebook', 300, { ph: 'https://facebook.com/…', mode: 'url' })}
              {text('instagram', 300, { ph: 'https://instagram.com/…', mode: 'url' })}
              {text('tiktok', 300, { ph: 'https://tiktok.com/@…', mode: 'url' })}
            </div>
          </section>

          {/* Location & hours */}
          <section className={card}>
            <h2 className="text-base font-bold">{tr(c.location)}</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className={label}>{tr(c.addressTh)}</span>
                <textarea value={f.address} onChange={(e) => set('address', e.target.value)} maxLength={300} rows={2} className={cn(field, 'h-auto py-2')} />
              </label>
              <label className="block sm:col-span-2">
                <span className={label}>{tr(c.addressEn)}</span>
                <textarea value={f.addressEn} onChange={(e) => set('addressEn', e.target.value)} maxLength={300} rows={2} className={cn(field, 'h-auto py-2')} />
              </label>
              <label className="block">
                <span className={label}>{tr(c.cityTh)}</span>
                {text('city', 60)}
              </label>
              <label className="block">
                <span className={label}>{tr(c.cityEn)}</span>
                {text('cityEn', 60)}
                <span className={hint}>{tr(c.cityHint)}</span>
              </label>
              <label className="block">
                <span className={label}>{tr(c.mapPin)}</span>
                <input value={f.mapPin} onChange={(e) => set('mapPin', e.target.value)} placeholder="12.6700258, 101.189248" className={cn(field, 'font-mono', !pinOk && 'border-destructive')} />
                <span className={hint}>{tr(c.mapPinHint)}</span>
              </label>
              <label className="block">
                <span className={label}>{tr(c.mapUrl)}</span>
                <input
                  value={f.mapUrl}
                  onChange={(e) => set('mapUrl', e.target.value.trim())}
                  maxLength={500}
                  inputMode="url"
                  placeholder="https://maps.app.goo.gl/…"
                  className={cn(field, f.mapUrl !== '' && !isMapsUrl(f.mapUrl) && 'border-destructive')}
                />
                <span className={hint}>{tr(c.mapUrlHint)}</span>
              </label>
              {pin && (
                <div className="overflow-hidden rounded-xl border border-border sm:col-span-2">
                  <iframe title={tr(c.mapPin)} src={mapEmbedUrl(pin.lat, pin.lng)} className="h-56 w-full" loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
                </div>
              )}
              <label className="block">
                <span className={label}>{tr(c.hoursTh)}</span>
                {text('hours', 120)}
              </label>
              <label className="block">
                <span className={label}>{tr(c.hoursEn)}</span>
                {text('hoursEn', 120)}
              </label>
              <label className="block">
                <span className={label}>{tr(c.noteTh)}</span>
                {text('visitNote', 160)}
              </label>
              <label className="block">
                <span className={label}>{tr(c.noteEn)}</span>
                {text('visitNoteEn', 160)}
              </label>
            </div>
          </section>

          {/* Tagline & SEO */}
          <section className={card}>
            <h2 className="text-base font-bold">{tr(c.seo)}</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className={label}>{tr(c.taglineTh)}</span>
                {text('tagline', 80)}
              </label>
              <label className="block">
                <span className={label}>{tr(c.taglineEn)}</span>
                {text('taglineEn', 80)}
              </label>
              <label className="block sm:col-span-2">
                <span className={label}>
                  {tr(c.seoTitle)} <span className="font-normal">· {f.seoTitle.length}/120</span>
                </span>
                {text('seoTitle', 120, { ph: seoTitlePh })}
                <span className={hint}>{tr(c.seoAuto)}</span>
              </label>
              <label className="block sm:col-span-2">
                <span className={label}>
                  {tr(c.seoDescription)} <span className="font-normal">· {f.seoDescription.length}/300</span>
                </span>
                <textarea value={f.seoDescription} onChange={(e) => set('seoDescription', e.target.value)} maxLength={300} rows={3} placeholder={tr(c.seoAuto)} className={cn(field, 'h-auto py-2')} />
              </label>
            </div>
            <div className="mt-5 grid items-start gap-5 lg:grid-cols-2">
              <PicSlot
                title={tr(c.ogImage)}
                sub={tr(c.ogImageHint)}
                src={shown('og')}
                boxClass="h-24 w-44"
                accept={SLOT_TYPES.og}
                file={pics.og.file}
                canReset={(pics.og.file !== null || pics.og.saved !== '') && !pics.og.reset}
                disabled={!v41}
                onPick={(file) => pickFile('og', file)}
                onReset={() => setPic('og', { file: null, reset: true })}
                resetLabel={tr(c.remove)}
                pickLabel={tr(c.pick)}
                newLabel={tr(c.newFile)}
              />
              <div>
                <p className={label}>{tr(c.sharePreview)}</p>
                <div className="mt-2 overflow-hidden rounded-xl border border-border bg-background">
                  {shown('og') && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={shown('og')} alt="" className="aspect-[1200/630] w-full object-cover" />
                  )}
                  <div className="space-y-0.5 p-3">
                    <p className="text-[11px] uppercase text-muted-foreground">{BRAND.domain}</p>
                    <p className="line-clamp-2 text-sm font-semibold">{f.seoTitle || seoTitlePh}</p>
                    <p className="line-clamp-2 text-xs text-muted-foreground">{f.seoDescription || tr(c.seoAuto)}</p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <p className="text-xs text-muted-foreground">{tr(c.stillCode)}</p>
        </div>

        {/* Live preview + save (stays in view on wide screens) */}
        <aside className="flex flex-col gap-4 xl:sticky xl:top-20">
          <section className={card}>
            <p className={label}>{tr(c.preview)}</p>
            <div className="mt-3 overflow-hidden rounded-xl border border-border">
              <div className="flex items-center gap-2.5 border-b border-border bg-white px-4 py-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={shown('emblem')} alt="" className="h-9 w-9 object-contain" />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={shown('wordmark')} alt="" className="h-4 w-auto max-w-[9rem] object-contain" />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={shown('icon')} alt="" title={tr(c.icon)} className="ml-auto h-5 w-5 rounded object-contain" />
              </div>
              <div className="space-y-3 bg-background p-4">
                <p className="text-xs font-semibold tracking-brand uppercase" style={{ color: brand }}>
                  {f.tagline || '—'}
                </p>
                <span className="inline-flex h-10 items-center rounded-full px-5 text-sm font-semibold" style={{ backgroundColor: brand, color: fg }}>
                  {tr(c.previewButton)}
                </span>
                <p className="text-sm">
                  <span className="underline underline-offset-2" style={{ color: brand }}>
                    {tr(c.previewLink)}
                  </span>
                </p>
                <div className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold" style={{ backgroundColor: soft, color: accent }}>
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/60" style={{ color: brand }}>
                    <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                  {tr(c.previewTile)}
                </div>
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
              <div className="flex flex-col items-center gap-2 px-4 py-4 text-center" style={{ backgroundColor: accent, color: ACCENT_TEXT }}>
                <span className="rounded-lg bg-white px-3 py-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={shown('logo')} alt="" className="h-8 w-auto object-contain" />
                </span>
                <span className="text-[10px] tracking-brand uppercase opacity-80">{(lang === 'th' ? f.tagline : f.taglineEn) || '—'}</span>
                <span className="text-[10px] opacity-60">
                  © {f.nameEn === BRAND.name ? BRAND.fullName : `${f.nameEn} Wellness Retreat`}, {f.cityEn}.
                </span>
              </div>
            </div>
          </section>

          <section className={card}>
            <button
              type="button"
              disabled={pending || !dirty || !colorsOk || !pinOk || !setUp || !v41}
              onClick={save}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-primary text-sm font-bold text-primary-foreground disabled:opacity-40"
            >
              {pending && <Spinner className="h-4 w-4" />}
              {tr(pending ? c.saving : c.save)}
            </button>
            {status ? (
              <p role={status.ok ? 'status' : 'alert'} className={cn('mt-3 flex items-start gap-2 text-sm font-semibold', status.ok ? 'text-accent' : 'text-destructive')}>
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

/** A colour: picker + hex box, a reset to the default, and how readable it is
 *  against `against` (the text or background it's paired with). */
function ColorField({
  label: name,
  hint: sub,
  value,
  fallback,
  def,
  onChange,
  against,
  extra,
}: {
  label: string
  hint?: string
  value: string
  fallback: string
  def: string
  onChange: (v: string) => void
  against?: string
  extra?: React.ReactNode
}) {
  const { tr } = useLanguage()
  const ok = HEX_COLOR.test(value)
  const ratio = ok && against && HEX_COLOR.test(against) ? contrast(value, against) : null
  return (
    <div>
      <span className={label}>{name}</span>
      <div className="mt-1 flex flex-wrap items-center gap-2.5">
        <input
          type="color"
          value={ok ? value : fallback}
          onChange={(e) => onChange(e.target.value)}
          aria-label={name}
          className="h-11 w-14 cursor-pointer rounded-xl border border-border bg-background p-1"
        />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value.trim())}
          maxLength={7}
          spellCheck={false}
          aria-label={`${name} (hex)`}
          className={cn(field, 'mt-0 w-28 font-mono uppercase', !ok && 'border-destructive')}
        />
        {value.toLowerCase() !== def && (
          <button type="button" onClick={() => onChange(def)} className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground">
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            {tr(c.resetColor)}
          </button>
        )}
        {extra}
      </div>
      {ratio !== null && (
        <span className={cn('mt-1.5 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold', ratio >= 4.5 ? 'bg-secondary text-secondary-foreground' : 'bg-amber-500/15 text-amber-800 dark:text-amber-300')}>
          {tr(ratio >= 4.5 ? c.contrast : c.contrastLow).replace('{r}', ratio.toFixed(1))}
        </span>
      )}
      {sub && <span className={hint}>{sub}</span>}
    </div>
  )
}

/** One picture: preview, choose a file, back to the default / remove. */
function PicSlot({
  title,
  sub,
  src,
  boxClass,
  accept,
  file,
  canReset,
  disabled,
  onPick,
  onReset,
  resetLabel,
  pickLabel,
  newLabel,
}: {
  title: string
  sub: string
  src: string
  boxClass: string
  accept: string[]
  file: File | null
  canReset: boolean
  disabled?: boolean
  onPick: (f: File | undefined) => void
  onReset: () => void
  resetLabel: string
  pickLabel: string
  newLabel: string
}) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <div className={cn(disabled && 'opacity-50')}>
      <p className={label}>{title}</p>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <div className={cn('flex shrink-0 items-center justify-center rounded-xl border border-border bg-white p-2', boxClass)}>
          {src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt="" className="max-h-full max-w-full object-contain" />
          ) : (
            <X className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          )}
        </div>
        <div className="flex flex-col items-start gap-1.5">
          <input
            ref={ref}
            type="file"
            accept={accept.join(',')}
            className="hidden"
            disabled={disabled}
            onChange={(e) => {
              onPick(e.target.files?.[0])
              e.target.value = ''
            }}
          />
          <button
            type="button"
            disabled={disabled}
            onClick={() => ref.current?.click()}
            className="inline-flex h-9 items-center gap-2 rounded-full border border-border px-3.5 text-sm font-semibold hover:border-primary/40 disabled:cursor-not-allowed"
          >
            <ImageUp className="h-4 w-4" aria-hidden="true" />
            {pickLabel}
          </button>
          {canReset && !disabled && (
            <button type="button" onClick={onReset} className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground">
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              {resetLabel}
            </button>
          )}
          {file && (
            <span className="max-w-[14rem] truncate text-xs font-semibold text-primary">
              {newLabel} · {file.name}
            </span>
          )}
        </div>
      </div>
      <span className={hint}>{sub}</span>
    </div>
  )
}

import { BRAND } from './config'

// The brand values the app shows at runtime (v0.39.0, more in v0.41.0):
// read from the brand_settings row (schema.sql, part 2) and filled in from
// lib/brand/config.ts wherever the row is missing or a value is
// empty/invalid. Client-safe.
//
// Multi-tenant later: the row becomes one per org; this shape stays.

type L = { th: string; en: string }

export type BrandInfo = {
  /** Short name used in copy and alt text: RAVENTA */
  name: string
  /** Thai name: ราเวนต้า */
  nameTh: string
  /** RAVENTA Wellness Retreat */
  fullName: string
  /** #rrggbb — feeds --brand */
  color: string
  /** text on brand-coloured buttons — feeds --brand-foreground */
  fgColor: string
  /** the dark band (footer, info boxes) — feeds --brand-accent */
  accentColor: string
  /** tiles and chips — feeds --brand-soft */
  softColor: string
  /** The full logo (footer, loading screen, LINE sign-in) */
  logoUrl: string
  /** The round mark and the word logo (header, Back Office, member card) */
  emblemUrl: string
  wordmarkUrl: string
  /** Favicon / home-screen icon; null = the built-in files */
  iconUrl: string | null
  phoneDisplay: string
  /** tel: form, +66… */
  phoneTel: string
  lineHref: string
  address: L
  email: string
  city: L
  map: { lat: number; lng: number; url: string; embedUrl: string }
  hours: L
  visitNote: L
  /** Only the ones that are set. */
  socials: { facebook: string | null; instagram: string | null; tiktok: string | null }
  tagline: L
  seoTitle: string
  seoDescription: string
  /** The picture shown when a link is shared; null = none */
  ogImageUrl: string | null
}

/** A row of public.brand_settings as PostgREST returns it. */
export type BrandRow = {
  brand_name: string | null
  brand_name_en: string | null
  brand_color: string | null
  logo_url: string | null
  phone: string | null
  line_url: string | null
  address: string | null
  address_en: string | null
  contact_email: string | null
  updated_at?: string | null
  // v0.41.0 — may be missing on a database that hasn't run the new SQL
  logo_emblem_url?: string | null
  logo_wordmark_url?: string | null
  icon_url?: string | null
  brand_fg_color?: string | null
  accent_color?: string | null
  soft_color?: string | null
  city?: string | null
  city_en?: string | null
  map_lat?: number | string | null
  map_lng?: number | string | null
  map_url?: string | null
  hours?: string | null
  hours_en?: string | null
  visit_note?: string | null
  visit_note_en?: string | null
  facebook_url?: string | null
  instagram_url?: string | null
  tiktok_url?: string | null
  tagline?: string | null
  tagline_en?: string | null
  seo_title?: string | null
  seo_description?: string | null
  og_image_url?: string | null
}

export const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/

export const mapEmbedUrl = (lat: number, lng: number) => `https://www.google.com/maps?q=${lat},${lng}&z=17&output=embed`
export const mapSearchUrl = (lat: number, lng: number) => `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
/** Google Maps links only (maps.app.goo.gl, goo.gl/maps, google.com/maps…). */
export const isMapsUrl = (u: string) =>
  /^https:\/\/((www\.)?google\.(com|[a-z]{2}|com?\.[a-z]{2})\/maps([/?]|$)|maps\.google\.(com|[a-z]{2}|com?\.[a-z]{2})\/|maps\.app\.goo\.gl\/|goo\.gl\/maps\/)/i.test(u)

const defaultSeoTitle = (fullName: string, city: string) => `${fullName} | Contrast Therapy · Sauna · ${city}`
const defaultSeoDescription = (fullName: string, city: string) =>
  `${fullName}, ${city} — Contrast therapy, hot pools, cold plunge, sauna, steam room and sun bath. Recover, Rebalance, Revive. Return to your best self.`

export const DEFAULT_BRAND: BrandInfo = {
  name: BRAND.name,
  nameTh: BRAND.nameTh,
  fullName: BRAND.fullName,
  color: BRAND.colors.primary,
  fgColor: BRAND.colors.primaryForeground,
  accentColor: BRAND.colors.accent,
  softColor: BRAND.colors.soft,
  logoUrl: BRAND.logos.full.src,
  emblemUrl: BRAND.logos.emblem.src,
  wordmarkUrl: BRAND.logos.wordmark.src,
  iconUrl: null,
  phoneDisplay: BRAND.contact.phoneDisplay,
  phoneTel: BRAND.contact.phoneTel,
  lineHref: BRAND.contact.lineHref,
  address: BRAND.contact.address,
  email: BRAND.contact.email,
  city: BRAND.city,
  map: { lat: BRAND.map.lat, lng: BRAND.map.lng, url: BRAND.contact.googleMapsUrl, embedUrl: BRAND.contact.googleMapsEmbedUrl },
  hours: BRAND.hours,
  visitNote: BRAND.visitNote,
  socials: { facebook: null, instagram: null, tiktok: null },
  tagline: BRAND.tagline,
  seoTitle: defaultSeoTitle(BRAND.fullName, BRAND.city.en),
  seoDescription: defaultSeoDescription(BRAND.fullName, BRAND.city.en),
  ogImageUrl: null,
}

/** 080-429-4264 → +66804294264 (Thai local numbers); +… stays as typed. */
export function telFromDisplay(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, '')
  if (digits.startsWith('+')) return digits
  if (digits.startsWith('0')) return `+66${digits.slice(1)}`
  return digits
}

const text = (v: string | null | undefined) => (v ?? '').trim()
const color = (v: string | null | undefined, fallback: string) => (HEX_COLOR.test(text(v)) ? text(v).toLowerCase() : fallback)
const image = (v: string | null | undefined, fallback: string) => {
  const u = text(v)
  return u.startsWith('/') || u.startsWith('https://') ? u : fallback
}
const https = (v: string | null | undefined) => (text(v).startsWith('https://') ? text(v) : null)
const num = (v: number | string | null | undefined, lo: number, hi: number) => {
  const n = typeof v === 'number' ? v : Number(text(v as string | null))
  return text(String(v ?? '')) !== '' && Number.isFinite(n) && n >= lo && n <= hi ? n : null
}
const pair = (th: string | null | undefined, en: string | null | undefined, fallback: L): L => ({
  th: text(th) || fallback.th,
  en: text(en) || fallback.en,
})

export function brandFromRow(row: BrandRow | null): BrandInfo {
  if (!row) return DEFAULT_BRAND
  const d = DEFAULT_BRAND
  const name = text(row.brand_name_en) || d.name
  const fullName = name === BRAND.name ? BRAND.fullName : `${name} Wellness Retreat`
  const phone = text(row.phone)
  const city = pair(row.city, row.city_en, d.city)

  // Map: a pin of its own → embed + a link to it; the shop's own Google
  // Maps link wins when one is set.
  const lat = num(row.map_lat, -90, 90)
  const lng = num(row.map_lng, -180, 180)
  const hasPin = lat !== null && lng !== null
  const pinLat = hasPin ? lat : d.map.lat
  const pinLng = hasPin ? lng : d.map.lng
  const samePin = pinLat === d.map.lat && pinLng === d.map.lng
  const ownUrl = text(row.map_url)
  const map = {
    lat: pinLat,
    lng: pinLng,
    url: isMapsUrl(ownUrl) ? ownUrl : samePin ? d.map.url : mapSearchUrl(pinLat, pinLng),
    embedUrl: samePin ? d.map.embedUrl : mapEmbedUrl(pinLat, pinLng),
  }

  return {
    name,
    nameTh: text(row.brand_name) || d.nameTh,
    fullName,
    color: color(row.brand_color, d.color),
    fgColor: color(row.brand_fg_color, d.fgColor),
    accentColor: color(row.accent_color, d.accentColor),
    softColor: color(row.soft_color, d.softColor),
    logoUrl: image(row.logo_url, d.logoUrl),
    emblemUrl: image(row.logo_emblem_url, d.emblemUrl),
    wordmarkUrl: image(row.logo_wordmark_url, d.wordmarkUrl),
    iconUrl: text(row.icon_url) ? image(row.icon_url, '') || null : null,
    phoneDisplay: phone || d.phoneDisplay,
    phoneTel: phone ? telFromDisplay(phone) : d.phoneTel,
    lineHref: https(row.line_url) ?? d.lineHref,
    address: pair(row.address, row.address_en, d.address),
    email: text(row.contact_email) || d.email,
    city,
    map,
    hours: pair(row.hours, row.hours_en, d.hours),
    visitNote: pair(row.visit_note, row.visit_note_en, d.visitNote),
    socials: { facebook: https(row.facebook_url), instagram: https(row.instagram_url), tiktok: https(row.tiktok_url) },
    tagline: pair(row.tagline, row.tagline_en, d.tagline),
    seoTitle: text(row.seo_title) || defaultSeoTitle(fullName, city.en),
    seoDescription: text(row.seo_description) || defaultSeoDescription(fullName, city.en),
    ogImageUrl: https(row.og_image_url),
  }
}

// ---- colour contrast (WCAG) — for "which text colour on this button?" ------

function luminance(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}

/** Contrast ratio 1–21 between two #rrggbb colours. */
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m)
  return (x + 0.05) / (y + 0.05)
}

/** The site's cream or its dark ink, whichever reads better on `bg`. */
export function bestTextOn(bg: string): string {
  const cream = BRAND.colors.primaryForeground
  const ink = BRAND.colors.ink
  return contrast(bg, cream) >= contrast(bg, ink) ? cream : ink
}

import { BRAND } from './config'

// The brand values the app shows at runtime (v0.39.0): read from the
// brand_settings row (schema.sql §53) and filled in from lib/brand/config.ts
// wherever the row is missing or a value is empty/invalid. Client-safe.
//
// Multi-tenant later: the row becomes one per org; this shape stays.

export type BrandInfo = {
  /** Short name used in copy and alt text: RAVENTA */
  name: string
  /** Thai name: ราเวนต้า */
  nameTh: string
  /** RAVENTA Wellness Retreat */
  fullName: string
  /** #rrggbb — feeds the --brand CSS variable */
  color: string
  /** The full logo (footer, loading screen, LINE sign-in) */
  logoUrl: string
  phoneDisplay: string
  /** tel: form, +66… */
  phoneTel: string
  lineHref: string
  address: { th: string; en: string }
  email: string
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
}

export const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/

export const DEFAULT_BRAND: BrandInfo = {
  name: BRAND.name,
  nameTh: BRAND.nameTh,
  fullName: BRAND.fullName,
  color: BRAND.colors.primary,
  logoUrl: BRAND.logos.full.src,
  phoneDisplay: BRAND.contact.phoneDisplay,
  phoneTel: BRAND.contact.phoneTel,
  lineHref: BRAND.contact.lineHref,
  address: BRAND.contact.address,
  email: BRAND.contact.email,
}

/** 080-429-4264 → +66804294264 (Thai local numbers); +… stays as typed. */
export function telFromDisplay(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, '')
  if (digits.startsWith('+')) return digits
  if (digits.startsWith('0')) return `+66${digits.slice(1)}`
  return digits
}

const text = (v: string | null | undefined) => (v ?? '').trim()

export function brandFromRow(row: BrandRow | null): BrandInfo {
  if (!row) return DEFAULT_BRAND
  const name = text(row.brand_name_en) || DEFAULT_BRAND.name
  const phone = text(row.phone)
  const logo = text(row.logo_url)
  const line = text(row.line_url)
  return {
    name,
    nameTh: text(row.brand_name) || DEFAULT_BRAND.nameTh,
    // The seed name gives exactly BRAND.fullName.
    fullName: name === BRAND.name ? BRAND.fullName : `${name} Wellness Retreat`,
    color: HEX_COLOR.test(text(row.brand_color)) ? text(row.brand_color).toLowerCase() : DEFAULT_BRAND.color,
    logoUrl: logo.startsWith('/') || logo.startsWith('https://') ? logo : DEFAULT_BRAND.logoUrl,
    phoneDisplay: phone || DEFAULT_BRAND.phoneDisplay,
    phoneTel: phone ? telFromDisplay(phone) : DEFAULT_BRAND.phoneTel,
    lineHref: line.startsWith('https://') ? line : DEFAULT_BRAND.lineHref,
    address: {
      th: text(row.address) || DEFAULT_BRAND.address.th,
      en: text(row.address_en) || DEFAULT_BRAND.address.en,
    },
    email: text(row.contact_email) || DEFAULT_BRAND.email,
  }
}

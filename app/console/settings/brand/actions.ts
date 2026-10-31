'use server'

import { revalidatePath, updateTag } from 'next/cache'
import { requireAdmin } from '@/lib/console/guard'
import { isMissingTable } from '@/lib/console/db-errors'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { BRAND_SETTINGS_PATH } from '@/lib/auth/roles'
import { BRAND_CACHE_TAG, readBrandRow } from '@/lib/brand/settings'
import { brandChanges } from '@/lib/brand/audit-diff'
import { HEX_COLOR, isMapsUrl } from '@/lib/brand/info'

// Admin: save the brand (schema.sql brand_settings, v0.39 / v0.41). The write
// goes through update_brand_settings(jsonb), which checks for an admin
// itself; pictures go to the public "brand" bucket with the admin's own
// session, so the bucket's admin-only policies apply too. Logged in
// staff_actions.

export type BrandResult = { ok: true; images: Record<ImageSlot, string>; updatedAt: string | null } | { ok: false; error: string }

const BUCKET = 'brand'
const MAX_IMAGE = 2 * 1024 * 1024
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/** Picture slots: form field → column, allowed types. '' = use the default. */
const SLOTS = {
  logo: { column: 'logo_url', types: { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' } },
  emblem: { column: 'logo_emblem_url', types: { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' } },
  wordmark: { column: 'logo_wordmark_url', types: { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' } },
  icon: { column: 'icon_url', types: { 'image/png': 'png' } },
  og: { column: 'og_image_url', types: { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' } },
} as const
export type ImageSlot = keyof typeof SLOTS

/** Text fields: form field → [column, max length]. */
const TEXT: Record<string, [string, number]> = {
  nameTh: ['brand_name', 80],
  nameEn: ['brand_name_en', 80],
  phone: ['phone', 40],
  line: ['line_url', 300],
  email: ['contact_email', 200],
  address: ['address', 300],
  addressEn: ['address_en', 300],
  city: ['city', 60],
  cityEn: ['city_en', 60],
  mapUrl: ['map_url', 500],
  hours: ['hours', 120],
  hoursEn: ['hours_en', 120],
  visitNote: ['visit_note', 160],
  visitNoteEn: ['visit_note_en', 160],
  facebook: ['facebook_url', 300],
  instagram: ['instagram_url', 300],
  tiktok: ['tiktok_url', 300],
  tagline: ['tagline', 80],
  taglineEn: ['tagline_en', 80],
  seoTitle: ['seo_title', 120],
  seoDescription: ['seo_description', 300],
}
const COLORS: Record<string, string> = { color: 'brand_color', fgColor: 'brand_fg_color', accentColor: 'accent_color', softColor: 'soft_color' }

const str = (form: FormData, key: string) => String(form.get(key) ?? '').trim()

export async function saveBrandSettings(form: FormData): Promise<BrandResult> {
  const ctx = await requireAdmin()
  if ('error' in ctx) return { ok: false, error: ctx.error }

  const p: Record<string, string> = {}
  for (const [field, [column, max]] of Object.entries(TEXT)) {
    const v = str(form, field)
    if (v.length > max) return { ok: false, error: 'bad_input' }
    p[column] = v
  }
  for (const [field, column] of Object.entries(COLORS)) {
    const v = str(form, field)
    if (!HEX_COLOR.test(v)) return { ok: false, error: 'bad_color' }
    p[column] = v
  }
  if (!p.brand_name || !p.brand_name_en) return { ok: false, error: 'bad_name' }
  if (p.line_url && !p.line_url.startsWith('https://')) return { ok: false, error: 'bad_line' }
  if (p.contact_email && !EMAIL.test(p.contact_email)) return { ok: false, error: 'bad_email' }
  for (const c of ['facebook_url', 'instagram_url', 'tiktok_url']) {
    if (p[c] && !p[c].startsWith('https://')) return { ok: false, error: 'bad_social' }
  }
  if (p.map_url && !isMapsUrl(p.map_url)) return { ok: false, error: 'bad_map_url' }

  // Map pin: "lat, lng" as copied from Google Maps, or empty for the default.
  const pin = str(form, 'mapPin')
  if (pin) {
    const m = pin.match(/^\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/)
    const lat = m ? Number(m[1]) : NaN
    const lng = m ? Number(m[2]) : NaN
    if (!(lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180)) return { ok: false, error: 'bad_map' }
    p.map_lat = String(lat)
    p.map_lng = String(lng)
  } else {
    p.map_lat = ''
    p.map_lng = ''
  }

  const supabase = await createClient()
  // The saved row as it is now, to log only what this save changes (v0.43.5).
  const before = await readBrandRow()

  // Pictures: a new upload, back to the default, or the one already saved.
  const images = {} as Record<ImageSlot, string>
  for (const [slot, def] of Object.entries(SLOTS) as [ImageSlot, (typeof SLOTS)[ImageSlot]][]) {
    let url = form.get(`${slot}Reset`) === '1' ? '' : str(form, `${slot}Url`)
    if (url && !url.startsWith('/') && !url.startsWith('https://')) url = ''
    if (slot === 'og' && url && !url.startsWith('https://')) url = ''
    const file = form.get(`${slot}File`)
    if (file instanceof File && file.size > 0) {
      const ext = (def.types as Record<string, string>)[file.type]
      if (!ext || file.size > MAX_IMAGE) return { ok: false, error: slot === 'icon' ? 'bad_icon' : 'bad_image' }
      const path = `${slot}/${Date.now()}.${ext}`
      const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false })
      if (error) return { ok: false, error: 'upload_failed' }
      url = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
    }
    p[def.column] = url
    images[slot] = url
  }

  const { data, error } = await supabase.rpc('update_brand_settings', { p })
  if (error) {
    const msg = error.message ?? ''
    if (isMissingTable(error)) return { ok: false, error: 'not_set_up' }
    if (msg.includes('not_admin')) return { ok: false, error: 'not_admin' }
    if (msg.includes('bad_color')) return { ok: false, error: 'bad_color' }
    if (error.code === '23514' || error.code === '22P02') return { ok: false, error: 'bad_input' }
    return { ok: false, error: 'failed' }
  }

  // Log only the fields that changed, old → new (nothing changed = no row).
  // If the old row couldn't be read, fall back to the name and colour.
  const changes = brandChanges(before, p)
  if (changes === null || Object.keys(changes).length > 0) {
    try {
      await createAdminClient()
        .from('staff_actions')
        .insert({ actor_id: ctx.userId, action: 'brand_updated', detail: changes ?? { name: p.brand_name_en, color: p.brand_color } })
    } catch {
      /* the log is best-effort; the save already happened */
    }
  }

  // Every page shows the brand: drop the cached row and re-render.
  updateTag(BRAND_CACHE_TAG)
  revalidatePath('/', 'layout')
  revalidatePath(BRAND_SETTINGS_PATH)
  const row = (Array.isArray(data) ? data[0] : data) as { updated_at?: string } | null
  return { ok: true, images, updatedAt: row?.updated_at ?? null }
}

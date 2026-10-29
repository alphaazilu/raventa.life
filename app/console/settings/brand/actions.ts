'use server'

import { revalidatePath, updateTag } from 'next/cache'
import { requireAdmin } from '@/lib/console/guard'
import { isMissingTable } from '@/lib/console/db-errors'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { BRAND_SETTINGS_PATH } from '@/lib/auth/roles'
import { BRAND_CACHE_TAG } from '@/lib/brand/settings'
import { DEFAULT_BRAND, HEX_COLOR } from '@/lib/brand/info'

// Admin: save the brand (schema.sql §53, v0.39.0). The write goes through
// update_brand_settings(), which checks for an admin itself; the logo goes
// to the public "brand" bucket with the admin's own session, so the bucket's
// admin-only policies apply too. Logged in staff_actions.

export type BrandResult = { ok: true; logoUrl: string; updatedAt: string | null } | { ok: false; error: string }

const BUCKET = 'brand'
const IMAGE_TYPES: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }
const MAX_LOGO = 2 * 1024 * 1024
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

const str = (form: FormData, key: string, max: number) => String(form.get(key) ?? '').trim().slice(0, max + 1)

export async function saveBrandSettings(form: FormData): Promise<BrandResult> {
  const ctx = await requireAdmin()
  if ('error' in ctx) return { ok: false, error: ctx.error }

  const nameTh = str(form, 'nameTh', 80)
  const nameEn = str(form, 'nameEn', 80)
  const color = str(form, 'color', 7)
  const phone = str(form, 'phone', 40)
  const line = str(form, 'line', 300)
  const email = str(form, 'email', 200)
  const address = str(form, 'address', 300)
  const addressEn = str(form, 'addressEn', 300)
  const keepLogo = str(form, 'logoUrl', 500)
  const resetLogo = form.get('resetLogo') === '1'

  if (!nameTh || !nameEn || nameTh.length > 80 || nameEn.length > 80) return { ok: false, error: 'bad_name' }
  if (!HEX_COLOR.test(color)) return { ok: false, error: 'bad_color' }
  if (line && !line.startsWith('https://')) return { ok: false, error: 'bad_line' }
  if (email && !EMAIL.test(email)) return { ok: false, error: 'bad_email' }
  if (phone.length > 40 || line.length > 300 || email.length > 200 || address.length > 300 || addressEn.length > 300) {
    return { ok: false, error: 'bad_input' }
  }

  const supabase = await createClient()

  // The logo: a new upload, back to the default, or the one already saved.
  let logoUrl = resetLogo ? DEFAULT_BRAND.logoUrl : keepLogo || DEFAULT_BRAND.logoUrl
  if (!logoUrl.startsWith('/') && !logoUrl.startsWith('https://')) logoUrl = DEFAULT_BRAND.logoUrl
  const file = form.get('logo')
  if (file instanceof File && file.size > 0) {
    const ext = IMAGE_TYPES[file.type]
    if (!ext || file.size > MAX_LOGO) return { ok: false, error: 'bad_image' }
    const path = `logo/${Date.now()}.${ext}`
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false })
    if (error) return { ok: false, error: 'upload_failed' }
    logoUrl = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
  }

  const { data, error } = await supabase.rpc('update_brand_settings', {
    p_brand_name: nameTh,
    p_brand_name_en: nameEn,
    p_brand_color: color,
    p_logo_url: logoUrl,
    p_phone: phone,
    p_line_url: line,
    p_address: address,
    p_address_en: addressEn,
    p_contact_email: email,
  })
  if (error) {
    const msg = error.message ?? ''
    if (isMissingTable(error)) return { ok: false, error: 'not_set_up' }
    if (msg.includes('not_admin')) return { ok: false, error: 'not_admin' }
    if (msg.includes('bad_color')) return { ok: false, error: 'bad_color' }
    if (error.code === '23514') return { ok: false, error: 'bad_input' }
    return { ok: false, error: 'failed' }
  }

  try {
    await createAdminClient()
      .from('staff_actions')
      .insert({ actor_id: ctx.userId, action: 'brand_updated', detail: { name: nameEn, color, logo: logoUrl } })
  } catch {
    /* the log is best-effort; the save already happened */
  }

  // Every page shows the brand: drop the cached row and re-render.
  updateTag(BRAND_CACHE_TAG)
  revalidatePath('/', 'layout')
  revalidatePath(BRAND_SETTINGS_PATH)
  const row = (Array.isArray(data) ? data[0] : data) as { updated_at?: string } | null
  return { ok: true, logoUrl, updatedAt: row?.updated_at ?? null }
}

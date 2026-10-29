import { unstable_cache } from 'next/cache'
import { createClient } from '@supabase/supabase-js'
import { brandFromRow, DEFAULT_BRAND, type BrandInfo, type BrandRow } from './info'

// Reading the brand (schema.sql §53, v0.39.0). SERVER ONLY.
//
// Uses the public anon key with no cookies, so it works on statically
// rendered pages and is cached across requests; saving in Back Office ›
// Settings › Brand clears the cache by tag. Any failure (env not set, DB
// down, §53 not run yet) falls back to lib/brand/config.ts — the site never
// breaks over its own branding.

export const BRAND_CACHE_TAG = 'brand-settings'

const COLS = 'brand_name, brand_name_en, brand_color, logo_url, phone, line_url, address, address_en, contact_email, updated_at'

/** The raw row, or null when it can't be read. Not cached (the settings page). */
export async function readBrandRow(): Promise<BrandRow | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  try {
    const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data, error } = await db.from('brand_settings').select(COLS).eq('id', 1).maybeSingle()
    if (error || !data) return null
    return data as BrandRow
  } catch {
    return null
  }
}

const cachedRow = unstable_cache(readBrandRow, ['brand-settings-v1'], { tags: [BRAND_CACHE_TAG], revalidate: 3600 })

export async function getBrandInfo(): Promise<BrandInfo> {
  try {
    return brandFromRow(await cachedRow())
  } catch {
    return DEFAULT_BRAND
  }
}

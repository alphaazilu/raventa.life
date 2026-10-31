import type { BrandRow } from './info'

// What a brand save actually changed, for the audit log (v0.43.5): only the
// columns whose value differs, as "old → new" ("—" = empty, i.e. the
// default). Pictures show their file (the part after the bucket), not the
// whole URL; the map pin is one "lat, lng" entry. Client-safe, no I/O.

const MAX = 120
const IMAGE_COLUMNS = new Set(['logo_url', 'logo_emblem_url', 'logo_wordmark_url', 'icon_url', 'og_image_url'])
const COLOR_COLUMNS = new Set(['brand_color', 'brand_fg_color', 'accent_color', 'soft_color'])

const short = (v: string) => (v.length > MAX ? `${v.slice(0, MAX - 1)}…` : v)
const picture = (v: string) => {
  const i = v.indexOf('/brand/')
  return i >= 0 ? v.slice(i + '/brand/'.length) : v
}

function norm(column: string, v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v).trim()
  if (COLOR_COLUMNS.has(column)) return s.toLowerCase()
  return s
}

function pin(lat: unknown, lng: unknown): string {
  const a = norm('', lat)
  const b = norm('', lng)
  return a && b ? `${Number(a)}, ${Number(b)}` : ''
}

/**
 * `after` is what was sent to update_brand_settings (column → value, '' =
 * default). Returns {} when nothing changed, null when the old row couldn't
 * be read (the caller then logs less).
 */
export function brandChanges(before: BrandRow | null, after: Record<string, string>): Record<string, string> | null {
  if (!before) return null
  const old = before as unknown as Record<string, unknown>
  const out: Record<string, string> = {}
  const show = (column: string, v: string) => (v ? short(IMAGE_COLUMNS.has(column) ? picture(v) : v) : '—')

  for (const [column, value] of Object.entries(after)) {
    if (column === 'map_lat' || column === 'map_lng') continue
    // A v0.41 column the database doesn't have yet: nothing to compare with.
    if (!(column in old)) continue
    const from = norm(column, old[column])
    const to = norm(column, value)
    if (from !== to) out[column] = `${show(column, from)} → ${show(column, to)}`
  }

  if ('map_lat' in old) {
    const from = pin(old.map_lat, old.map_lng)
    const to = pin(after.map_lat, after.map_lng)
    if (from !== to) out.map_pin = `${from || '—'} → ${to || '—'}`
  }
  return out
}

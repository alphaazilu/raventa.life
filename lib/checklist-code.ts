// Server-only: signs with a secret. Never import from a client component.
import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

// The code on a check point's QR sticker (§29, v0.29):
//
//   CP1.<point id, 22 chars>.<version, base 36>.<signature>
//
// printed as a link (SITE_URL/cp/<code>) so the phone's own camera opens the
// right page too. Signed so nobody can make one up; the version lets an
// admin reprint a sticker and retire the old one (e.g. a photo of it).

const PREFIX = 'CP1'

function secretKey(): Buffer {
  const own = process.env.MEMBER_QR_SECRET
  const base = own ?? process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!base) throw new Error('No MEMBER_QR_SECRET or SUPABASE_SERVICE_ROLE_KEY to sign check-point codes')
  return createHash('sha256').update('raventa-checkpoint-v1:').update(base).digest()
}

const sign = (body: string) => createHmac('sha256', secretKey()).update(body).digest().subarray(0, 12).toString('base64url')
const toShort = (uuid: string) => Buffer.from(uuid.replace(/-/g, ''), 'hex').toString('base64url')
function toUuid(short: string): string | null {
  const hex = Buffer.from(short, 'base64url').toString('hex')
  if (hex.length !== 32) return null
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function pointCode(pointId: string, version: number): string {
  const body = `${PREFIX}.${toShort(pointId)}.${version.toString(36)}`
  return `${body}.${sign(body)}`
}

export function pointUrl(pointId: string, version: number): string {
  const site = (process.env.SITE_URL ?? 'https://www.raventawellness.com').replace(/\/$/, '')
  return `${site}/cp/${pointCode(pointId, version)}`
}

// A scanned text (the link, or the bare code) → point id and version.
export function readPointCode(raw: string): { ok: true; pointId: string; version: number } | { ok: false } {
  const text = raw.trim()
  const code = decodeURIComponent(text.includes('/cp/') ? text.slice(text.lastIndexOf('/cp/') + 4).split(/[?#]/)[0] : text)
  const parts = code.split('.')
  if (parts.length !== 4 || parts[0] !== PREFIX) return { ok: false }
  const body = parts.slice(0, 3).join('.')
  const expected = Buffer.from(sign(body))
  const given = Buffer.from(parts[3])
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false }
  const pointId = toUuid(parts[1])
  const version = parseInt(parts[2], 36)
  if (!pointId || !Number.isInteger(version)) return { ok: false }
  return { ok: true, pointId, version }
}

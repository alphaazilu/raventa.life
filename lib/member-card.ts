// Server-only: signs with a secret. Never import from a client component.
import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

// The code inside a member's check-in QR. It says "this member, until this
// moment", signed by the server, so a screenshot stops working within
// seconds and nobody can make a QR for someone else's account.
//
//   RV1.<member id, 22 chars>.<expiry, unix seconds in base 36>.<signature>
//
// Kept deliberately short: fewer characters = a less dense QR, which a
// tablet camera reads faster at arm's length.

const PREFIX = 'RV1'
// How long one code stays valid. The card asks for a new one every
// REFRESH_SECONDS, so a code is always shown with plenty of life left and a
// slow scan still lands.
export const TOKEN_TTL_SECONDS = 90
export const REFRESH_SECONDS = 60

function secretKey(): Buffer {
  // A dedicated secret if one is set; otherwise one derived from the
  // service-role key (already on the server) with its own label, so the
  // two are never interchangeable.
  const own = process.env.MEMBER_QR_SECRET
  if (own) return Buffer.from(own, 'utf8')
  const base = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!base) throw new Error('No MEMBER_QR_SECRET or SUPABASE_SERVICE_ROLE_KEY to sign member QR codes')
  return createHash('sha256').update('raventa-member-qr-v1:').update(base).digest()
}

function sign(body: string): string {
  return createHmac('sha256', secretKey()).update(body).digest().subarray(0, 16).toString('base64url')
}

function uuidToShort(uuid: string): string {
  return Buffer.from(uuid.replace(/-/g, ''), 'hex').toString('base64url')
}

function shortToUuid(short: string): string | null {
  const hex = Buffer.from(short, 'base64url').toString('hex')
  if (hex.length !== 32) return null
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function createMemberQrToken(userId: string, nowMs = Date.now()): { token: string; expiresAt: number } {
  const expiresAt = Math.floor(nowMs / 1000) + TOKEN_TTL_SECONDS
  const body = `${PREFIX}.${uuidToShort(userId)}.${expiresAt.toString(36)}`
  return { token: `${body}.${sign(body)}`, expiresAt }
}

export type MemberQrCheck =
  | { ok: true; userId: string }
  | { ok: false; reason: 'malformed' | 'bad_signature' | 'expired' }

// For the check-in screen (next step): turns a scanned code back into a
// member id, or says why it can't be trusted.
export function verifyMemberQrToken(token: string, nowMs = Date.now()): MemberQrCheck {
  const parts = token.trim().split('.')
  if (parts.length !== 4 || parts[0] !== PREFIX) return { ok: false, reason: 'malformed' }
  const [, short, exp36, sig] = parts
  const body = `${PREFIX}.${short}.${exp36}`
  const expected = Buffer.from(sign(body))
  const given = Buffer.from(sig)
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return { ok: false, reason: 'bad_signature' }
  }
  const expiresAt = parseInt(exp36, 36)
  if (!Number.isFinite(expiresAt) || expiresAt * 1000 < nowMs) return { ok: false, reason: 'expired' }
  const userId = shortToUuid(short)
  if (!userId) return { ok: false, reason: 'malformed' }
  return { ok: true, userId }
}

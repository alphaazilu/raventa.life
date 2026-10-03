// Server-only (service role). Share links for packages (§23).
import { createHash, randomBytes } from 'node:crypto'

export const SHARE_QR_MINUTES = 30
export const SHARE_EMAIL_DAYS = 7

export function newShareToken(): { token: string; hash: string } {
  const token = randomBytes(24).toString('base64url')
  return { token, hash: hashShareToken(token) }
}

export function hashShareToken(token: string): string {
  return createHash('sha256').update(`pkg-share:${token}`).digest('hex')
}

export function shareUrl(token: string): string {
  const site = process.env.SITE_URL ?? 'http://localhost:3000'
  return `${site}/share/${token}`
}

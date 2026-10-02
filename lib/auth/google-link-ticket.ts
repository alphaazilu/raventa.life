// Server-only: signs with a secret. Never import from a client component.
import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'

// "Someone just signed in with Google for this existing account, and we
// refused to join them" (app/auth/callback). Remembered for 15 minutes in a
// signed, httpOnly cookie holding only the account id, so the login page can
// offer: prove you own the email (6-digit code) → sign in → link Google.
// The browser never sees the email or anything it could change.

const COOKIE = 'rv_glink'
const TTL_SECONDS = 15 * 60

function key(): Buffer {
  const base = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  return createHash('sha256').update('raventa-google-link-v1:').update(base).digest()
}

function sign(body: string): string {
  return createHmac('sha256', key()).update(body).digest('base64url')
}

export function makeGoogleLinkTicket(userId: string): { name: string; value: string; maxAge: number } {
  const body = `${userId}.${Math.floor(Date.now() / 1000) + TTL_SECONDS}`
  return { name: COOKIE, value: `${body}.${sign(body)}`, maxAge: TTL_SECONDS }
}

// The account id, if the cookie is there, untouched and not expired.
async function readGoogleLinkTicket(): Promise<string | null> {
  const raw = (await cookies()).get(COOKIE)?.value
  if (!raw) return null
  const parts = raw.split('.')
  if (parts.length !== 3) return null
  const [userId, exp, sig] = parts
  const expected = Buffer.from(sign(`${userId}.${exp}`))
  const given = Buffer.from(sig)
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null
  if (Number(exp) * 1000 < Date.now()) return null
  return userId
}

export async function clearGoogleLinkTicket(): Promise<void> {
  ;(await cookies()).delete(COOKIE)
}

// The refused account and its login email (lower-case), from the cookie.
export async function googleLinkAccount(): Promise<{ userId: string; email: string } | null> {
  const userId = await readGoogleLinkTicket()
  if (!userId) return null
  const { data } = await createAdminClient().auth.admin.getUserById(userId)
  const email = data?.user?.email
  return email ? { userId, email: email.trim().toLowerCase() } : null
}

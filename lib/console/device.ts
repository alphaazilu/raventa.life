import { createHash, randomBytes, randomInt } from 'node:crypto'
import { cache } from 'react'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { DEVICE_COOKIE, PAIR_COOKIE } from './device-cookie'

export { DEVICE_COOKIE, PAIR_COOKIE }

// Counter-tablet registration (supabase/schema.sql §15, Vault R2).
//
// A tablet waiting to be paired holds PAIR_COOKIE (a random secret); once an
// admin approves its 6-digit code, the tablet swaps that for DEVICE_COOKIE,
// its own long-lived key. The database only ever sees SHA-256 hashes of
// either. SERVER ONLY — uses the service-role client.

export const PAIR_TTL_MS = 10 * 60 * 1000
const DEVICE_TTL_S = 365 * 24 * 60 * 60
// Only touch last_seen_at this often (every request would be wasteful).
const SEEN_EVERY_MS = 5 * 60 * 1000
// A sanity cap on unclaimed codes, since /tablet is open to anyone.
const MAX_OPEN_CODES = 30

export type Device = { id: string; name: string; createdAt: string; lastSeenAt: string | null }

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')
const secret = () => randomBytes(32).toString('base64url')

const cookieBase = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
}

// The registered device behind this request, or null (no cookie, unknown
// or revoked key).
export const getCurrentDevice = cache(async (): Promise<Device | null> => {
  const token = (await cookies()).get(DEVICE_COOKIE)?.value
  if (!token) return null
  const admin = createAdminClient()
  const { data } = await admin
    .from('devices')
    .select('id, name, created_at, last_seen_at')
    .eq('token_hash', sha256(token))
    .is('revoked_at', null)
    .maybeSingle()
  if (!data) return null
  const seen = data.last_seen_at ? Date.parse(data.last_seen_at) : 0
  if (Date.now() - seen > SEEN_EVERY_MS) {
    await admin.from('devices').update({ last_seen_at: new Date().toISOString() }).eq('id', data.id)
  }
  return { id: data.id, name: data.name, createdAt: data.created_at, lastSeenAt: data.last_seen_at }
})

export type PairStart =
  | { ok: true; code: string; expiresAt: string }
  | { ok: false; error: 'busy' | 'not_set_up' | 'failed' }

// Called by the waiting tablet (route handler — it sets cookies). Reuses the
// tablet's current code while it's still valid, so reloading the page
// doesn't mint a new one each time.
export async function startPairing(): Promise<PairStart> {
  const jar = await cookies()
  const admin = createAdminClient()
  // A stale or revoked key from before is dropped: this tablet pairs afresh.
  jar.delete(DEVICE_COOKIE)

  const existing = jar.get(PAIR_COOKIE)?.value
  if (existing) {
    const { data } = await admin
      .from('device_pairing_codes')
      .select('code, expires_at, claimed_at')
      .eq('poll_hash', sha256(existing))
      .maybeSingle()
    if (data && !data.claimed_at && Date.parse(data.expires_at) > Date.now() + 60_000) {
      return { ok: true, code: data.code, expiresAt: data.expires_at }
    }
  }

  const nowIso = new Date().toISOString()
  const { count, error: countErr } = await admin
    .from('device_pairing_codes')
    .select('id', { count: 'exact', head: true })
    .is('claimed_at', null)
    .gt('expires_at', nowIso)
  if (countErr) return { ok: false, error: missing(countErr) ? 'not_set_up' : 'failed' }
  if ((count ?? 0) >= MAX_OPEN_CODES) return { ok: false, error: 'busy' }

  // Old rows are only clutter; keep a day for troubleshooting.
  await admin
    .from('device_pairing_codes')
    .delete()
    .lt('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())

  const pollSecret = secret()
  const expiresAt = new Date(Date.now() + PAIR_TTL_MS).toISOString()
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
    // Codes must be unique among the ones still open.
    const { count: clash } = await admin
      .from('device_pairing_codes')
      .select('id', { count: 'exact', head: true })
      .eq('code', code)
      .is('claimed_at', null)
      .gt('expires_at', nowIso)
    if (clash) continue
    const { error } = await admin
      .from('device_pairing_codes')
      .insert({ code, poll_hash: sha256(pollSecret), expires_at: expiresAt })
    if (error) return { ok: false, error: missing(error) ? 'not_set_up' : 'failed' }
    jar.set(PAIR_COOKIE, pollSecret, { ...cookieBase, maxAge: PAIR_TTL_MS / 1000 })
    return { ok: true, code, expiresAt }
  }
  return { ok: false, error: 'failed' }
}

export type PairStatus = 'waiting' | 'paired' | 'expired' | 'none'

// Polled by the waiting tablet. The first poll after an admin approves the
// code mints the device key, stores its hash and hands the key over as a
// cookie — exactly once. Any personal login left on the tablet is signed out.
export async function pollPairing(): Promise<PairStatus> {
  const jar = await cookies()
  const pollSecret = jar.get(PAIR_COOKIE)?.value
  if (!pollSecret) return 'none'
  const admin = createAdminClient()
  const { data: row } = await admin
    .from('device_pairing_codes')
    .select('id, expires_at, claimed_at, device_id, delivered_at')
    .eq('poll_hash', sha256(pollSecret))
    .maybeSingle()
  if (!row) return 'none'
  if (!row.claimed_at || !row.device_id) {
    return Date.parse(row.expires_at) > Date.now() ? 'waiting' : 'expired'
  }
  if (row.delivered_at) return 'none'

  // Claim the hand-over first so two racing polls can't both get a key.
  const { data: won } = await admin
    .from('device_pairing_codes')
    .update({ delivered_at: new Date().toISOString() })
    .eq('id', row.id)
    .is('delivered_at', null)
    .select('id')
    .maybeSingle()
  if (!won) return 'none'

  const token = secret()
  const { error } = await admin
    .from('devices')
    .update({ token_hash: sha256(token), last_seen_at: new Date().toISOString() })
    .eq('id', row.device_id)
    .is('revoked_at', null)
  if (error) return 'none'

  jar.set(DEVICE_COOKIE, token, { ...cookieBase, maxAge: DEVICE_TTL_S })
  jar.delete(PAIR_COOKIE)
  // A shared tablet shouldn't stay signed in to anyone's own account.
  for (const c of jar.getAll()) {
    if (c.name.startsWith('sb-')) jar.delete(c.name)
  }
  return 'paired'
}

function missing(error: { code?: string } | null): boolean {
  return Boolean(error?.code && ['PGRST202', 'PGRST205', '42883', '42P01'].includes(error.code))
}

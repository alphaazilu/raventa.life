import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { isMissingTable } from '@/lib/console/db-errors'
import { PDPA_VERSION, WAIVER_VERSION } from '@/lib/legal/content'

// Consent records (schema.sql §54, v0.42.0). SERVER ONLY.
//
// Append-only: every choice is a new row; the current state is the latest
// row per (user, kind). A database that hasn't run §54 yet reads as "unknown"
// (null) everywhere, so nothing is gated or blocked until it has.

export type ConsentKind = 'pdpa' | 'marketing' | 'waiver'
export type ConsentEntry = { kind: ConsentKind; version: string | null; granted: boolean; source: string }
export type Consent = { version: string | null; granted: boolean; at: string; source: string }

/** Latest row of each kind for one member; null = table not set up / unreadable. */
export async function latestConsents(supabase: SupabaseClient, userId: string): Promise<Partial<Record<ConsentKind, Consent>> | null> {
  const { data, error } = await supabase
    .from('consent_records')
    .select('kind, version, granted, source, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) {
    if (!isMissingTable(error)) console.error('consent read failed', error.message)
    return null
  }
  const out: Partial<Record<ConsentKind, Consent>> = {}
  for (const r of data ?? []) {
    const k = r.kind as ConsentKind
    if (!out[k]) out[k] = { version: r.version, granted: r.granted, at: r.created_at, source: r.source }
  }
  return out
}

/** Does this member need to agree to the current privacy policy + terms? */
export function needsPdpa(c: Partial<Record<ConsentKind, Consent>> | null): boolean {
  if (!c) return false // not set up yet: never lock anyone out
  const p = c.pdpa
  return !p || !p.granted || (p.version ?? '') < PDPA_VERSION
}

export type WaiverStatus = { ok: boolean; at: string | null; source: string | null }

/** Has this member's health waiver been confirmed for the current version? null = not set up. */
export function waiverStatus(c: Partial<Record<ConsentKind, Consent>> | null): WaiverStatus | null {
  if (!c) return null
  const w = c.waiver
  return { ok: Boolean(w && w.granted && (w.version ?? '') >= WAIVER_VERSION), at: w?.at ?? null, source: w?.source ?? null }
}

/** The same for a list of members in one request (the member list, v0.43.1). null = not set up. */
export async function waiverStatusMany(supabase: SupabaseClient, ids: string[]): Promise<Record<string, WaiverStatus> | null> {
  if (ids.length === 0) return {}
  const { data, error } = await supabase
    .from('consent_records')
    .select('user_id, version, granted, source, created_at')
    .eq('kind', 'waiver')
    .in('user_id', ids)
    .order('created_at', { ascending: false })
    .limit(1000)
  if (error) {
    if (!isMissingTable(error)) console.error('waiver read failed', error.message)
    return null
  }
  const out: Record<string, WaiverStatus> = {}
  for (const id of ids) out[id] = { ok: false, at: null, source: null }
  const seen = new Set<string>()
  for (const r of data ?? []) {
    const id = r.user_id as string
    if (seen.has(id)) continue // newest first: the first row is the current one
    seen.add(id)
    out[id] = { ok: Boolean(r.granted && (r.version ?? '') >= WAIVER_VERSION), at: r.created_at, source: r.source }
  }
  return out
}

/**
 * What a sign-up form records: the policies (required). Marketing isn't asked
 * in the app (v0.42.2) — it goes out as LINE OA broadcasts, whose opt-in LINE
 * itself handles. The 'marketing' kind stays in the table for a later email/SMS
 * opt-in, and its old rows are kept as history.
 */
export const signupConsents = (source = 'signup'): ConsentEntry[] => [{ kind: 'pdpa', version: PDPA_VERSION, granted: true, source }]

/** Written with the member's own session (RLS: their own pdpa/marketing rows). */
export async function recordConsents(supabase: SupabaseClient, userId: string, entries: ConsentEntry[]): Promise<boolean> {
  if (entries.length === 0) return true
  const { error } = await supabase.from('consent_records').insert(entries.map((e) => ({ user_id: userId, ...e })))
  if (error) {
    if (!isMissingTable(error)) console.error('consent save failed', error.message)
    return false
  }
  return true
}

/**
 * Email sign-up: there's no session until the address is confirmed, so the
 * server writes the consent the person just ticked (service role). Never
 * blocks the sign-up itself.
 */
export async function recordSignupConsents(userId: string, entries: ConsentEntry[]): Promise<void> {
  try {
    await recordConsents(createAdminClient(), userId, entries)
  } catch (err) {
    console.error('signup consent save failed', (err as Error).message)
  }
}

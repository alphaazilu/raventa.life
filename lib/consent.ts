import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { isMissingTable } from '@/lib/console/db-errors'
import { MARKETING_VERSION, PDPA_VERSION } from '@/lib/legal/content'

// Consent records (schema.sql §54, v0.42.0). SERVER ONLY.
//
// Append-only: every choice is a new row; the current state is the latest
// row per (user, kind). A database that hasn't run §54 yet reads as "unknown"
// (null) everywhere, so nothing is gated or blocked until it has.

export type ConsentKind = 'pdpa' | 'marketing' | 'waiver'
export type ConsentEntry = { kind: ConsentKind; version: string | null; granted: boolean; source: string }
export type Consent = { version: string | null; granted: boolean; at: string }

/** Latest row of each kind for one member; null = table not set up / unreadable. */
export async function latestConsents(supabase: SupabaseClient, userId: string): Promise<Partial<Record<ConsentKind, Consent>> | null> {
  const { data, error } = await supabase
    .from('consent_records')
    .select('kind, version, granted, created_at')
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
    if (!out[k]) out[k] = { version: r.version, granted: r.granted, at: r.created_at }
  }
  return out
}

/** Does this member need to agree to the current privacy policy + terms? */
export function needsPdpa(c: Partial<Record<ConsentKind, Consent>> | null): boolean {
  if (!c) return false // not set up yet: never lock anyone out
  const p = c.pdpa
  return !p || !p.granted || (p.version ?? '') < PDPA_VERSION
}

/** What a sign-up form records: the policies (required) + marketing (optional, yes or no). */
export const signupConsents = (marketing: boolean, source = 'signup'): ConsentEntry[] => [
  { kind: 'pdpa', version: PDPA_VERSION, granted: true, source },
  { kind: 'marketing', version: MARKETING_VERSION, granted: marketing, source },
]

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

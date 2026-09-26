import type { User } from '@supabase/supabase-js'
import type { createClient } from './server'

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

// The LINE user ID ("U…") of the account's linked LINE identity, if any.
// For the 'custom:line' provider this is the OIDC `sub` claim, which is
// also what Supabase stores as that identity's provider_id.
export function lineUserIdOf(user: User): string | null {
  const identity = user.identities?.find((i) => i.provider === 'custom:line')
  if (!identity) return null
  const sub = identity.identity_data?.sub
  return typeof sub === 'string' && sub ? sub : identity.id || null
}

// Copies the LINE user ID onto the member's profile (see line_user_id in
// supabase/schema.sql). Deliberately best-effort and separate from any
// other write: it must never be the reason a login or a profile save
// fails, so problems are only logged.
export async function saveLineUserId(supabase: SupabaseClient, user: User): Promise<void> {
  const lineUserId = lineUserIdOf(user)
  if (!lineUserId) return
  const { error } = await supabase
    .from('profiles')
    .update({ line_user_id: lineUserId })
    .eq('id', user.id)
    .is('line_user_id', null)
  if (error) console.error('saveLineUserId: could not store LINE user ID', error.message)
}

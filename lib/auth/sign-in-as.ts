// Server-only (service-role key). Never import from a client component.
import { createAdminClient } from '@/lib/supabase/admin'
import type { createClient } from '@/lib/supabase/server'

type ServerClient = Awaited<ReturnType<typeof createClient>>

// Opens a session for the account with this login email in THIS browser:
// a magic-link token generated and redeemed server-side (no email is sent),
// which sets the session cookies. Only call it after the person has proved
// who they are some other way (card QR, emailed code). Throws on failure.
export async function signInAs(supabase: ServerClient, email: string): Promise<void> {
  const { data: link, error: linkError } = await createAdminClient().auth.admin.generateLink({ type: 'magiclink', email })
  if (linkError || !link?.properties?.hashed_token) throw linkError ?? new Error('no token')
  const { error } = await supabase.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'magiclink' })
  if (error) throw error
}

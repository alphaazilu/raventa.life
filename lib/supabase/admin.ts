import { createClient } from '@supabase/supabase-js'

// Full-access Supabase client (service-role / secret key). SERVER ONLY:
// import it only from 'use server' files or route handlers, never from a
// component, and never rename the env var to NEXT_PUBLIC_… — that would
// ship the key to every visitor's browser.
//
// Used solely for joining a LINE sign-in onto an existing membership
// (app/complete-profile/merge-actions.ts), which has to look accounts up by
// email and delete the empty LINE account — things a member's own session
// is rightly not allowed to do.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

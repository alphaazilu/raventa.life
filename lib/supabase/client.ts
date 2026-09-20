import { createBrowserClient } from '@supabase/ssr'

/**
 * Supabase client for use in Client Components (browser).
 * Safe to call anywhere on the client — uses the public URL + publishable/anon key.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}

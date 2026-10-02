import type { SupabaseClient } from '@supabase/supabase-js'

let client: Promise<SupabaseClient> | null = null

/**
 * Supabase client for Client Components (browser), loaded on first use.
 * The library is large (~65 KB gzipped), so it's fetched only when a
 * component actually needs it (sign-in buttons, photo upload, the header's
 * account check) instead of with every page. Uses the public URL + anon key.
 */
export function getBrowserClient(): Promise<SupabaseClient> {
  client ??= import('@supabase/ssr').then(({ createBrowserClient }) =>
    createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!),
  )
  return client
}

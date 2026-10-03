import type { SupabaseClient } from '@supabase/supabase-js'

let client: Promise<SupabaseClient> | null = null

/**
 * Supabase client for Client Components (browser), loaded on first use.
 * The library is large (~65 KB gzipped), so it's fetched only when a
 * component actually needs it (sign-in buttons, photo upload, the header's
 * account check) instead of with every page. Uses the public URL + anon key.
 *
 * autoRefreshToken off (v0.22.3): the proxy (lib/supabase/middleware.ts)
 * already refreshes the session on every request. With both refreshing,
 * a reload right as the tab woke up sent the same refresh token twice;
 * Supabase took that as token theft and ended the session (Cmd+R logged
 * people out). The client still renews an expired token when it's used.
 */
export function getBrowserClient(): Promise<SupabaseClient> {
  client ??= import('@supabase/ssr').then(({ createBrowserClient }) =>
    createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { autoRefreshToken: false },
    }),
  )
  return client
}

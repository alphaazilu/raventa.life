import type { User } from '@supabase/supabase-js'
import type { createClient } from './server'

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

export const AVATAR_BUCKET = 'avatars'
// Signed links to private photos last an hour — long enough for a visit,
// short enough that a copied link soon stops working.
const SIGNED_URL_TTL_SECONDS = 60 * 60

// Picture from the account's LINE or Google sign-in, if any (LINE first —
// it's the one most members use). Supabase keeps this from the provider and
// refreshes it at every sign-in.
export function providerAvatarOf(user: User): string | null {
  const identities = user.identities ?? []
  const line = identities.find((i) => i.provider === 'custom:line')?.identity_data?.picture
  if (typeof line === 'string' && line.startsWith('https://')) return line
  const google = identities.find((i) => i.provider === 'google')?.identity_data
  const googlePic = google?.avatar_url ?? google?.picture
  if (typeof googlePic === 'string' && googlePic.startsWith('https://')) return googlePic
  return null
}

// Copies the LINE/Google picture onto the profile so admins can see it too
// (admins can't read other people's sign-in identities). Best-effort: never
// the reason a sign-in fails.
export async function saveProviderAvatar(supabase: SupabaseClient, user: User): Promise<void> {
  const url = providerAvatarOf(user)
  if (!url) return
  const { error } = await supabase.from('profiles').update({ provider_avatar_url: url }).eq('id', user.id)
  if (error) console.error('saveProviderAvatar: could not store picture URL', error.message)
}

// What to show for a member: their uploaded photo (as a short-lived signed
// link — the bucket is private), else their LINE/Google picture, else null
// (the page then shows the first letter of their name).
export async function resolveAvatarUrl(
  supabase: SupabaseClient,
  profile: { avatar_path?: string | null; provider_avatar_url?: string | null } | null,
): Promise<string | null> {
  if (profile?.avatar_path) {
    const { data } = await supabase.storage
      .from(AVATAR_BUCKET)
      .createSignedUrl(profile.avatar_path, SIGNED_URL_TTL_SECONDS)
    if (data?.signedUrl) return data.signedUrl
  }
  return profile?.provider_avatar_url ?? null
}

// Same, for many members at once (admin list) — one request for all the
// uploaded photos instead of one per member.
export async function resolveAvatarUrls(
  supabase: SupabaseClient,
  profiles: { id: string; avatar_path?: string | null; provider_avatar_url?: string | null }[],
): Promise<Record<string, string | null>> {
  const paths = profiles.map((p) => p.avatar_path).filter((p): p is string => Boolean(p))
  const signed: Record<string, string> = {}
  if (paths.length > 0) {
    const { data } = await supabase.storage.from(AVATAR_BUCKET).createSignedUrls(paths, SIGNED_URL_TTL_SECONDS)
    for (const item of data ?? []) {
      if (item.path && item.signedUrl) signed[item.path] = item.signedUrl
    }
  }
  return Object.fromEntries(
    profiles.map((p) => [p.id, (p.avatar_path && signed[p.avatar_path]) || p.provider_avatar_url || null]),
  )
}

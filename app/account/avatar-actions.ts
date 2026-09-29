'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { AVATAR_BUCKET } from '@/lib/supabase/avatar'

export type AvatarActionResult = { ok: true } | { ok: false }

// Called after the browser has uploaded a photo into the member's own
// folder of the private "avatars" bucket (Storage policies only allow that
// folder). Points the profile at it and removes the previous photo, so each
// member keeps just one file.
export async function setAvatar(path: string): Promise<AvatarActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user || !path.startsWith(`${user.id}/`) || path.includes('..')) return { ok: false }

  const { data: before } = await supabase.from('profiles').select('avatar_path').eq('id', user.id).maybeSingle()

  const { error } = await supabase.from('profiles').update({ avatar_path: path }).eq('id', user.id)
  if (error) {
    console.error('setAvatar failed', error.message)
    return { ok: false }
  }

  if (before?.avatar_path && before.avatar_path !== path) {
    await supabase.storage.from(AVATAR_BUCKET).remove([before.avatar_path])
  }

  revalidatePath('/account', 'layout')
  return { ok: true }
}

// Back to the LINE/Google picture (or the name's first letter).
export async function removeAvatar(): Promise<AvatarActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false }

  const { data: before } = await supabase.from('profiles').select('avatar_path').eq('id', user.id).maybeSingle()

  const { error } = await supabase.from('profiles').update({ avatar_path: null }).eq('id', user.id)
  if (error) {
    console.error('removeAvatar failed', error.message)
    return { ok: false }
  }

  if (before?.avatar_path) {
    await supabase.storage.from(AVATAR_BUCKET).remove([before.avatar_path])
  }

  revalidatePath('/account', 'layout')
  return { ok: true }
}

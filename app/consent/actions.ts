'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { recordConsents } from '@/lib/consent'
import { PDPA_VERSION } from '@/lib/legal/content'

// §54 (v0.42.0): the member agrees to the current privacy policy + terms
// again (they changed since their last consent).

export type ConsentState = { error?: 'required' | 'failed'; ok?: boolean } | null

/** Only paths inside this app ("//host" would leave it). */
const safeNext = (v: FormDataEntryValue | null) => {
  const n = String(v ?? '/account')
  return n.startsWith('/') && !n.startsWith('//') ? n : '/account'
}

export async function acceptPolicies(_prev: ConsentState, formData: FormData): Promise<ConsentState> {
  if (formData.get('accept') !== 'on') return { error: 'required' }
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/consent')
  const ok = await recordConsents(supabase, user.id, [{ kind: 'pdpa', version: PDPA_VERSION, granted: true, source: 'reconsent' }])
  if (!ok) return { error: 'failed' }
  redirect(safeNext(formData.get('next')))
}

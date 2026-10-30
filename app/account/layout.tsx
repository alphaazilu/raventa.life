import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { latestConsents, needsPdpa } from '@/lib/consent'

// §54 (v0.42.0): a member whose last agreement is to an older privacy
// policy / terms (or none on record) is asked to agree again before using
// their account. Signed-out visitors pass through — each page sends them to
// /login itself.
export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user && needsPdpa(await latestConsents(supabase, user.id))) redirect('/consent?next=/account')
  return children
}

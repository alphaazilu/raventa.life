import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isProfileComplete, PROFILE_COMPLETENESS_COLUMNS } from '@/lib/supabase/profile'
import { saveLineUserId } from '@/lib/supabase/line'

// Handles the redirect back from Supabase after email confirmation or an
// OAuth login (Google, LINE).
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/account'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      // OAuth providers never send phone/province (and LINE usually no
      // email), so a fresh OAuth signup is incomplete on the very first
      // request after login — send them to fill it in immediately rather
      // than waiting until they hit /account.
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (user) {
        // Every LINE sign-in, so members who joined before this existed get
        // it too. A no-op once it's set, or for non-LINE accounts.
        await saveLineUserId(supabase, user)

        const { data: profile } = await supabase
          .from('profiles')
          .select(PROFILE_COMPLETENESS_COLUMNS)
          .eq('id', user.id)
          .single()

        if (!isProfileComplete(profile)) {
          const url = new URL('/complete-profile', origin)
          url.searchParams.set('next', next)
          return NextResponse.redirect(url)
        }
      }

      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // Supabase puts the reason on the URL when the provider step fails (e.g.
  // the person cancelled on LINE's consent screen). Pass it on so the page
  // can say something instead of silently showing an empty form.
  const reason = searchParams.get('error_code') ?? searchParams.get('error') ?? 'auth'

  // A failed "link LINE" from /account: the member is still signed in, so
  // send them back there, not to the login page.
  if (searchParams.get('link') === 'line') {
    const url = new URL('/account', origin)
    url.searchParams.set('link_error', reason)
    return NextResponse.redirect(url)
  }

  const url = new URL('/login', origin)
  url.searchParams.set('error', reason)
  return NextResponse.redirect(url)
}

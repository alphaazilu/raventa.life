import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isProfileComplete, PROFILE_COMPLETENESS_COLUMNS } from '@/lib/supabase/profile'
import { saveLineUserId } from '@/lib/supabase/line'
import { saveProviderAvatar } from '@/lib/supabase/avatar'
import { makeGoogleLinkTicket } from '@/lib/auth/google-link-ticket'

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

      // Supabase joins a Google sign-in onto an existing account with the
      // same email by itself. We don't allow that: Google is only added from
      // Settings, by someone already signed in the usual way. So a Google
      // identity that appeared just now on an older account (and not via the
      // Settings link flow) is taken off again and the person signed out.
      // The login page then offers to prove the email with a code and link
      // Google properly (app/login/google-link-actions.ts).
      if (user && !searchParams.get('link') && (await refusedGoogleAutoLink(supabase, user))) {
        const url = new URL('/login', origin)
        url.searchParams.set('error', 'google_existing')
        const res = NextResponse.redirect(url)
        const ticket = makeGoogleLinkTicket(user.id)
        res.cookies.set(ticket.name, ticket.value, {
          httpOnly: true,
          secure: url.protocol === 'https:',
          sameSite: 'lax',
          path: '/',
          maxAge: ticket.maxAge,
        })
        return res
      }

      if (user) {
        // Every LINE sign-in, so members who joined before this existed get
        // it too. A no-op once it's set, or for non-LINE accounts.
        await saveLineUserId(supabase, user)
        await saveProviderAvatar(supabase, user)

        const { data: profile } = await supabase
          .from('profiles')
          .select(PROFILE_COMPLETENESS_COLUMNS)
          .eq('id', user.id)
          .maybeSingle()

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

  // A failed "link LINE / Google" from the settings page: the member is still signed in, so
  // send them back there, not to the login page.
  const link = searchParams.get('link')
  if (link === 'line' || link === 'google') {
    const url = new URL('/account/settings', origin)
    url.searchParams.set('link_error', reason)
    url.searchParams.set('link', link)
    return NextResponse.redirect(url)
  }

  const url = new URL('/login', origin)
  url.searchParams.set('error', reason)
  return NextResponse.redirect(url)
}

type Supabase = Awaited<ReturnType<typeof createClient>>
type AuthUser = NonNullable<Awaited<ReturnType<Supabase['auth']['getUser']>>['data']['user']>

const JUST_NOW_MS = 10 * 60 * 1000

async function refusedGoogleAutoLink(supabase: Supabase, user: AuthUser): Promise<boolean> {
  const identities = user.identities ?? []
  const google = identities.find((i) => i.provider === 'google')
  if (!google?.created_at) return false
  const googleAt = Date.parse(google.created_at)
  if (Date.now() - googleAt > JUST_NOW_MS) return false
  // Another way in that existed well before this Google sign-in = an
  // existing account, not a new Google signup.
  const older = identities.some((i) => i.provider !== 'google' && i.created_at && Date.parse(i.created_at) < googleAt - 60_000)
  if (!older) return false
  const { error } = await supabase.auth.unlinkIdentity(google)
  if (error) console.error('google auto-link unlink failed', error.message)
  await supabase.auth.signOut()
  return true
}

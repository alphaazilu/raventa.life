import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isProfileComplete, PROFILE_COMPLETENESS_COLUMNS } from '@/lib/supabase/profile'
import { saveLineUserId } from '@/lib/supabase/line'
import { saveProviderAvatar } from '@/lib/supabase/avatar'
import { makeGoogleLinkTicket } from '@/lib/auth/google-link-ticket'
import { createAdminClient } from '@/lib/supabase/admin'

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
      // same email by itself. We don't let that sign anyone in: the Google
      // identity stays on the account but marked "pending" (app_metadata,
      // which only the server can change) and the person is signed out.
      // The login page then asks for a 6-digit code sent to the account's
      // email (app/login/google-link-actions.ts); once it's right, the mark
      // goes and Google works — no second trip to Google. Until then every
      // Google sign-in on that account is refused the same way.
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

  const pending = user.app_metadata?.google_pending === true
  if (pending) {
    // Refuse only when this sign-in was the Google one (its identity is
    // the most recently used) — LINE / email on the same account still work.
    const lastUsed = (i: { last_sign_in_at?: string | null; created_at?: string | null }) =>
      Date.parse(i.last_sign_in_at ?? i.created_at ?? '') || 0
    const newest = identities.reduce((a, b) => (lastUsed(b) > lastUsed(a) ? b : a))
    if (newest.provider !== 'google') return false
  } else {
    const googleAt = Date.parse(google.created_at)
    if (Date.now() - googleAt > JUST_NOW_MS) return false
    // Another way in that existed well before this Google sign-in = an
    // existing account, not a new Google signup.
    const older = identities.some((i) => i.provider !== 'google' && i.created_at && Date.parse(i.created_at) < googleAt - 60_000)
    if (!older) return false
    const { error } = await createAdminClient().auth.admin.updateUserById(user.id, {
      app_metadata: { google_pending: true },
    })
    if (error) {
      // Couldn't mark it — fall back to taking Google off again.
      console.error('google auto-link: could not mark pending', error.message)
      await supabase.auth.unlinkIdentity(google)
    }
  }
  await supabase.auth.signOut()
  return true
}

import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { isProfileComplete, PROFILE_COMPLETENESS_COLUMNS } from '@/lib/supabase/profile'
import { canUseDesk, CONSOLE_PATH, DESK_PATH, isAdmin, MEMBERS_PATH } from '@/lib/auth/roles'
import { DEVICE_COOKIE } from '@/lib/console/device-cookie'

/**
 * Refreshes the Supabase auth session on every request and gates the
 * /account and /console route groups. Called from the root proxy.ts.
 */
// Paths a registered tablet may still open (sign-in stays reachable until
// staff start shifts by scanning their card instead).
const TABLET_ALLOWED = [CONSOLE_PATH, '/tablet', '/login', '/auth', '/complete-profile', '/forgot-password', '/reset-password', '/api']

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options))
        },
      },
    },
  )

  // IMPORTANT: avoid writing logic between createServerClient and getUser().
  // A stray early return can drop the session refresh and randomly log users out.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const path = request.nextUrl.pathname
  // Where to come back to after login / finishing the profile, query
  // included (e.g. /account?card=1 from the LINE rich menu).
  const back = path + request.nextUrl.search
  const isConsoleRoute = path === CONSOLE_PATH || path.startsWith(`${CONSOLE_PATH}/`)
  const isAccountRoute = path.startsWith('/account')

  // Registered counter tablet ("tablet mode", Vault R2): the whole site is
  // the console. Only the cookie's presence is checked here; the console
  // itself verifies the key (and sends a revoked tablet back to /tablet).
  const onTablet = Boolean(request.cookies.get(DEVICE_COOKIE)?.value)
  if (onTablet && !TABLET_ALLOWED.some((p) => path === p || path.startsWith(`${p}/`) || path.startsWith(`${p}.`))) {
    const url = request.nextUrl.clone()
    url.pathname = CONSOLE_PATH
    url.search = ''
    return NextResponse.redirect(url)
  }
  // On the tablet the console layout shows its own lock screen instead of
  // bouncing to /login or /account.
  if (onTablet && isConsoleRoute) return supabaseResponse

  if ((isConsoleRoute || isAccountRoute) && !user) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.search = ''
    url.searchParams.set('next', back)
    return NextResponse.redirect(url)
  }

  if ((isConsoleRoute || isAccountRoute) && user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select(`role, ${PROFILE_COMPLETENESS_COLUMNS}`)
      .eq('id', user.id)
      .maybeSingle()

    // Google signups never collect phone/province — catch that
    // here too, not just right after OAuth, in case someone navigates
    // straight to /account or /console later without finishing that step.
    if (!isProfileComplete(profile)) {
      const url = request.nextUrl.clone()
      url.pathname = '/complete-profile'
      url.search = ''
      url.searchParams.set('next', back)
      return NextResponse.redirect(url)
    }

    // Back Office: admins get everything; staff get the front desk only
    // (for now — phase 2 moves staff onto the registered tablet, see R2).
    if (isConsoleRoute && !isAdmin(profile?.role)) {
      const isDeskRoute = path === DESK_PATH || path.startsWith(`${DESK_PATH}/`)
      // The member list (view only) on a counter tablet; the page itself
      // checks the device key is valid. Editing (/members/[id]) stays admin.
      const isStaffMembersRoute = path === MEMBERS_PATH && Boolean(request.cookies.get(DEVICE_COOKIE)?.value)
      if (!(isDeskRoute || isStaffMembersRoute) || !canUseDesk(profile?.role)) {
        const url = request.nextUrl.clone()
        url.pathname = canUseDesk(profile?.role) ? DESK_PATH : '/account'
        url.search = ''
        return NextResponse.redirect(url)
      }
    }
  }

  return supabaseResponse
}

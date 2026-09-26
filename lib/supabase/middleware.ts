import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { isProfileComplete } from '@/lib/supabase/profile'

/**
 * Refreshes the Supabase auth session on every request and gates the
 * /account and /admin route groups. Called from the root middleware.ts.
 */
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
  const isAdminRoute = path.startsWith('/admin')
  const isAccountRoute = path.startsWith('/account')

  if ((isAdminRoute || isAccountRoute) && !user) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('next', path)
    return NextResponse.redirect(url)
  }

  if ((isAdminRoute || isAccountRoute) && user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, first_name, last_name, phone, province, nationality')
      .eq('id', user.id)
      .single()

    // Google signups never collect phone/province — catch that
    // here too, not just right after OAuth, in case someone navigates
    // straight to /account or /admin later without finishing that step.
    if (!isProfileComplete(profile)) {
      const url = request.nextUrl.clone()
      url.pathname = '/complete-profile'
      url.searchParams.set('next', path)
      return NextResponse.redirect(url)
    }

    if (isAdminRoute && profile?.role !== 'admin') {
      const url = request.nextUrl.clone()
      url.pathname = '/account'
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}

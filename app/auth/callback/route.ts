import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isProfileComplete } from '@/lib/supabase/profile'

// Handles the redirect back from Supabase after email confirmation or a
// Google OAuth login.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/account'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      // Google never sends phone/province, so a fresh OAuth signup
      // is incomplete on the very first request after login — send them to
      // fill it in immediately rather than waiting until they hit /account.
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('first_name, last_name, phone, province, nationality')
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

  return NextResponse.redirect(`${origin}/login?error=auth`)
}

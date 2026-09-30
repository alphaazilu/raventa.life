import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { ConsoleBar } from '@/components/console/console-bar'
import { createClient } from '@/lib/supabase/server'
import { canUseDesk, CONSOLE_PATH, isAdmin } from '@/lib/auth/roles'

export const metadata: Metadata = {
  title: 'Back Office | RAVENTA Wellness Retreat',
  robots: { index: false, follow: false },
}

// Back Office console: its own top bar, no site header/footer. The proxy
// (lib/supabase/middleware.ts) already gates these routes by role; this is
// the second check, and each page checks again for what it shows.
export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/login?next=${CONSOLE_PATH}`)

  const { data: me } = await supabase.from('profiles').select('role, first_name').eq('id', user.id).maybeSingle()
  if (!canUseDesk(me?.role)) redirect('/account')

  return (
    <div className="min-h-dvh bg-background">
      <ConsoleBar name={me?.first_name || user.email || ''} admin={isAdmin(me?.role)} />
      {children}
    </div>
  )
}

'use server'

import { createClient } from '@/lib/supabase/server'

export type ForgotPasswordState = { sent?: boolean; error?: string; fieldErrors?: Record<string, string> } | null

export async function requestPasswordReset(
  _prevState: ForgotPasswordState,
  formData: FormData,
): Promise<ForgotPasswordState> {
  const email = String(formData.get('email') ?? '').trim()
  const siteUrl = process.env.SITE_URL ?? 'http://localhost:3000'

  if (!email) return { error: 'กรุณากรอกอีเมล', fieldErrors: { email: 'กรุณากรอกอีเมล' } }

  const supabase = await createClient()
  await supabase.auth.resetPasswordForEmail(email, {
    // Reuses the same code-exchange logic as OAuth login, then lands on
    // the set-new-password screen instead of /account.
    redirectTo: `${siteUrl}/auth/callback?next=/reset-password`,
  })

  // Supabase deliberately doesn't report whether the email exists (avoids
  // leaking which addresses have accounts), so we always show the same
  // "check your email" message regardless of the outcome.
  return { sent: true }
}

'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export type ResetPasswordState = { error?: string; fieldErrors?: Record<string, string> } | null

// Same rule as signup — enforced again here since this runs from its own
// form, not the signup one.
const PASSWORD_RE = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/

export async function updatePassword(
  _prevState: ResetPasswordState,
  formData: FormData,
): Promise<ResetPasswordState> {
  const password = String(formData.get('password') ?? '')
  const confirmPassword = String(formData.get('confirmPassword') ?? '')

  const fieldErrors: Record<string, string> = {}
  if (!PASSWORD_RE.test(password)) {
    fieldErrors.password = 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร มีทั้งตัวอักษรและตัวเลข'
  }
  if (password !== confirmPassword) {
    fieldErrors.confirmPassword = 'รหัสผ่านทั้งสองช่องไม่ตรงกัน'
  }
  if (Object.keys(fieldErrors).length > 0) {
    return { error: 'กรุณาตรวจสอบรหัสผ่าน', fieldErrors }
  }

  const supabase = await createClient()

  // Only reachable with the temporary session created by clicking the
  // emailed reset link (see app/auth/callback) — no active session here
  // means the link was missing, expired, or already used.
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/forgot-password')

  const { error } = await supabase.auth.updateUser({ password })
  if (error) return { error: error.message, fieldErrors: { password: error.message } }

  redirect('/account')
}

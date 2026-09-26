'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { isPhoneTaken, isUniqueViolation, PHONE_TAKEN_MESSAGE_TH } from '@/lib/supabase/phone'

export type UpdatePhoneState = {
  error?: string
  fieldErrors?: Record<string, string>
  success?: boolean
} | null

// Mirrors the pattern used everywhere else in this app (signup, complete
// profile) — 9-10 digits, no dashes or spaces.
const PHONE_RE = /^[0-9]{9,10}$/

// A member can only ever edit their own phone number here — first/last
// name and province stay admin-managed (see app/admin/actions.ts), and
// member_no is never editable through the app at all (see
// protect_member_no() in supabase/schema.sql).
export async function updateOwnPhone(_prevState: UpdatePhoneState, formData: FormData): Promise<UpdatePhoneState> {
  const phone = String(formData.get('phone') ?? '').trim()

  if (!PHONE_RE.test(phone)) {
    const message = 'กรุณากรอกเบอร์โทรศัพท์ 9-10 หลัก'
    return { error: message, fieldErrors: { phone: message } }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'กรุณาเข้าสู่ระบบอีกครั้ง' }

  // One account per phone number — changing to someone else's number is
  // blocked the same way signing up with it is.
  if (await isPhoneTaken(supabase, phone, user.id)) {
    return { error: PHONE_TAKEN_MESSAGE_TH, fieldErrors: { phone: PHONE_TAKEN_MESSAGE_TH } }
  }

  // RLS's "Users can update own profile" policy (auth.uid() = id) is what
  // actually scopes this to the caller's own row.
  const { error } = await supabase.from('profiles').update({ phone }).eq('id', user.id)
  if (isUniqueViolation(error)) {
    return { error: PHONE_TAKEN_MESSAGE_TH, fieldErrors: { phone: PHONE_TAKEN_MESSAGE_TH } }
  }
  if (error) return { error: error.message, fieldErrors: { phone: error.message } }

  revalidatePath('/account')
  return { success: true }
}

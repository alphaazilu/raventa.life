'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isPhoneTaken, isUniqueViolation, PHONE_TAKEN_MESSAGE_TH } from '@/lib/supabase/phone'

export type CompleteProfileState = { error?: string; fieldErrors?: Record<string, string> } | null

function safeNext(value: FormDataEntryValue | null): string {
  const next = String(value ?? '/account')
  // Only ever redirect to a path within this app — never to an external URL.
  return next.startsWith('/') ? next : '/account'
}

const PHONE_RE = /^[0-9]{9,10}$/

export async function completeProfile(
  _prevState: CompleteProfileState,
  formData: FormData,
): Promise<CompleteProfileState> {
  const firstName = String(formData.get('firstName') ?? '').trim()
  const lastName = String(formData.get('lastName') ?? '').trim()
  const phone = String(formData.get('phone') ?? '').trim()
  const province = String(formData.get('province') ?? '').trim()
  const nationality = String(formData.get('nationality') ?? '').trim()
  const acceptPrivacy = formData.get('acceptPrivacy') === 'on'
  const next = safeNext(formData.get('next'))

  // Collect every problem at once so every field that needs fixing can be
  // highlighted together, instead of the person fixing one and resubmitting
  // only to discover the next.
  const fieldErrors: Record<string, string> = {}
  if (!firstName) fieldErrors.firstName = 'กรุณากรอกชื่อ'
  if (!lastName) fieldErrors.lastName = 'กรุณากรอกนามสกุล'
  if (!phone) {
    fieldErrors.phone = 'กรุณากรอกเบอร์โทรศัพท์'
  } else if (!PHONE_RE.test(phone)) {
    fieldErrors.phone = 'กรุณากรอกเบอร์โทรศัพท์ 9-10 หลัก'
  }
  if (!province) fieldErrors.province = 'กรุณาเลือกจังหวัด'
  if (!nationality) fieldErrors.nationality = 'กรุณาเลือกสัญชาติ'
  // This is a first-time OAuth signup's one and only stop before an account
  // is usable, so it's where consent gets captured for that path — enforced
  // server-side too since a request can always skip the checkbox's
  // client-side "required" attribute.
  if (!acceptPrivacy) {
    fieldErrors.acceptPrivacy = 'กรุณายอมรับนโยบายความเป็นส่วนตัวและข้อกำหนดการใช้งานก่อนใช้งานบัญชี'
  }
  if (Object.keys(fieldErrors).length > 0) {
    return { error: 'กรุณากรอกข้อมูลให้ครบและถูกต้อง', fieldErrors }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Google signups set their phone here rather than on the signup form, so
  // the one-account-per-phone rule is checked here too.
  if (await isPhoneTaken(supabase, phone, user.id)) {
    return { error: PHONE_TAKEN_MESSAGE_TH, fieldErrors: { phone: PHONE_TAKEN_MESSAGE_TH } }
  }

  // upsert, not update: if the profiles row is missing for any reason (for
  // example it was deleted directly in the table editor), a plain update
  // silently affects 0 rows and returns no error — the person would then
  // get bounced right back here by the completeness check, forever. Upsert
  // recreates the row when needed, so this always actually fixes the gate.
  const { error } = await supabase
    .from('profiles')
    .upsert(
      { id: user.id, email: user.email, first_name: firstName, last_name: lastName, phone, province, nationality },
      { onConflict: 'id' },
    )

  if (isUniqueViolation(error)) {
    return { error: PHONE_TAKEN_MESSAGE_TH, fieldErrors: { phone: PHONE_TAKEN_MESSAGE_TH } }
  }
  if (error) return { error: error.message }

  revalidatePath('/', 'layout')
  redirect(next)
}

'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

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
  if (Object.keys(fieldErrors).length > 0) {
    return { error: 'กรุณากรอกข้อมูลให้ครบและถูกต้อง', fieldErrors }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // upsert, not update: if the profiles row is missing for any reason (for
  // example it was deleted directly in the table editor), a plain update
  // silently affects 0 rows and returns no error — the person would then
  // get bounced right back here by the completeness check, forever. Upsert
  // recreates the row when needed, so this always actually fixes the gate.
  const { error } = await supabase
    .from('profiles')
    .upsert(
      { id: user.id, email: user.email, first_name: firstName, last_name: lastName, phone, province },
      { onConflict: 'id' },
    )

  if (error) return { error: error.message }

  revalidatePath('/', 'layout')
  redirect(next)
}

'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export type CompleteProfileState = { error?: string } | null

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

  if (!firstName || !lastName || !phone || !province) {
    return { error: 'กรุณากรอกข้อมูลให้ครบทุกช่อง' }
  }
  if (!PHONE_RE.test(phone)) {
    return { error: 'กรุณากรอกเบอร์โทรศัพท์ 9-10 หลัก' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { error } = await supabase
    .from('profiles')
    .update({ first_name: firstName, last_name: lastName, phone, province })
    .eq('id', user.id)

  if (error) return { error: error.message }

  revalidatePath('/', 'layout')
  redirect(next)
}

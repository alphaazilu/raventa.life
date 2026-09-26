'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export type UpdateMemberState = { error?: string; fieldErrors?: Record<string, string> } | null

// Mirrors the pattern used everywhere else in this app (signup, complete
// profile, account).
const PHONE_RE = /^[0-9]{9,10}$/

export async function updateMemberProfile(
  _prevState: UpdateMemberState,
  formData: FormData,
): Promise<UpdateMemberState> {
  const memberId = String(formData.get('memberId') ?? '')
  const firstName = String(formData.get('firstName') ?? '').trim()
  const lastName = String(formData.get('lastName') ?? '').trim()
  const phone = String(formData.get('phone') ?? '').trim()
  const province = String(formData.get('province') ?? '').trim()
  const nationality = String(formData.get('nationality') ?? '').trim()

  // Collect every problem at once, same as the other forms in this app.
  const fieldErrors: Record<string, string> = {}
  if (!firstName) fieldErrors.firstName = 'กรุณากรอกชื่อ'
  if (!lastName) fieldErrors.lastName = 'กรุณากรอกนามสกุล'
  if (!PHONE_RE.test(phone)) fieldErrors.phone = 'กรุณากรอกเบอร์โทรศัพท์ 9-10 หลัก'
  if (!province) fieldErrors.province = 'กรุณาเลือกจังหวัด'
  if (!nationality) fieldErrors.nationality = 'กรุณาเลือกสัญชาติ'
  if (Object.keys(fieldErrors).length > 0) {
    return { error: 'กรุณากรอกข้อมูลให้ครบและถูกต้อง', fieldErrors }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/admin')

  // Belt-and-suspenders: the "Admins can update any profile" RLS policy
  // (see supabase/schema.sql) is what actually enforces this, but checking
  // here too means a non-admin gets a clean message instead of a raw
  // Postgres error.
  const { data: adminProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (adminProfile?.role !== 'admin') {
    return { error: 'คุณไม่มีสิทธิ์แก้ไขข้อมูลนี้' }
  }

  // Deliberately never mentions member_no — the database's protect_member_no
  // trigger (see supabase/schema.sql) would reject it outright even if this
  // ever tried, since that number can only ever be changed by editing the
  // database directly (an admin hand-picks an auspicious/"mongkol" number
  // there when a member asks for one).
  const { error } = await supabase
    .from('profiles')
    .update({ first_name: firstName, last_name: lastName, phone, province, nationality })
    .eq('id', memberId)

  if (error) return { error: error.message }

  revalidatePath('/admin')
  revalidatePath(`/admin/members/${memberId}`)
  redirect('/admin')
}

import type { createClient } from './server'

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

// Shared by every form that saves a phone number (signup, complete profile,
// account, admin edit) so they all apply the same "one account per phone"
// rule. See phone_is_taken() and profiles_phone_digits_key in
// supabase/schema.sql.

export const PHONE_TAKEN_MESSAGE_TH = 'เบอร์โทรศัพท์นี้ถูกใช้สมัครสมาชิกแล้ว หากเป็นเบอร์ของคุณ กรุณาเข้าสู่ระบบหรือติดต่อเรา'

// Checks before saving. excludeId is the profile being saved, so keeping
// your own number unchanged is never flagged as a duplicate.
export async function isPhoneTaken(supabase: SupabaseClient, phone: string, excludeId?: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('phone_is_taken', {
    p_phone: phone,
    p_exclude_id: excludeId ?? null,
  })
  // If the check itself can't run (e.g. schema.sql not re-run yet), don't
  // block the save here — the unique index still catches a real duplicate.
  if (error) return false
  return data === true
}

// If two people submit the same number at the same moment, both pass
// isPhoneTaken() and the database index rejects the second — this
// recognises that specific error so it gets the same friendly message.
// Matched on the index name, not just the unique_violation code (23505),
// so an unrelated unique clash is never mislabelled as a phone problem.
export function isUniqueViolation(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  return /profiles_phone_digits_key/.test(error.message ?? '')
}

import type { SupabaseClient } from '@supabase/supabase-js'

// A member's packages (schema.sql §21), read with the caller's own session:
// members see their own, staff anyone's. Used by the desk, the member's
// account page and Back Office › Members.

export type MemberPackage = {
  id: string
  name: string
  visitsTotal: number | null // null = unlimited
  visitsUsed: number
  startsOn: string | null // null = starts on first visit
  expiresOn: string | null
  activateBy: string | null
  weekdayOnly: boolean
  cancelled: boolean
  createdAt: string
}

// Still worth showing: not cancelled, not used up, not past its date.
export function packageAlive(k: MemberPackage, today: string): boolean {
  if (k.cancelled) return false
  if (k.visitsTotal !== null && k.visitsUsed >= k.visitsTotal) return false
  if (k.expiresOn && k.expiresOn < today) return false
  if (!k.startsOn && k.activateBy && k.activateBy < today) return false
  return true
}

// all = include used-up, expired and cancelled ones (history).
export async function loadMemberPackages(
  supabase: SupabaseClient,
  memberId: string,
  today: string,
  all = false,
): Promise<MemberPackage[]> {
  const { data, error } = await supabase
    .from('member_packages')
    .select('id, name, visits_total, visits_used, starts_on, expires_on, activate_by, weekday_only, cancelled_at, created_at')
    .eq('member_id', memberId)
    .order('created_at', { ascending: false })
  if (error) return [] // §21 not run yet
  const list = (data ?? []).map(
    (r): MemberPackage => ({
      id: r.id,
      name: r.name,
      visitsTotal: r.visits_total ?? null,
      visitsUsed: Number(r.visits_used),
      startsOn: r.starts_on ?? null,
      expiresOn: r.expires_on ?? null,
      activateBy: r.activate_by ?? null,
      weekdayOnly: Boolean(r.weekday_only),
      cancelled: Boolean(r.cancelled_at),
      createdAt: r.created_at,
    }),
  )
  return all ? list : list.filter((k) => packageAlive(k, today))
}

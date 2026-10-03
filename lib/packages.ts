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
  // Sharing (§23)
  shareable: boolean
  isOwner: boolean
  ownerName: string | null // set on packages shared with this member
  sharedWith: { id: string; name: string }[] // set for the owner
}

// Still worth showing: not cancelled, not used up, not past its date.
export function packageAlive(k: MemberPackage, today: string): boolean {
  if (k.cancelled) return false
  if (k.visitsTotal !== null && k.visitsUsed >= k.visitsTotal) return false
  if (k.expiresOn && k.expiresOn < today) return false
  if (!k.startsOn && k.activateBy && k.activateBy < today) return false
  return true
}

// Own packages plus those shared with this member (member_package_list, §23;
// falls back to own packages only before §23 is run).
// all = include used-up, expired and cancelled ones (history).
export async function loadMemberPackages(
  supabase: SupabaseClient,
  memberId: string,
  today: string,
  all = false,
): Promise<MemberPackage[]> {
  const { data, error } = await supabase.rpc('member_package_list', { p_member_id: memberId })
  let rows: Record<string, unknown>[] = (data as Record<string, unknown>[] | null) ?? []
  if (error) {
    const own = await supabase
      .from('member_packages')
      .select('id, name, visits_total, visits_used, starts_on, expires_on, activate_by, weekday_only, cancelled_at, created_at')
      .eq('member_id', memberId)
      .order('created_at', { ascending: false })
    if (own.error) return [] // §21 not run yet
    rows = (own.data ?? []).map((r) => ({ ...r, cancelled: Boolean(r.cancelled_at), is_owner: true }))
  }
  const list = rows.map(
    (r): MemberPackage => ({
      id: r.id as string,
      name: r.name as string,
      visitsTotal: (r.visits_total as number | null) ?? null,
      visitsUsed: Number(r.visits_used),
      startsOn: (r.starts_on as string | null) ?? null,
      expiresOn: (r.expires_on as string | null) ?? null,
      activateBy: (r.activate_by as string | null) ?? null,
      weekdayOnly: Boolean(r.weekday_only),
      cancelled: Boolean(r.cancelled),
      createdAt: r.created_at as string,
      shareable: Boolean(r.shareable),
      isOwner: Boolean(r.is_owner),
      ownerName: (r.owner_name as string | null) ?? null,
      sharedWith: (r.shared_with as { id: string; name: string }[] | null) ?? [],
    }),
  )
  return all ? list : list.filter((k) => packageAlive(k, today))
}

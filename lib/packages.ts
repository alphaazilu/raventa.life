import type { SupabaseClient } from '@supabase/supabase-js'

// A member's packages (schema.sql §21), read with the caller's own session:
// members see their own, staff anyone's. Used by the desk, the member's
// account page and Back Office › Members.

export type MemberPackage = {
  id: string
  name: string
  visitsTotal: number | null // null = unlimited
  visitsUsed: number
  visitsGiven: number // handed to friends (§23); left = total - used - given
  startsOn: string | null // null = starts on first visit
  expiresOn: string | null
  activateBy: string | null
  weekdayOnly: boolean
  cancelled: boolean
  createdAt: string
  // Sharing (§23)
  shareable: boolean
  shareWhole: boolean // friends join the whole package (else one visit per link)
  isOwner: boolean // false = handed over by, or shared whole from, a friend
  ownerName: string | null // that friend's first name
  sharedWith: SharedPiece[] // for the owner: who they handed visits to
  // Other things in the package (§40): each with its own balance.
  items?: PackageItem[]
  noEntry?: boolean // §41: no check-ins, only the items
}

export type PackageItem = { id: string; name: string; nameEn: string; total: number | null; used: number }

export function itemLeft(x: PackageItem): number | null {
  return x.total === null ? null : Math.max(0, x.total - x.used)
}

// Who the owner shares with: 'piece' = visits handed to one friend (that
// friend's own small package); 'member' = a friend on the whole package.
export type SharedPiece = {
  id: string
  kind: 'piece' | 'member'
  name: string
  total?: number
  used?: number
  expiresOn?: string | null
}

// Visits a friend handed this member (one-visit sharing) — shown as a gift.
export function isGift(k: MemberPackage): boolean {
  return !k.isOwner && !k.shareWhole
}

export function packageLeft(k: MemberPackage): number | null {
  return k.visitsTotal === null ? null : Math.max(0, k.visitsTotal - k.visitsUsed - k.visitsGiven)
}

// Visits a friend still has from the owner's package.
export function pieceOpen(f: SharedPiece, today: string): boolean {
  if (f.kind === 'member') return true
  return (f.total ?? 0) > (f.used ?? 0) && (!f.expiresOn || f.expiresOn >= today)
}

// Still worth showing: not cancelled, not used up, not past its date.
export function packageAlive(k: MemberPackage, today: string): boolean {
  if (k.cancelled) return false
  // All handed out still shows while a friend has visits the owner could take back.
  // Visits all used still shows while other items are left (§40).
  const itemsLeft = (k.items ?? []).some((x) => itemLeft(x) !== 0)
  if ((k.noEntry || packageLeft(k) === 0) && !itemsLeft && !k.sharedWith.some((f) => pieceOpen(f, today))) return false
  if (k.expiresOn && k.expiresOn < today) return false
  if (!k.startsOn && k.activateBy && k.activateBy < today) return false
  return true
}

// The member's packages, including visits a friend handed them, with
// sharing details (member_package_list, §23; falls back to the plain table
// before §23 is run).
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
      visitsGiven: Number(r.visits_given ?? 0),
      startsOn: (r.starts_on as string | null) ?? null,
      expiresOn: (r.expires_on as string | null) ?? null,
      activateBy: (r.activate_by as string | null) ?? null,
      weekdayOnly: Boolean(r.weekday_only),
      cancelled: Boolean(r.cancelled),
      createdAt: r.created_at as string,
      shareable: Boolean(r.shareable),
      shareWhole: Boolean(r.share_whole),
      isOwner: Boolean(r.is_owner),
      ownerName: (r.owner_name as string | null) ?? null,
      sharedWith: (r.shared_with as SharedPiece[] | null) ?? [],
    }),
  )
  // Other things in each package (§40) — missing before §40 is run.
  if (list.length > 0) {
    const { data: its, error: itErr } = await supabase
      .from('member_package_items')
      .select('id, member_package_id, name, name_en, qty_total, qty_used, sort')
      .in('member_package_id', list.map((k) => k.id))
      .order('sort')
    const ne = await supabase.from('member_packages').select('id, no_entry').in('id', list.map((k) => k.id)).eq('no_entry', true)
    if (!ne.error) for (const r of ne.data ?? []) {
      const k = list.find((x) => x.id === r.id)
      if (k) k.noEntry = true
    }
    if (!itErr) {
      for (const k of list) k.items = []
      const byId = new Map(list.map((k) => [k.id, k]))
      for (const r of its ?? []) {
        byId.get(r.member_package_id as string)?.items?.push({
          id: r.id as string,
          name: r.name as string,
          nameEn: (r.name_en as string | null) || (r.name as string),
          total: (r.qty_total as number | null) ?? null,
          used: Number(r.qty_used),
        })
      }
    }
  }
  return all ? list : list.filter((k) => packageAlive(k, today))
}

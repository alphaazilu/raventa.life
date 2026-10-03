import type { SupabaseClient } from '@supabase/supabase-js'

// One member's share history (schema §23, package_share_events): visits
// they gave or got, taken back, family packages joined or left. Admins only
// (RLS); empty before the table exists.

export type ShareEvent = {
  id: number
  at: string
  action: 'give' | 'take_back' | 'join' | 'remove' | 'cancelled'
  visits: number | null
  via: 'qr' | 'email' | null
  packageName: string
  // The other person, seen from this member's side.
  outgoing: boolean // this member is the owner
  otherId: string | null
  otherName: string
}

export async function loadShareHistory(supabase: SupabaseClient, memberId: string): Promise<ShareEvent[]> {
  const { data, error } = await supabase
    .from('package_share_events')
    .select('id, action, visits, via, created_at, owner_id, friend_id, package:member_packages!package_share_events_package_id_fkey(name)')
    .or(`owner_id.eq.${memberId},friend_id.eq.${memberId}`)
    .order('created_at', { ascending: false })
    .limit(200)
  if (error || !data) return []

  const rows = data as unknown as {
    id: number
    action: ShareEvent['action']
    visits: number | null
    via: ShareEvent['via']
    created_at: string
    owner_id: string | null
    friend_id: string | null
    package: { name: string } | { name: string }[] | null
  }[]
  const otherIds = [...new Set(rows.map((r) => (r.owner_id === memberId ? r.friend_id : r.owner_id)).filter((v): v is string => Boolean(v)))]
  const names = new Map<string, string>()
  if (otherIds.length) {
    const { data: people } = await supabase.from('profiles').select('id, first_name, last_name, member_no').in('id', otherIds)
    for (const p of people ?? []) names.set(p.id, [p.first_name, p.last_name].filter(Boolean).join(' ') || p.member_no || '—')
  }
  return rows.map((r) => {
    const outgoing = r.owner_id === memberId
    const otherId = outgoing ? r.friend_id : r.owner_id
    const pkg = Array.isArray(r.package) ? r.package[0] : r.package
    return {
      id: r.id,
      at: r.created_at,
      action: r.action,
      visits: r.visits,
      via: r.via,
      packageName: pkg?.name ?? '—',
      outgoing,
      otherId,
      otherName: (otherId && names.get(otherId)) || '—',
    }
  })
}

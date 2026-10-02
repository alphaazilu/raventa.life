import type { SupabaseClient } from '@supabase/supabase-js'

// A member's visits (and, for admins, their bills) — read with the caller's
// own session, so RLS decides: members see their own visits, staff/admins
// anyone's; bills are admin-only (§19). Used by Back Office › Members › one
// member, and by the member's own /account/history.

export type HistoryVisit = {
  id: string
  date: string
  entryType: 'paid' | 'reward'
  price: number
  paymentMethod: string | null
  wristband: string | null
  inAt: string
  outAt: string | null
  staff: string | null
  cancelled: boolean
  cancelReason: string | null
}

export type HistoryBill = {
  id: string
  receiptNo: number
  at: string
  total: number
  discount: number
  paymentMethod: string | null
  promo: string | null
  voided: boolean
  voidReason: string | null
  lines: { name: string; qty: number; total: number }[]
}

export type HistorySummary = {
  visits: number
  paid: number
  reward: number
  first: string | null
  last: string | null
  perMonth: number
  spend: number | null // null when bills aren't readable (members)
}

export type VisitHistory = { summary: HistorySummary; visits: HistoryVisit[]; bills: HistoryBill[] }

const LIMIT = 500
const VISIT_COLUMNS =
  'id, visit_date, entry_type, price, payment_method, wristband, checked_in_at, checked_out_at, checked_in_by, cancelled_at, cancel_reason'

type VisitRow = {
  id: string
  visit_date: string
  entry_type: 'paid' | 'reward'
  price: number
  payment_method: string | null
  wristband: string | null
  checked_in_at: string
  checked_out_at: string | null
  checked_in_by: string | null
  cancelled_at: string | null
  cancel_reason: string | null
  sale_id?: string | null
}

// visits.sale_id arrives with §18; until then read without it.
async function selectVisits(supabase: SupabaseClient, memberId: string) {
  const run = (cols: string) =>
    supabase.from('visits').select(cols).eq('member_id', memberId).order('checked_in_at', { ascending: false }).limit(LIMIT)
  const res = await run(`${VISIT_COLUMNS}, sale_id`)
  return res.error?.code === '42703' ? run(VISIT_COLUMNS) : res
}

export async function loadVisitHistory(
  supabase: SupabaseClient,
  memberId: string,
  opts: { bills: boolean },
): Promise<VisitHistory> {
  const [visitRes, billRes] = await Promise.all([
    selectVisits(supabase, memberId),
    opts.bills
      ? supabase
          .from('sales')
          .select('id, receipt_no, created_at, total, discount, payment_method, promo_name, voided_at, void_reason, sale_lines(name, qty, line_total)')
          .eq('member_id', memberId)
          .order('created_at', { ascending: false })
          .limit(LIMIT)
      : Promise.resolve({ data: null, error: null }),
  ])
  const rows = (visitRes.data ?? []) as unknown as VisitRow[]

  // Staff first names for "checked in by" (admins only — RLS hides others).
  const staffIds = opts.bills ? [...new Set(rows.map((r) => r.checked_in_by).filter((id): id is string => Boolean(id)))] : []
  const names = new Map<string, string>()
  if (staffIds.length) {
    const { data } = await supabase.from('profiles').select('id, first_name, last_name').in('id', staffIds)
    for (const p of data ?? []) names.set(p.id, [p.first_name, p.last_name].filter(Boolean).join(' ') || '—')
  }

  const visits: HistoryVisit[] = rows.map((r) => ({
    id: r.id,
    date: r.visit_date,
    entryType: r.entry_type,
    price: r.price,
    paymentMethod: r.payment_method,
    wristband: r.wristband,
    inAt: r.checked_in_at,
    outAt: r.checked_out_at,
    staff: r.checked_in_by ? (names.get(r.checked_in_by) ?? null) : null,
    cancelled: Boolean(r.cancelled_at),
    cancelReason: r.cancel_reason,
  }))

  // §18 not run yet = no bills table; just leave bills out.
  const bills: HistoryBill[] = (billRes.error ? [] : (billRes.data ?? [])).map((b) => ({
    id: b.id,
    receiptNo: b.receipt_no,
    at: b.created_at,
    total: b.total,
    discount: b.discount,
    paymentMethod: b.payment_method,
    promo: b.promo_name,
    voided: Boolean(b.voided_at),
    voidReason: b.void_reason,
    lines: ((b.sale_lines ?? []) as { name: string; qty: number; line_total: number }[]).map((l) => ({
      name: l.name,
      qty: l.qty,
      total: l.line_total,
    })),
  }))

  const kept = visits.filter((v) => !v.cancelled)
  const first = kept.at(-1)?.date ?? null
  const last = kept[0]?.date ?? null
  let perMonth = 0
  if (first && last) {
    const months = Math.max(1, (Date.parse(last) - Date.parse(first)) / (30.44 * 86_400_000))
    perMonth = Math.round((kept.length / months) * 10) / 10
  }
  // Spend = every bill not voided, plus older check-ins made before bills
  // existed (no sale_id), which carry their own price. Admins only.
  const spend = opts.bills
    ? bills.filter((b) => !b.voided).reduce((t, b) => t + b.total, 0) +
      rows.filter((r) => !r.cancelled_at && !r.sale_id).reduce((t, r) => t + r.price, 0)
    : null

  return {
    summary: {
      visits: kept.length,
      paid: kept.filter((v) => v.entryType === 'paid').length,
      reward: kept.filter((v) => v.entryType === 'reward').length,
      first,
      last,
      perMonth,
      spend,
    },
    visits,
    bills,
  }
}

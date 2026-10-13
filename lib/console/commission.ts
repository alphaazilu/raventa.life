import { createAdminClient } from '@/lib/supabase/admin'
import { isMissingTable } from '@/lib/console/db-errors'
import { getAppSettings } from '@/lib/console/settings'
import { cycleOf, previousCycle, type PayType } from '@/lib/console/pay-cycle'
import { lineAmount, lineKey, shareDiscount, type CommissionKind, type CommissionMode, type CommissionRule, type DeskCommission } from '@/lib/commission'

// Staff commission (§33, v0.34). SERVER ONLY (service role).

const nameOf = (p: { first_name?: unknown; last_name?: unknown; email?: unknown }) =>
  [p.first_name, p.last_name].filter(Boolean).join(' ') || (p.email as string) || '—'

const toRule = (r: Record<string, unknown>): CommissionRule => ({
  id: r.id as string,
  productId: (r.product_id as string | null) ?? null,
  kind: (r.kind as CommissionKind | null) ?? null,
  mode: r.mode as CommissionMode,
  value: Number(r.value),
})

// Everyone on the team (staff + admins) and whether they earn. null = §33 not run.
export async function listEarners(): Promise<{ id: string; name: string; role: string; enabled: boolean }[] | null> {
  const db = createAdminClient()
  const { data: on, error } = await db.from('staff_commission').select('staff_id, enabled')
  if (error) {
    if (isMissingTable(error)) return null
    throw error
  }
  const { data: people, error: e2 } = await db.from('profiles').select('id, first_name, last_name, email, role').in('role', ['staff', 'admin']).order('first_name')
  if (e2) throw e2
  const enabled = new Set((on ?? []).filter((r) => r.enabled).map((r) => r.staff_id as string))
  return (people ?? []).map((p) => ({ id: p.id as string, name: nameOf(p), role: p.role as string, enabled: enabled.has(p.id as string) }))
}

export async function listRules(): Promise<CommissionRule[] | null> {
  const { data, error } = await createAdminClient().from('commission_rules').select('id, product_id, kind, mode, value')
  if (error) {
    if (isMissingTable(error)) return null
    throw error
  }
  return (data ?? []).map(toRule)
}

// Team members who earn now (still staff or admin).
async function enabledEarners(): Promise<Map<string, string> | null> {
  const all = await listEarners()
  if (!all) return null
  return new Map(all.filter((p) => p.enabled).map((p) => [p.id, p.name]))
}

export async function isEarner(id: string): Promise<boolean | null> {
  const m = await enabledEarners()
  return m ? m.has(id) : null
}

// What the counter needs to show referrer / per-line pickers.
export async function loadDeskCommission(me: string): Promise<DeskCommission> {
  try {
    const [earners, rules] = await Promise.all([enabledEarners(), listRules()])
    if (!earners || !rules || earners.size === 0 || rules.length === 0) return null
    const { data: dp } = await createAdminClient().from('products').select('id').eq('kind', 'day_pass').maybeSingle()
    return {
      staff: [...earners].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'th')),
      productIds: rules.filter((r) => r.productId).map((r) => r.productId as string),
      kinds: rules.filter((r) => r.kind).map((r) => r.kind as string),
      dayPassId: (dp?.id as string | undefined) ?? null,
      me,
    }
  } catch {
    return null
  }
}

// After a bill is paid: work out each line's commission and keep it.
// Never fails the sale — a problem here is logged and the bill stands.
export async function recordCommissions(input: {
  saleId: string
  cashierId: string
  referrerId: string | null
  lineStaff: Record<string, string>
}): Promise<void> {
  try {
    const [earners, rules] = await Promise.all([enabledEarners(), listRules()])
    if (!earners || !rules || rules.length === 0) return
    const db = createAdminClient()
    const [{ data: sale }, { data: lines }] = await Promise.all([
      db.from('sales').select('id, discount, voided_at').eq('id', input.saleId).maybeSingle(),
      db.from('sale_lines').select('id, product_id, variant_id, kind, qty, line_total').eq('sale_id', input.saleId).order('id'),
    ])
    if (!sale || sale.voided_at || !lines?.length) return
    const byProduct = new Map(rules.filter((r) => r.productId).map((r) => [r.productId as string, r]))
    const byKind = new Map(rules.filter((r) => r.kind).map((r) => [r.kind as string, r]))
    const shares = shareDiscount(lines.map((l) => Number(l.line_total)), Number(sale.discount))
    const referrer = input.referrerId && input.referrerId !== input.cashierId && earners.has(input.referrerId) ? input.referrerId : null
    const rows = lines.flatMap((l, i) => {
      const rule = byProduct.get(l.product_id as string) ?? byKind.get(l.kind as string)
      if (!rule) return []
      const base = Number(l.line_total) - shares[i]
      if (base <= 0) return []
      const picked = input.lineStaff[lineKey(l.kind as string, l.product_id as string, (l.variant_id as string | null) ?? null)]
      const [staffId, source] =
        picked && earners.has(picked) ? [picked, 'line'] : referrer ? [referrer, 'referrer'] : earners.has(input.cashierId) ? [input.cashierId, 'cashier'] : [null, '']
      if (!staffId) return []
      const amount = lineAmount(base, Number(l.qty), rule.mode, rule.value)
      if (amount <= 0) return []
      return [{ sale_id: input.saleId, sale_line_id: l.id, staff_id: staffId, source, base, mode: rule.mode, rate: rule.value, amount, set_by: input.cashierId }]
    })
    if (!rows.length) return
    const { error } = await db.from('sale_commissions').insert(rows)
    if (error) console.error('commission insert failed', error.code, error.message)
  } catch (err) {
    console.error('commission failed', (err as Error).message)
  }
}

// ---- Reports ----

export type CommissionLine = {
  id: number
  saleId: string
  receiptNo: number | null
  saleDate: string
  item: string
  qty: number
  base: number
  mode: CommissionMode
  rate: number
  amount: number
  source: 'cashier' | 'referrer' | 'line'
}

export type CommissionPersonTotal = { staffId: string; name: string; bills: number; lines: number; base: number; amount: number; detail: CommissionLine[] }

// Kept commission on bills dated from–to (Bangkok days), voided bills left out.
export async function loadCommissionReport(from: string, to: string, staffId?: string): Promise<CommissionPersonTotal[] | null> {
  const db = createAdminClient()
  const rows: Record<string, unknown>[] = []
  for (let off = 0; off < 50_000; off += 1000) {
    let q = db
      .from('sale_commissions')
      .select('id, sale_id, staff_id, source, base, mode, rate, amount, sales!inner(receipt_no, sale_date, voided_at), sale_lines!inner(name, qty)')
      .gte('sales.sale_date', from)
      .lte('sales.sale_date', to)
      .is('sales.voided_at', null)
      .order('id')
      .range(off, off + 999)
    if (staffId) q = q.eq('staff_id', staffId)
    const { data, error } = await q
    if (error) {
      if (isMissingTable(error)) return null
      throw error
    }
    rows.push(...((data ?? []) as Record<string, unknown>[]))
    if (!data || data.length < 1000) break
  }
  const ids = [...new Set(rows.map((r) => r.staff_id as string))]
  const { data: people } = ids.length ? await db.from('profiles').select('id, first_name, last_name, email').in('id', ids) : { data: [] }
  const names = new Map((people ?? []).map((p) => [p.id as string, nameOf(p)]))
  const one = <T,>(v: unknown) => (Array.isArray(v) ? v[0] : v) as T
  const out = new Map<string, CommissionPersonTotal>()
  for (const r of rows) {
    const s = one<{ receipt_no: number | null; sale_date: string }>(r.sales)
    const l = one<{ name: string; qty: number }>(r.sale_lines)
    const id = r.staff_id as string
    const p = out.get(id) ?? { staffId: id, name: names.get(id) ?? '—', bills: 0, lines: 0, base: 0, amount: 0, detail: [] }
    p.detail.push({
      id: Number(r.id),
      saleId: r.sale_id as string,
      receiptNo: s?.receipt_no ?? null,
      saleDate: s?.sale_date ?? '',
      item: l?.name ?? '—',
      qty: Number(l?.qty ?? 1),
      base: Number(r.base),
      mode: r.mode as CommissionMode,
      rate: Number(r.rate),
      amount: Number(r.amount),
      source: r.source as CommissionLine['source'],
    })
    p.lines += 1
    p.base += Number(r.base)
    p.amount = Math.round((p.amount + Number(r.amount)) * 100) / 100
    out.set(id, p)
  }
  for (const p of out.values()) {
    p.bills = new Set(p.detail.map((d) => d.saleId)).size
    p.detail.sort((a, b) => (a.saleDate === b.saleDate ? b.id - a.id : a.saleDate < b.saleDate ? 1 : -1))
  }
  return [...out.values()].sort((a, b) => b.amount - a.amount)
}

// My account: my own total for a period (null = §33 not run or I don't earn and have nothing).
export async function myCommission(staffId: string, from: string, to: string): Promise<{ amount: number; lines: number } | null> {
  try {
    const r = await loadCommissionReport(from, to, staffId)
    if (!r) return null
    const me = r[0]
    return { amount: me?.amount ?? 0, lines: me?.lines ?? 0 }
  } catch {
    return null
  }
}

export type MyCommissionCard = { amount: number; lines: number; from: string; to: string; last: number }

// My account › My work: this pay period so far, and the last one.
// null = I don't earn and have nothing this period (or §33 not run).
export async function myCommissionCard(staffId: string, today: string): Promise<MyCommissionCard | null> {
  try {
    const earns = await isEarner(staffId)
    if (earns === null) return null
    const [{ pay }, payRow] = await Promise.all([
      getAppSettings(),
      createAdminClient().from('staff_pay').select('pay_type').eq('staff_id', staffId).maybeSingle(),
    ])
    const type = ((payRow.data?.pay_type as PayType | undefined) ?? 'monthly') as PayType
    const now = cycleOf(today, type, pay)
    const prev = previousCycle(today, type, pay)
    const [a, b] = await Promise.all([myCommission(staffId, now.from, now.to), myCommission(staffId, prev.from, prev.to)])
    if (!a) return null
    if (!earns && a.lines === 0) return null
    return { amount: a.amount, lines: a.lines, from: now.from, to: now.to, last: b?.amount ?? 0 }
  } catch {
    return null
  }
}

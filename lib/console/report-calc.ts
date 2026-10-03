// Sales report maths (Back Office › Reports, v0.23). Pure functions over
// rows already read from the database, so they can be tested on their own.
// Money is whole baht throughout; dates are Bangkok calendar days
// (YYYY-MM-DD), ranges inclusive.

export type RSale = {
  id: string
  receipt_no: number
  sale_date: string
  created_at: string
  member_no: string | null
  subtotal: number
  discount: number
  total: number
  payment_method: 'cash' | 'transfer' | 'card' | null
  promo_name: string | null
  staff_id: string | null
  voided_at: string | null
  void_reason: string | null
  voided_by: string | null
  lines: { id: number; product_id: string; kind: string; name: string; qty: number; unit_price: number; line_total: number }[]
}

export type RVisit = {
  id: string
  visit_date: string
  entry_type: 'paid' | 'reward' | 'package'
  sale_id: string | null
  package_id: string | null
}

// A package sold at the desk (has a sale line), with what was paid for it.
export type RPackage = {
  id: string
  name: string
  saleDate: string // the bill's date
  paid: number // this unit's share of the bill after discount (may be fractional)
  visitsTotal: number | null // null = unlimited
  validDays: number
  startsOn: string | null
  expiresOn: string | null
  activateBy: string | null
}

export type ReportInput = {
  from: string
  to: string
  sales: RSale[] // sale_date in range, voided included
  visits: RVisit[] // visit_date in range, not cancelled
  reEnters: number
  packages: RPackage[] // every package sold up to `to`, not cancelled
  pieceParent: Map<string, string> // gift piece id → the package it came from
  packageVisitDates: { packageId: string; date: string }[] // every package visit up to `to` (pieces included)
  staffNames: Map<string, string>
  vat: boolean
}

export type Money = { gross: number; discount: number; net: number }
export type VatSplit = { exVat: number; vat: number } | null

export type ProductRow = Money & { productId: string; name: string; qty: number }
export type CategoryRow = Money & { kind: string; qty: number; products: ProductRow[]; vat: VatSplit }
export type BillRow = {
  id: string
  receiptNo: number
  date: string
  at: string
  memberNo: string | null
  items: string
  gross: number
  discount: number
  net: number
  method: RSale['payment_method']
  promo: string | null
  staff: string
  voided: boolean
  voidReason: string | null
  voidedBy: string | null
}

export type SalesReport = {
  from: string
  to: string
  vat: boolean
  summary: Money & { bills: number; average: number; voidedBills: number; voidedAmount: number; vat: VatSplit }
  payments: { method: 'cash' | 'transfer' | 'card' | 'zero'; bills: number; amount: number }[]
  categories: CategoryRow[]
  promotions: { name: string; bills: number; discount: number }[]
  packages: {
    opening: number
    soldCount: number
    soldAmount: number
    usedVisits: number
    usedAmount: number // count packages: visits × value per visit
    timeAmount: number // unlimited passes: value of the days in this period
    forfeited: number // expired with visits/days left
    closing: number
    recognised: number // usedAmount + timeAmount + forfeited
  }
  visits: { paid: number; package: number; gift: number; reward: number; total: number; reEnter: number; noBill: number }
  audit: { firstReceipt: number | null; lastReceipt: number | null; count: number; gaps: number[]; gapCount: number }
  staff: { name: string; bills: number; net: number }[]
  daily: { date: string; bills: number; net: number; cash: number; transfer: number; card: number; discount: number; voided: number }[]
  bills: BillRow[]
}

const DAY = 86_400_000
const toMs = (d: string) => Date.parse(`${d}T00:00:00Z`)
export const addDays = (d: string, n: number) => new Date(toMs(d) + n * DAY).toISOString().slice(0, 10)
const daysBetween = (a: string, b: string) => Math.round((toMs(b) - toMs(a)) / DAY) + 1 // inclusive; ≤0 = none

export function vatSplit(net: number, on: boolean): VatSplit {
  if (!on) return null
  const exVat = Math.round((net * 100) / 107)
  return { exVat, vat: net - exVat }
}

// A bill-level discount spread over its lines in proportion to their
// totals, rounded so the shares add up to the discount exactly.
export function allocateDiscount(lines: { line_total: number }[], discount: number): number[] {
  const sub = lines.reduce((s, l) => s + l.line_total, 0)
  if (!discount || !sub) return lines.map(() => 0)
  const exact = lines.map((l) => (discount * l.line_total) / sub)
  const out = exact.map(Math.floor)
  let left = discount - out.reduce((s, v) => s + v, 0)
  const order = exact.map((v, i) => [v - Math.floor(v), i] as const).sort((a, b) => b[0] - a[0])
  for (const [, i] of order) {
    if (left <= 0) break
    out[i] += 1
    left -= 1
  }
  return out
}

// What a package is still worth at the start of day X (nothing once it has
// ended). Count packages: visits not yet used × value per visit. Unlimited
// passes: days left × value per day; one not started keeps its full value
// until its start-by date.
export function packageValueAt(p: RPackage, x: string, usedBefore: number): number {
  if (p.visitsTotal !== null) {
    const end = p.expiresOn ?? (p.startsOn ? null : p.activateBy)
    if (end && end < x) return 0
    return Math.max(0, p.visitsTotal - usedBefore) * (p.paid / p.visitsTotal)
  }
  if (!p.startsOn) return p.activateBy && p.activateBy < x ? 0 : p.paid
  const end = p.expiresOn ?? addDays(p.startsOn, p.validDays - 1)
  const from = p.startsOn > x ? p.startsOn : x
  const days = daysBetween(from, end)
  return days > 0 ? (p.paid / p.validDays) * Math.min(days, p.validDays) : 0
}

export function buildReport(input: ReportInput): SalesReport {
  const { from, to, vat } = input
  const live = input.sales.filter((s) => !s.voided_at)
  const voided = input.sales.filter((s) => s.voided_at)

  // Summary
  const gross = live.reduce((t, s) => t + s.subtotal, 0)
  const discount = live.reduce((t, s) => t + s.discount, 0)
  const net = live.reduce((t, s) => t + s.total, 0)

  // Payments ('zero' = bills of ฿0: package / free check-ins)
  const payments = (['cash', 'transfer', 'card', 'zero'] as const).map((method) => {
    const rows = live.filter((s) => (method === 'zero' ? s.total === 0 : s.total > 0 && s.payment_method === method))
    return { method, bills: rows.length, amount: rows.reduce((t, s) => t + s.total, 0) }
  })

  // Categories and products, discount spread over lines
  const cats = new Map<string, CategoryRow>()
  const prods = new Map<string, ProductRow & { kind: string }>()
  for (const s of live) {
    const shares = allocateDiscount(s.lines, s.discount)
    s.lines.forEach((l, i) => {
      const c = cats.get(l.kind) ?? { kind: l.kind, qty: 0, gross: 0, discount: 0, net: 0, products: [], vat: null }
      c.qty += l.qty
      c.gross += l.line_total
      c.discount += shares[i]
      c.net += l.line_total - shares[i]
      cats.set(l.kind, c)
      const key = `${l.kind}|${l.product_id}|${l.name}`
      const p = prods.get(key) ?? { kind: l.kind, productId: l.product_id, name: l.name, qty: 0, gross: 0, discount: 0, net: 0 }
      p.qty += l.qty
      p.gross += l.line_total
      p.discount += shares[i]
      p.net += l.line_total - shares[i]
      prods.set(key, p)
    })
  }
  for (const p of prods.values()) {
    const { kind, ...row } = p
    cats.get(kind)?.products.push(row)
  }
  const KIND_ORDER = ['day_pass', 'package', 'addon', 'merch', 'souvenir']
  const rank = (k: string) => (KIND_ORDER.includes(k) ? KIND_ORDER.indexOf(k) : 99)
  const categories = [...cats.values()]
    .map((c) => ({ ...c, vat: vatSplit(c.net, vat), products: c.products.sort((a, b) => b.net - a.net) }))
    .sort((a, b) => rank(a.kind) - rank(b.kind))

  // Promotions
  const promoMap = new Map<string, { name: string; bills: number; discount: number }>()
  for (const s of live) {
    if (!s.discount) continue
    const name = s.promo_name || '—'
    const r = promoMap.get(name) ?? { name, bills: 0, discount: 0 }
    r.bills += 1
    r.discount += s.discount
    promoMap.set(name, r)
  }

  // Packages: opening + sold − recognised − forfeited = closing
  const usedBefore = (pkgId: string, x: string) => visitCount.get(pkgId)?.filter((d) => d < x).length ?? 0
  const visitCount = new Map<string, string[]>()
  for (const v of input.packageVisitDates) {
    const id = input.pieceParent.get(v.packageId) ?? v.packageId
    const list = visitCount.get(id) ?? []
    list.push(v.date)
    visitCount.set(id, list)
  }
  let opening = 0
  let closing = 0
  let soldCount = 0
  let soldAmount = 0
  let usedVisits = 0
  let usedAmount = 0
  let timeAmount = 0
  const after = addDays(to, 1)
  for (const p of input.packages) {
    if (p.saleDate > to) continue
    const sold = p.saleDate >= from
    const open = sold ? 0 : packageValueAt(p, from, usedBefore(p.id, from))
    const close = packageValueAt(p, after, usedBefore(p.id, after))
    if (sold) {
      soldCount += 1
      soldAmount += p.paid
    }
    opening += open
    closing += close
    if (p.visitsTotal !== null) {
      const n = (visitCount.get(p.id) ?? []).filter((d) => d >= from && d <= to).length
      usedVisits += n
      usedAmount += n * (p.paid / p.visitsTotal)
    } else if (p.startsOn) {
      const end = p.expiresOn ?? addDays(p.startsOn, p.validDays - 1)
      const a = p.startsOn > from ? p.startsOn : from
      const b = end < to ? end : to
      const days = daysBetween(a, b)
      if (days > 0) timeAmount += (p.paid / p.validDays) * days
    }
  }
  const r = Math.round
  const pkgOpening = r(opening)
  const pkgClosing = r(closing)
  const pkgSold = r(soldAmount)
  const pkgUsed = r(usedAmount)
  const pkgTime = r(timeAmount)
  const forfeited = pkgOpening + pkgSold - pkgUsed - pkgTime - pkgClosing

  // Visits
  const isGift = (v: RVisit) => Boolean(v.package_id && input.pieceParent.has(v.package_id))
  const visits = {
    paid: input.visits.filter((v) => v.entry_type === 'paid').length,
    package: input.visits.filter((v) => v.entry_type === 'package' && !isGift(v)).length,
    gift: input.visits.filter((v) => v.entry_type === 'package' && isGift(v)).length,
    reward: input.visits.filter((v) => v.entry_type === 'reward').length,
    total: input.visits.length,
    reEnter: input.reEnters,
    noBill: input.visits.filter((v) => !v.sale_id).length,
  }

  // Audit: receipt numbers in this period (voided ones keep their number)
  const nos = input.sales.map((s) => s.receipt_no).sort((a, b) => a - b)
  const have = new Set(nos)
  const gaps: number[] = []
  let gapCount = 0
  if (nos.length) {
    for (let n = nos[0]; n <= nos[nos.length - 1]; n++) {
      if (!have.has(n)) {
        gapCount += 1
        if (gaps.length < 50) gaps.push(n)
      }
    }
  }

  // Staff
  const staffMap = new Map<string, { name: string; bills: number; net: number }>()
  for (const s of live) {
    const name = (s.staff_id && input.staffNames.get(s.staff_id)) || '—'
    const row = staffMap.get(name) ?? { name, bills: 0, net: 0 }
    row.bills += 1
    row.net += s.total
    staffMap.set(name, row)
  }

  // Daily
  const daily: SalesReport['daily'] = []
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const day = input.sales.filter((s) => s.sale_date === d)
    const ok = day.filter((s) => !s.voided_at)
    const by = (m: string) => ok.filter((s) => s.payment_method === m && s.total > 0).reduce((t, s) => t + s.total, 0)
    daily.push({
      date: d,
      bills: ok.length,
      net: ok.reduce((t, s) => t + s.total, 0),
      cash: by('cash'),
      transfer: by('transfer'),
      card: by('card'),
      discount: ok.reduce((t, s) => t + s.discount, 0),
      voided: day.length - ok.length,
    })
    if (daily.length > 400) break
  }

  const bills: BillRow[] = input.sales
    .slice()
    .sort((a, b) => a.receipt_no - b.receipt_no)
    .map((s) => ({
      id: s.id,
      receiptNo: s.receipt_no,
      date: s.sale_date,
      at: s.created_at,
      memberNo: s.member_no,
      items: s.lines.map((l) => `${l.name}${l.qty > 1 ? ` ×${l.qty}` : ''}`).join(', '),
      gross: s.subtotal,
      discount: s.discount,
      net: s.total,
      method: s.payment_method,
      promo: s.promo_name,
      staff: (s.staff_id && input.staffNames.get(s.staff_id)) || '—',
      voided: Boolean(s.voided_at),
      voidReason: s.void_reason,
      voidedBy: (s.voided_by && input.staffNames.get(s.voided_by)) || null,
    }))

  return {
    from,
    to,
    vat,
    summary: {
      gross,
      discount,
      net,
      bills: live.length,
      average: live.length ? Math.round(net / live.length) : 0,
      voidedBills: voided.length,
      voidedAmount: voided.reduce((t, s) => t + s.total, 0),
      vat: vatSplit(net, vat),
    },
    payments,
    categories,
    promotions: [...promoMap.values()].sort((a, b) => b.discount - a.discount),
    packages: {
      opening: pkgOpening,
      soldCount,
      soldAmount: pkgSold,
      usedVisits,
      usedAmount: pkgUsed,
      timeAmount: pkgTime,
      forfeited,
      closing: pkgClosing,
      recognised: pkgUsed + pkgTime + forfeited,
    },
    visits,
    audit: { firstReceipt: nos[0] ?? null, lastReceipt: nos.at(-1) ?? null, count: nos.length, gaps, gapCount },
    staff: [...staffMap.values()].sort((a, b) => b.net - a.net),
    daily,
    bills,
  }
}

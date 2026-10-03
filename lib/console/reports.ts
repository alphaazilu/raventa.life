import { createAdminClient } from '@/lib/supabase/admin'
import { getAppSettings } from '@/lib/console/settings'
import { allocateDiscount, buildReport, type RPackage, type RSale, type RVisit, type SalesReport } from './report-calc'

// Back Office › Reports (v0.23): reads the period's bills, visits and the
// packages behind them with the service role (callers check for an admin
// first), then hands them to report-calc. Supabase returns at most 1,000
// rows per request, so every read is paged.

const PAGE = 1000

type Q<T> = (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>

async function readAll<T>(query: Q<T>): Promise<T[]> {
  const out: T[] = []
  for (let i = 0; ; i += PAGE) {
    const { data, error } = await query(i, i + PAGE - 1)
    if (error) throw new Error(error.message)
    out.push(...(data ?? []))
    if (!data || data.length < PAGE) return out
  }
}

// Bangkok midnight of a day, as an instant (for timestamptz filters).
const bkkStart = (d: string) => new Date(`${d}T00:00:00+07:00`).toISOString()
const nextDay = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)

export async function loadSalesReport(from: string, to: string): Promise<SalesReport> {
  const db = createAdminClient()
  const settings = await getAppSettings()

  const [salesRaw, visitsRaw, reEnterRes, pkgRaw, piecesRaw, pkgVisitsRaw] = await Promise.all([
    readAll((a, b) =>
      db
        .from('sales')
        .select(
          'id, receipt_no, sale_date, created_at, member_no, subtotal, discount, total, payment_method, promo_name, staff_id, voided_at, voided_by, void_reason, sale_lines(id, product_id, kind, name, qty, unit_price, line_total)',
        )
        .gte('sale_date', from)
        .lte('sale_date', to)
        .order('receipt_no')
        .range(a, b),
    ),
    readAll((a, b) =>
      db
        .from('visits')
        .select('id, visit_date, entry_type, sale_id, package_id')
        .gte('visit_date', from)
        .lte('visit_date', to)
        .is('cancelled_at', null)
        .order('id')
        .range(a, b),
    ),
    db
      .from('staff_actions')
      .select('id', { count: 'exact', head: true })
      .eq('action', 're_enter')
      .gte('created_at', bkkStart(from))
      .lt('created_at', bkkStart(nextDay(to))),
    // Every package sold at the desk (its bill line says what it cost).
    readAll((a, b) =>
      db
        .from('member_packages')
        .select(
          'id, name, visits_total, valid_days, starts_on, expires_on, activate_by, sale_line_id, sale:sales!member_packages_sale_id_fkey(sale_date, subtotal, discount, voided_at)',
        )
        .not('sale_line_id', 'is', null)
        .is('cancelled_at', null)
        .order('id')
        .range(a, b),
    ),
    readAll((a, b) =>
      db.from('member_packages').select('id, shared_from').not('shared_from', 'is', null).order('id').range(a, b),
    ),
    readAll((a, b) =>
      db
        .from('visits')
        .select('package_id, visit_date')
        .not('package_id', 'is', null)
        .lte('visit_date', to)
        .is('cancelled_at', null)
        .order('id')
        .range(a, b),
    ),
  ])

  const sales: RSale[] = (salesRaw as Record<string, unknown>[]).map((s) => ({
    ...(s as unknown as RSale),
    lines: ((s.sale_lines as RSale['lines'] | null) ?? []).slice().sort((x, y) => x.id - y.id),
  }))

  // Each package's share of its bill after discount: the line's share of
  // the bill discount, split evenly over the units on that line.
  const lineIds = [...new Set((pkgRaw as { sale_line_id: number }[]).map((p) => p.sale_line_id))]
  const lineValue = new Map<number, number>()
  for (let i = 0; i < lineIds.length; i += 300) {
    const chunk = lineIds.slice(i, i + 300)
    const { data: lines } = await db.from('sale_lines').select('id, sale_id, qty, line_total').in('id', chunk)
    const saleIds = [...new Set((lines ?? []).map((l) => l.sale_id as string))]
    const { data: siblings } = saleIds.length
      ? await db.from('sale_lines').select('id, sale_id, line_total').in('sale_id', saleIds)
      : { data: [] }
    const { data: bills } = saleIds.length ? await db.from('sales').select('id, discount').in('id', saleIds) : { data: [] }
    const disc = new Map((bills ?? []).map((b) => [b.id as string, Number(b.discount)]))
    const bySale = new Map<string, { id: number; line_total: number }[]>()
    for (const l of siblings ?? []) {
      const list = bySale.get(l.sale_id as string) ?? []
      list.push({ id: Number(l.id), line_total: Number(l.line_total) })
      bySale.set(l.sale_id as string, list)
    }
    for (const l of lines ?? []) {
      const all = (bySale.get(l.sale_id as string) ?? []).sort((x, y) => x.id - y.id)
      const shares = allocateDiscount(all, disc.get(l.sale_id as string) ?? 0)
      const idx = all.findIndex((x) => x.id === Number(l.id))
      const net = Number(l.line_total) - (idx >= 0 ? shares[idx] : 0)
      lineValue.set(Number(l.id), net / Math.max(1, Number(l.qty)))
    }
  }

  type PkgRow = {
    id: string
    name: string
    visits_total: number | null
    valid_days: number
    starts_on: string | null
    expires_on: string | null
    activate_by: string | null
    sale_line_id: number
    sale: { sale_date: string; voided_at: string | null } | { sale_date: string; voided_at: string | null }[] | null
  }
  const packages: RPackage[] = []
  for (const p of pkgRaw as PkgRow[]) {
    const sale = Array.isArray(p.sale) ? p.sale[0] : p.sale
    if (!sale || sale.voided_at) continue
    packages.push({
      id: p.id,
      name: p.name,
      saleDate: sale.sale_date,
      paid: lineValue.get(Number(p.sale_line_id)) ?? 0,
      visitsTotal: p.visits_total,
      validDays: p.valid_days,
      startsOn: p.starts_on,
      expiresOn: p.expires_on,
      activateBy: p.activate_by,
    })
  }

  const pieceParent = new Map((piecesRaw as { id: string; shared_from: string }[]).map((p) => [p.id, p.shared_from]))

  const staffIds = new Set<string>()
  for (const s of sales) {
    if (s.staff_id) staffIds.add(s.staff_id)
    if (s.voided_by) staffIds.add(s.voided_by)
  }
  const staffNames = new Map<string, string>()
  if (staffIds.size) {
    const { data } = await db.from('profiles').select('id, first_name, last_name').in('id', [...staffIds])
    for (const p of data ?? []) staffNames.set(p.id, [p.first_name, p.last_name].filter(Boolean).join(' ') || '—')
  }

  return buildReport({
    from,
    to,
    sales,
    visits: visitsRaw as RVisit[],
    reEnters: reEnterRes.count ?? 0,
    packages,
    pieceParent,
    packageVisitDates: (pkgVisitsRaw as { package_id: string; visit_date: string }[]).map((v) => ({
      packageId: v.package_id,
      date: v.visit_date,
    })),
    staffNames,
    vat: settings.vatRegistered,
  })
}

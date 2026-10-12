import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import { isMissingTable } from '@/lib/console/db-errors'
import { DEFAULT_CASH_RULES, type CashRules, type CashSession, type CashStatus, type Counted } from '@/lib/cash'

// Cash drawer (§30, v0.31). SERVER ONLY (service role).

const COLS =
  'id, status, opened_at, opened_by, float_amount, counted_at, counted_by, counted, counted_total, expected_cash, cash_in, cash_out, transfer_total, card_total, diff, reason, closed_at, closed_by, reviewed_at, reviewed_by, review_note'

type Row = Record<string, unknown>

async function names(ids: (string | null)[]): Promise<Map<string, string>> {
  const want = [...new Set(ids.filter(Boolean) as string[])]
  if (!want.length) return new Map()
  const { data } = await createAdminClient().from('profiles').select('id, first_name, last_name, email').in('id', want)
  return new Map((data ?? []).map((p) => [p.id as string, [p.first_name, p.last_name].filter(Boolean).join(' ') || (p.email as string) || '—']))
}

const n = (v: unknown) => (v === null || v === undefined ? null : Number(v))

async function toSessions(rows: Row[]): Promise<CashSession[]> {
  const who = await names(rows.flatMap((r) => [r.opened_by, r.counted_by, r.closed_by, r.reviewed_by] as (string | null)[]))
  const name = (id: unknown) => (id ? (who.get(id as string) ?? '—') : null)
  return rows.map((r) => ({
    id: r.id as string,
    status: r.status as CashStatus,
    openedAt: r.opened_at as string,
    openedBy: name(r.opened_by) ?? '—',
    float: Number(r.float_amount),
    countedAt: (r.counted_at as string | null) ?? null,
    countedBy: name(r.counted_by),
    counted: (r.counted as Counted | null) ?? null,
    countedTotal: n(r.counted_total),
    expected: n(r.expected_cash),
    cashIn: n(r.cash_in),
    cashOut: n(r.cash_out),
    transfer: n(r.transfer_total),
    card: n(r.card_total),
    diff: n(r.diff),
    reason: (r.reason as string | null) ?? null,
    closedAt: (r.closed_at as string | null) ?? null,
    closedBy: name(r.closed_by),
    reviewedAt: (r.reviewed_at as string | null) ?? null,
    reviewedBy: name(r.reviewed_by),
    reviewNote: (r.review_note as string | null) ?? null,
  }))
}

// Float and alert size (Settings › Shop & accounts). setUp = §30 was run.
export const getCashRules = cache(async (): Promise<CashRules & { setUp: boolean }> => {
  const { data, error } = await createAdminClient().from('app_settings').select('*').eq('id', 1).maybeSingle()
  if (error || !data || !('cash_float' in data)) return { ...DEFAULT_CASH_RULES, setUp: false }
  return { float: Number(data.cash_float ?? DEFAULT_CASH_RULES.float), alert: Number(data.cash_alert ?? DEFAULT_CASH_RULES.alert), setUp: true }
})

// The drawer in use (open, or counted and waiting to confirm). null = none;
// undefined = §30 not run.
export async function getCurrentSession(): Promise<CashSession | null | undefined> {
  const { data, error } = await createAdminClient().from('cash_sessions').select(COLS).neq('status', 'closed').order('opened_at', { ascending: false }).limit(1)
  if (error) {
    if (isMissingTable(error)) return undefined
    throw error
  }
  if (!data?.length) return null
  return (await toSessions(data as Row[]))[0]
}

export async function getSession(id: string): Promise<CashSession | null> {
  const { data } = await createAdminClient().from('cash_sessions').select(COLS).eq('id', id).maybeSingle()
  return data ? (await toSessions([data as Row]))[0] : null
}

// Drawers opened between two instants (admin history), newest first.
export async function listSessions(fromIso: string, toIso: string, limit = 500): Promise<CashSession[] | null> {
  const { data, error } = await createAdminClient()
    .from('cash_sessions')
    .select(COLS)
    .gte('opened_at', fromIso)
    .lt('opened_at', toIso)
    .order('opened_at', { ascending: false })
    .limit(limit)
  if (error) {
    if (isMissingTable(error)) return null
    throw error
  }
  return toSessions((data ?? []) as Row[])
}

// Money that went through while the drawer was open: cash bills taken, cash
// bills voided in that time (whenever they were sold), and transfer/card
// totals for the admin to compare.
export async function takingsBetween(fromIso: string, toIso: string): Promise<{ cashIn: number; cashOut: number; transfer: number; card: number }> {
  const db = createAdminClient()
  const [made, voided] = await Promise.all([
    db.from('sales').select('total, payment_method, voided_at').gte('created_at', fromIso).lt('created_at', toIso),
    db.from('sales').select('total, payment_method').eq('payment_method', 'cash').gte('voided_at', fromIso).lt('voided_at', toIso),
  ])
  if (made.error) throw made.error
  if (voided.error) throw voided.error
  let cashIn = 0
  let transfer = 0
  let card = 0
  for (const s of made.data ?? []) {
    const t = Number(s.total) || 0
    if (s.payment_method === 'cash') cashIn += t
    // a transfer/card bill voided later still counts as voided here
    else if (!s.voided_at && s.payment_method === 'transfer') transfer += t
    else if (!s.voided_at && s.payment_method === 'card') card += t
  }
  const cashOut = (voided.data ?? []).reduce((sum, s) => sum + (Number(s.total) || 0), 0)
  return { cashIn, cashOut, transfer, card }
}

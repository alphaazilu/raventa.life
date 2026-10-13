import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getConsoleSession } from '@/lib/console/session'
import { BOOKINGS_PATH, canUseDesk, isAdmin } from '@/lib/auth/roles'
import { bangkokToday } from '@/lib/check-in/day'
import { bookingStats, getRules, listBookings, listCategories, listTemplates, listTypes, monthLoad } from '@/lib/console/booking'
import { addDays, gridStart, sortByCategory } from '@/lib/booking'
import { createAdminClient } from '@/lib/supabase/admin'
import { BookingsView, type BookingsTab } from '@/components/console/bookings-view'

export const metadata: Metadata = {
  title: 'การจอง | RAVENTA Back Office',
}

export const dynamic = 'force-dynamic'

const ISO = /^\d{4}-\d{2}-\d{2}$/

// Front desk › Bookings (§34, v0.35). Staff and admins.
//   (default)    month calendar (?m=YYYY-MM): people + how full, per day (v0.35.8)
//   ?tab=day     one day (?d=YYYY-MM-DD), by service and person/room — a bare ?d= also opens it
//   ?tab=list    a date range (?from&to)
//   ?tab=stats   summary for a range (admin)
//   ?tab=setup   what can be booked + no-show rules (admin)
export default async function BookingsPage({ searchParams }: { searchParams: Promise<{ tab?: string; d?: string; m?: string; from?: string; to?: string }> }) {
  const { user, role } = await getConsoleSession()
  if (!user) redirect(`/login?next=${BOOKINGS_PATH}`)
  if (!canUseDesk(role)) redirect('/account')
  const admin = isAdmin(role)
  const q = await searchParams
  const tab: BookingsTab =
    q.tab === 'list' || q.tab === 'day' ? q.tab : (q.tab === 'stats' || q.tab === 'setup') && admin ? q.tab : q.d ? 'day' : 'month'
  const today = bangkokToday()
  const day = q.d && ISO.test(q.d) ? q.d : today
  const month = q.m && /^\d{4}-\d{2}$/.test(q.m) ? `${q.m}-01` : `${today.slice(0, 7)}-01`
  const grid = { from: gridStart(month), to: addDays(gridStart(month), 41) }
  let from = q.from && ISO.test(q.from) ? q.from : tab === 'stats' ? addDays(today, -29) : today
  let to = q.to && ISO.test(q.to) ? q.to : tab === 'stats' ? today : addDays(today, 13)
  if (to < from) [from, to] = [to, from]
  if (addDays(from, 366) < to) to = addDays(from, 366)

  const types = await listTypes().catch((err) => {
    console.error('booking types failed', err)
    return null
  })
  const [bookings, rules, stats, extra, categories, templates, load] = await Promise.all([
    types && (tab === 'day' || tab === 'list') ? listBookings(tab === 'day' ? day : from, tab === 'day' ? day : to).catch(() => []) : Promise.resolve([]),
    getRules(),
    types && tab === 'stats' ? bookingStats(from, to).catch(() => null) : Promise.resolve(null),
    tab === 'setup'
      ? Promise.all([
          createAdminClient().from('profiles').select('id, first_name, last_name, email').in('role', ['staff', 'admin']).order('first_name'),
          createAdminClient().from('products').select('id, name_th, kind, is_active').order('sort'),
        ])
      : Promise.resolve(null),
    types ? listCategories().catch(() => null) : Promise.resolve(null),
    types && tab === 'setup' ? listTemplates() : Promise.resolve([]),
    types && tab === 'month' ? monthLoad(types, grid.from, grid.to).catch((err) => {
      console.error('month load failed', err)
      return null
    }) : Promise.resolve(null),
  ])
  const staff = (extra?.[0].data ?? []).map((p) => ({ id: p.id as string, name: [p.first_name, p.last_name].filter(Boolean).join(' ') || (p.email as string) || '—' }))
  const products = (extra?.[1].data ?? []).map((p) => ({ id: p.id as string, name: p.name_th as string, active: Boolean(p.is_active) }))

  return (
    <main>
      <BookingsView
        tab={tab}
        admin={admin}
        setUp={types !== null}
        types={sortByCategory(types ?? [], categories ?? [])}
        categories={categories ?? []}
        templates={templates}
        bookings={bookings ?? []}
        day={day}
        today={today}
        month={month}
        load={load}
        range={{ from, to }}
        rules={rules}
        stats={stats}
        staff={staff}
        products={products}
      />
    </main>
  )
}

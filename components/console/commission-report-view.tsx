'use client'

import { Fragment, useState } from 'react'
import { ChevronDown, ChevronRight, Download } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { formatMemberDate } from '@/lib/format-date'
import { CATALOG_PATH, REPORTS_PATH } from '@/lib/auth/roles'
import { cmCopy as t, money, rateLabel } from '@/lib/commission'
import { receiptLabel } from '@/lib/console/catalog'
import type { TimePeriod, TimePreset } from '@/lib/console/time-period'
import type { CommissionPersonTotal } from '@/lib/console/commission'
import { keepPeriod, ReportTabs } from '@/components/console/time-report-view'
import { cn } from '@/lib/utils'

// Back Office › Reports › Commission (§33, v0.34): per person for a pay
// period or month, each line it came from; voided bills left out.

const L = (th: string, en: string) => ({ th, en })
const p = {
  cycle: L('รอบเงินเดือนนี้', 'This pay period'),
  last_cycle: L('รอบที่แล้ว', 'Last pay period'),
  month: L('เดือนนี้', 'This month'),
  last_month: L('เดือนก่อน', 'Last month'),
  fromTo: L('ถึง', 'to'),
  show: L('ดู', 'Show'),
  failed: L('โหลดรายงานไม่สำเร็จ ลองใหม่อีกครั้ง', 'Couldn’t load the report — try again'),
  setUp: L('ตั้งคนรับและอัตราที่ สินค้าและราคา › ค่าคอมมิชชั่น', 'Set who earns and the rates in Products › Commission'),
}

const card = 'rounded-2xl border border-border bg-card p-4 md:p-5'
const th = 'px-3 py-2 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap'
const td = 'px-3 py-2.5 align-top'
const num = 'px-3 py-2.5 text-right tabular-nums align-top whitespace-nowrap'

export function CommissionReportView({ period, people }: { period: TimePeriod; people: CommissionPersonTotal[] | null | 'not_set_up' }) {
  const { tr, lang } = useLanguage()
  const [open, setOpen] = useState<string | null>(null)
  const date = (d: string) => formatMemberDate(`${d}T12:00:00+07:00`, lang, true) ?? d
  const span = (a: string, b: string) => (a === b ? date(a) : `${date(a)} – ${date(b)}`)
  const base = `${REPORTS_PATH}?tab=commission`
  const presets = ['cycle', 'last_cycle', 'month', 'last_month'] as const satisfies readonly TimePreset[]
  const hint: Partial<Record<TimePreset, string>> = { cycle: span(period.cycle.from, period.cycle.to), last_cycle: span(period.lastCycle.from, period.lastCycle.to) }
  const list = Array.isArray(people) ? people : []
  const sum = (k: 'bills' | 'lines' | 'base' | 'amount') => list.reduce((n, x) => n + x[k], 0)

  return (
    <div className="flex w-full flex-col gap-5 px-4 py-6 md:px-6 md:py-8 xl:px-8">
      <ReportTabs active="commission" keep={keepPeriod(period.preset, period.from, period.to)} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold md:text-3xl">{tr(t.title)}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{span(period.from, period.to)}</p>
        </div>
        {list.length > 0 && (
          <a
            href={`${REPORTS_PATH}/commission-export?from=${period.from}&to=${period.to}`}
            className="inline-flex h-10 items-center gap-2 rounded-full border border-border px-4 text-sm font-semibold hover:bg-secondary"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            {tr(t.csv)}
          </a>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {presets.map((k) => (
          <a
            key={k}
            href={`${base}&p=${k}`}
            title={hint[k]}
            className={cn(
              'rounded-full border px-3.5 py-1.5 text-sm font-semibold',
              period.preset === k ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-secondary',
            )}
          >
            {tr(p[k])}
            {hint[k] && <span className={cn('ml-1.5 text-xs font-normal', period.preset === k ? 'opacity-80' : 'text-muted-foreground')}>{hint[k]}</span>}
          </a>
        ))}
        <form action={REPORTS_PATH} className="flex flex-wrap items-center gap-2 text-sm">
          <input type="hidden" name="tab" value="commission" />
          <input type="date" name="from" defaultValue={period.from} className="h-9 rounded-full border border-border bg-background px-3" />
          <span className="text-muted-foreground">{tr(p.fromTo)}</span>
          <input type="date" name="to" defaultValue={period.to} className="h-9 rounded-full border border-border bg-background px-3" />
          <button type="submit" className="h-9 rounded-full border border-border px-4 font-semibold hover:bg-secondary">
            {tr(p.show)}
          </button>
        </form>
      </div>

      {people === 'not_set_up' ? (
        <p className="rounded-2xl bg-amber-500/15 p-4 text-sm font-semibold text-amber-800 dark:text-amber-300">{tr(t.notSetUp)}</p>
      ) : people === null ? (
        <p role="alert" className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive">
          {tr(p.failed)}
        </p>
      ) : (
        <section className={card}>
          {list.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">
              {tr(t.empty)} ·{' '}
              <a href={`${CATALOG_PATH}?tab=commission`} className="underline">
                {tr(p.setUp)}
              </a>
            </p>
          ) : (
            <div className="-mx-3 max-h-[70dvh] overflow-auto">
              <table className="w-full min-w-[34rem] text-sm">
                <thead className="sticky top-0 z-10 bg-card">
                  <tr className="border-b border-border">
                    <th className={th}>{tr(t.colName)}</th>
                    <th className={cn(th, 'text-right')}>{tr(t.colBills)}</th>
                    <th className={cn(th, 'text-right')}>{tr(t.colItems)}</th>
                    <th className={cn(th, 'text-right')}>{tr(t.colBase)}</th>
                    <th className={cn(th, 'text-right')}>{tr(t.colAmount)}</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((x) => (
                    <Fragment key={x.staffId}>
                      <tr className="cursor-pointer border-b border-border hover:bg-secondary/50" onClick={() => setOpen(open === x.staffId ? null : x.staffId)}>
                        <td className={cn(td, 'font-semibold')}>
                          <span className="inline-flex items-center gap-1">
                            {open === x.staffId ? <ChevronDown className="h-4 w-4" aria-hidden="true" /> : <ChevronRight className="h-4 w-4" aria-hidden="true" />}
                            {x.name}
                          </span>
                        </td>
                        <td className={num}>{x.bills}</td>
                        <td className={num}>{x.lines}</td>
                        <td className={num}>{x.base.toLocaleString()}</td>
                        <td className={cn(num, 'font-bold')}>{money(x.amount)}</td>
                      </tr>
                      {open === x.staffId && (
                        <tr className="border-b border-border bg-secondary/30">
                          <td colSpan={5} className="px-3 py-3">
                            <div className="overflow-x-auto">
                              <table className="w-full min-w-[36rem] text-xs">
                                <thead>
                                  <tr>
                                    <th className={th}>{tr(t.colDate)}</th>
                                    <th className={th}>{tr(t.colReceipt)}</th>
                                    <th className={th}>{tr(t.colLine)}</th>
                                    <th className={th}>{tr(t.colHow)}</th>
                                    <th className={cn(th, 'text-right')}>{tr(t.colBase)}</th>
                                    <th className={cn(th, 'text-right')}>{tr(t.colRate)}</th>
                                    <th className={cn(th, 'text-right')}>{tr(t.colAmount)}</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {x.detail.map((d) => (
                                    <tr key={d.id} className="border-t border-border/60">
                                      <td className="px-3 py-1.5 whitespace-nowrap">{date(d.saleDate)}</td>
                                      <td className="px-3 py-1.5 whitespace-nowrap">{d.receiptNo ? receiptLabel(d.receiptNo) : '—'}</td>
                                      <td className="px-3 py-1.5">
                                        {d.item}
                                        {d.qty > 1 && <span className="text-muted-foreground"> ×{d.qty}</span>}
                                      </td>
                                      <td className="px-3 py-1.5 whitespace-nowrap">{tr(t[`src_${d.source}`])}</td>
                                      <td className="px-3 py-1.5 text-right tabular-nums">{d.base.toLocaleString()}</td>
                                      <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap">{rateLabel(d.mode, d.rate, tr(t.perUnit))}</td>
                                      <td className="px-3 py-1.5 text-right font-semibold tabular-nums">{money(d.amount)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="font-bold">
                    <td className={td}>{tr(t.total)}</td>
                    <td className={num}>{sum('bills')}</td>
                    <td className={num}>{sum('lines')}</td>
                    <td className={num}>{sum('base').toLocaleString()}</td>
                    <td className={num}>{money(Math.round(sum('amount') * 100) / 100)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
          <p className="mt-3 text-xs text-muted-foreground">{tr(t.howItWorks)}</p>
        </section>
      )}
    </div>
  )
}

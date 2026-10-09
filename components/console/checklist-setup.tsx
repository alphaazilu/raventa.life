'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowDown, ArrowUp, MapPin, Pencil, Plus, Printer, RefreshCw, Trash2, X } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { Spinner } from '@/components/ui/spinner'
import { CHECKLIST_PATH } from '@/lib/auth/roles'
import { deletePoint, deleteRound, reissuePoint, savePoint, saveRound } from '@/app/console/checklist/actions'
import { checklistErrors, MAX_ITEMS, newItemId, type ChecklistItem, type CheckPoint, type CheckRound, type ItemKind, type RoundKind } from '@/lib/checklist'
import { cn } from '@/lib/utils'

type L = { th: string; en: string }
const t = {
  points: { th: 'จุดตรวจ', en: 'Check points' },
  pointsHint: { th: 'แต่ละจุดติด QR 1 แผ่น · ใส่สิ่งที่ต้องติ๊กหรือจดไว้ที่จุดนั้น', en: 'One QR sticker per point · with what to tick or note there' },
  addPoint: { th: 'เพิ่มจุดตรวจ', en: 'Add a point' },
  rounds: { th: 'รอบตรวจ', en: 'Rounds' },
  roundsHint: { th: 'รอบ = ชุดของจุดที่ต้องตรวจให้ครบในช่วงเวลา · ใครในทีมสแกนก็นับ', en: 'A round = points to check within a time window · anyone on the team counts' },
  addRound: { th: 'เพิ่มรอบตรวจ', en: 'Add a round' },
  noPoints: { th: 'ยังไม่มีจุดตรวจ — เริ่มจากเพิ่มจุด เช่น ห้องซาวน่า ห้องน้ำ สระน้ำเย็น', en: 'No points yet — start with e.g. the sauna, the washrooms, the cold pool' },
  noRounds: { th: 'ยังไม่มีรอบ — เช่น เปิดร้าน 07:00–08:00, ตรวจห้องน้ำทุก 2 ชม., ปิดร้าน', en: 'No rounds yet — e.g. opening 07:00–08:00, washrooms every 2 h, closing' },
  name: { th: 'ชื่อ', en: 'Name' },
  place: { th: 'ตำแหน่งที่ติด QR (ไม่บังคับ)', en: 'Where the sticker is (optional)' },
  items: { th: 'รายการที่ต้องตรวจ', en: 'What to check' },
  addItem: { th: 'เพิ่มรายการ', en: 'Add an item' },
  itemLabel: { th: 'เช่น ผ้าเช็ดตัวครบ / อุณหภูมิ', en: 'e.g. Towels stocked / Temperature' },
  k_check: { th: 'ติ๊ก', en: 'Tick' },
  k_number: { th: 'ตัวเลข', en: 'Number' },
  k_text: { th: 'ข้อความ', en: 'Text' },
  unit: { th: 'หน่วย', en: 'Unit' },
  min: { th: 'ต่ำสุด', en: 'Min' },
  max: { th: 'สูงสุด', en: 'Max' },
  noItemsYet: { th: 'ไม่มีรายการ = แค่สแกนยืนยันว่ามาตรวจ', en: 'No items = scanning just confirms the visit' },
  active: { th: 'เปิดใช้งาน', en: 'Active' },
  off: { th: 'ปิดอยู่', en: 'Off' },
  save: { th: 'บันทึก', en: 'Save' },
  cancel: { th: 'ยกเลิก', en: 'Cancel' },
  edit: { th: 'แก้ไข', en: 'Edit' },
  del: { th: 'ลบ', en: 'Delete' },
  confirmDel: { th: 'ลบ “{n}”?', en: 'Delete “{n}”?' },
  print: { th: 'พิมพ์ QR', en: 'Print QR' },
  printAll: { th: 'พิมพ์ QR ทุกจุด', en: 'Print all QR' },
  reissue: { th: 'ออก QR ใหม่', en: 'New QR' },
  confirmReissue: { th: 'ออก QR ใหม่ให้ “{n}”? แผ่นเดิมจะสแกนไม่ได้อีก ต้องพิมพ์แผ่นใหม่ไปติดแทน', en: 'New QR for “{n}”? The old sticker stops working — print and put up the new one' },
  itemsN: { th: '{n} รายการ', en: '{n} items' },
  kind: { th: 'ทำเมื่อไร', en: 'When' },
  daily: { th: 'วันละครั้ง ในช่วงเวลา', en: 'Once a day, in a window' },
  every: { th: 'ทุกๆ ช่วงเวลา', en: 'Repeating' },
  anytime: { th: 'ทำเมื่อต้องการ (ไม่มีเวลา)', en: 'Any time (no window)' },
  start: { th: 'เริ่ม', en: 'From' },
  end: { th: 'ถึง', en: 'Until' },
  everyLabel: { th: 'ทุก', en: 'Every' },
  days: { th: 'วัน', en: 'Days' },
  pickPoints: { th: 'จุดในรอบนี้', en: 'Points in this round' },
  pointsN: { th: '{n} จุด', en: '{n} points' },
  everyN: { th: 'ทุก {n} · {a}–{b}', en: 'Every {n} · {a}–{b}' },
} satisfies Record<string, L>

const DAYS = [
  { th: 'อา', en: 'Su' },
  { th: 'จ', en: 'Mo' },
  { th: 'อ', en: 'Tu' },
  { th: 'พ', en: 'We' },
  { th: 'พฤ', en: 'Th' },
  { th: 'ศ', en: 'Fr' },
  { th: 'ส', en: 'Sa' },
]
const EVERY = [30, 60, 90, 120, 180, 240, 360]
const card = 'rounded-2xl border border-border bg-card p-4 md:p-5'
const input = 'h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary'
const btn = 'inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold disabled:opacity-50'

const minutesText = (m: number, lang: 'th' | 'en') =>
  m % 60 === 0 ? (lang === 'th' ? `${m / 60} ชม.` : `${m / 60} h`) : lang === 'th' ? `${Math.floor(m / 60) ? `${Math.floor(m / 60)} ชม. ` : ''}${m % 60} นาที` : `${m} min`

export function ChecklistSetup({ points, rounds }: { points: CheckPoint[]; rounds: CheckRound[] }) {
  const { tr, lang } = useLanguage()
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [editPoint, setEditPoint] = useState<CheckPoint | 'new' | null>(null)
  const [editRound, setEditRound] = useState<CheckRound | 'new' | null>(null)
  const pmap = new Map(points.map((p) => [p.id, p]))

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) =>
    start(async () => {
      setError(null)
      const r = await fn()
      if (!r.ok) setError(r.error ?? 'failed')
      else {
        after?.()
        router.refresh()
      }
    })

  const schedule = (r: CheckRound) =>
    r.kind === 'anytime'
      ? tr(t.anytime)
      : `${r.kind === 'every' ? tr(t.everyN).replace('{n}', minutesText(r.everyMinutes ?? 120, lang)).replace('{a}', r.start ?? '').replace('{b}', r.end ?? '') : `${r.start}–${r.end}`} · ${
          r.days.length === 7 ? (lang === 'th' ? 'ทุกวัน' : 'every day') : r.days.map((d) => tr(DAYS[d])).join(' ')
        }`

  return (
    <>
      {error && (
        <p role="alert" className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive">
          {tr(checklistErrors[error] ?? checklistErrors.failed)}
        </p>
      )}

      <section className={card}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold">{tr(t.points)}</h2>
            <p className="text-xs text-muted-foreground">{tr(t.pointsHint)}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {points.some((p) => p.active) && (
              <a href={`${CHECKLIST_PATH}/print`} target="_blank" rel="noopener" className={cn(btn, 'border border-border hover:bg-secondary')}>
                <Printer className="h-4 w-4" aria-hidden="true" />
                {tr(t.printAll)}
              </a>
            )}
            <button type="button" onClick={() => setEditPoint('new')} className={cn(btn, 'bg-primary text-primary-foreground')}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              {tr(t.addPoint)}
            </button>
          </div>
        </div>
        {editPoint === 'new' && <PointEditor key="new" point={null} pending={pending} onCancel={() => setEditPoint(null)} onSave={(v) => run(() => savePoint(v), () => setEditPoint(null))} />}
        {points.length === 0 && editPoint !== 'new' && <p className="mt-4 rounded-xl border border-dashed border-border p-5 text-center text-sm text-muted-foreground">{tr(t.noPoints)}</p>}
        <ul className="mt-3 divide-y divide-border">
          {points.map((p) =>
            editPoint !== 'new' && editPoint?.id === p.id ? (
              <li key={p.id} className="py-2">
                <PointEditor point={p} pending={pending} onCancel={() => setEditPoint(null)} onSave={(v) => run(() => savePoint({ ...v, id: p.id }), () => setEditPoint(null))} />
              </li>
            ) : (
              <li key={p.id} className={cn('flex flex-wrap items-center gap-3 py-3', !p.active && 'opacity-60')}>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    {p.name}
                    {!p.active && <span className="ml-2 rounded-full bg-secondary px-2 py-0.5 text-[11px]">{tr(t.off)}</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {p.place && (
                      <>
                        <MapPin className="mr-0.5 inline h-3 w-3" aria-hidden="true" />
                        {p.place} ·{' '}
                      </>
                    )}
                    {p.items.length ? `${tr(t.itemsN).replace('{n}', String(p.items.length))}: ${p.items.map((i) => i.label).join(', ')}` : tr(t.noItemsYet)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {p.active && (
                    <a href={`${CHECKLIST_PATH}/print?ids=${p.id}`} target="_blank" rel="noopener" className={cn(btn, 'border border-border hover:bg-secondary')}>
                      <Printer className="h-3.5 w-3.5" aria-hidden="true" />
                      {tr(t.print)}
                    </a>
                  )}
                  <button type="button" onClick={() => setEditPoint(p)} className={cn(btn, 'border border-border hover:bg-secondary')}>
                    <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                    {tr(t.edit)}
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => window.confirm(tr(t.confirmReissue).replace('{n}', p.name)) && run(() => reissuePoint(p.id))}
                    className={cn(btn, 'border border-border hover:bg-secondary')}
                    title={tr(t.reissue)}
                  >
                    <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                    {tr(t.reissue)}
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => window.confirm(tr(t.confirmDel).replace('{n}', p.name)) && run(() => deletePoint(p.id))}
                    className={cn(btn, 'px-2.5 text-muted-foreground hover:text-destructive')}
                    aria-label={tr(t.del)}
                    title={tr(t.del)}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </li>
            ),
          )}
        </ul>
      </section>

      <section className={card}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold">{tr(t.rounds)}</h2>
            <p className="text-xs text-muted-foreground">{tr(t.roundsHint)}</p>
          </div>
          {points.length > 0 && (
            <button type="button" onClick={() => setEditRound('new')} className={cn(btn, 'bg-primary text-primary-foreground')}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              {tr(t.addRound)}
            </button>
          )}
        </div>
        {editRound === 'new' && (
          <RoundEditor key="new" round={null} points={points} pending={pending} onCancel={() => setEditRound(null)} onSave={(v) => run(() => saveRound(v), () => setEditRound(null))} />
        )}
        {rounds.length === 0 && editRound !== 'new' && <p className="mt-4 rounded-xl border border-dashed border-border p-5 text-center text-sm text-muted-foreground">{tr(t.noRounds)}</p>}
        <ul className="mt-3 divide-y divide-border">
          {rounds.map((r) =>
            editRound !== 'new' && editRound?.id === r.id ? (
              <li key={r.id} className="py-2">
                <RoundEditor round={r} points={points} pending={pending} onCancel={() => setEditRound(null)} onSave={(v) => run(() => saveRound({ ...v, id: r.id }), () => setEditRound(null))} />
              </li>
            ) : (
              <li key={r.id} className={cn('flex flex-wrap items-center gap-3 py-3', !r.active && 'opacity-60')}>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    {r.name}
                    {!r.active && <span className="ml-2 rounded-full bg-secondary px-2 py-0.5 text-[11px]">{tr(t.off)}</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">{schedule(r)}</p>
                  <p className="text-xs text-muted-foreground">
                    {tr(t.pointsN).replace('{n}', String(r.pointIds.length))}: {r.pointIds.map((id) => pmap.get(id)?.name).filter(Boolean).join(', ')}
                  </p>
                </div>
                <div className="flex gap-1.5">
                  <button type="button" onClick={() => setEditRound(r)} className={cn(btn, 'border border-border hover:bg-secondary')}>
                    <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                    {tr(t.edit)}
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => window.confirm(tr(t.confirmDel).replace('{n}', r.name)) && run(() => deleteRound(r.id))}
                    className={cn(btn, 'px-2.5 text-muted-foreground hover:text-destructive')}
                    aria-label={tr(t.del)}
                    title={tr(t.del)}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </li>
            ),
          )}
        </ul>
      </section>
    </>
  )
}

function Actions({ pending, onCancel, onSave }: { pending: boolean; onCancel: () => void; onSave: () => void }) {
  const { tr } = useLanguage()
  return (
    <div className="mt-4 flex gap-2">
      <button type="button" disabled={pending} onClick={onSave} className={cn(btn, 'h-10 bg-primary px-5 text-primary-foreground')}>
        {pending && <Spinner className="h-4 w-4" />}
        {tr(t.save)}
      </button>
      <button type="button" onClick={onCancel} className={cn(btn, 'h-10 border border-border px-5')}>
        {tr(t.cancel)}
      </button>
    </div>
  )
}

function ActiveToggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  const { tr } = useLanguage()
  return (
    <label className="flex items-center gap-2 text-sm font-semibold">
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-[var(--primary)]" />
      {tr(t.active)}
    </label>
  )
}

function PointEditor({
  point,
  pending,
  onCancel,
  onSave,
}: {
  point: CheckPoint | null
  pending: boolean
  onCancel: () => void
  onSave: (v: { name: string; place: string; items: ChecklistItem[]; active: boolean }) => void
}) {
  const { tr } = useLanguage()
  const [name, setName] = useState(point?.name ?? '')
  const [place, setPlace] = useState(point?.place ?? '')
  const [items, setItems] = useState<ChecklistItem[]>(point?.items ?? [])
  const [active, setActive] = useState(point?.active ?? true)
  const set = (i: number, patch: Partial<ChecklistItem>) => setItems(items.map((it, j) => (j === i ? { ...it, ...patch } : it)))
  const move = (i: number, d: number) => {
    const j = i + d
    if (j < 0 || j >= items.length) return
    const next = [...items]
    ;[next[i], next[j]] = [next[j], next[i]]
    setItems(next)
  }
  const numIn = (v: number | null | undefined) => (v == null ? '' : String(v))
  const toNum = (s: string) => (s.trim() === '' || !Number.isFinite(Number(s)) ? null : Number(s))

  return (
    <div className="mt-3 rounded-xl border border-primary/30 bg-background p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block font-semibold">{tr(t.name)}</span>
          <input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} className={input} autoFocus />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-semibold">{tr(t.place)}</span>
          <input value={place} maxLength={120} onChange={(e) => setPlace(e.target.value)} className={input} />
        </label>
      </div>
      <p className="mt-4 text-sm font-semibold">{tr(t.items)}</p>
      {items.length === 0 && <p className="mt-1 text-xs text-muted-foreground">{tr(t.noItemsYet)}</p>}
      <ul className="mt-2 space-y-2">
        {items.map((it, i) => (
          <li key={it.id} className="rounded-xl border border-border p-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <input value={it.label} maxLength={60} placeholder={tr(t.itemLabel)} onChange={(e) => set(i, { label: e.target.value })} className={cn(input, 'min-w-[12rem] flex-1')} />
              <select value={it.kind} onChange={(e) => set(i, { kind: e.target.value as ItemKind })} className={cn(input, 'w-auto')}>
                {(['check', 'number', 'text'] as const).map((k) => (
                  <option key={k} value={k}>
                    {tr(t[`k_${k}`])}
                  </option>
                ))}
              </select>
              <span className="flex">
                <button type="button" onClick={() => move(i, -1)} className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary" aria-label="up">
                  <ArrowUp className="h-4 w-4" aria-hidden="true" />
                </button>
                <button type="button" onClick={() => move(i, 1)} className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary" aria-label="down">
                  <ArrowDown className="h-4 w-4" aria-hidden="true" />
                </button>
                <button type="button" onClick={() => setItems(items.filter((_, j) => j !== i))} className="rounded-full p-1.5 text-muted-foreground hover:text-destructive" aria-label={tr(t.del)}>
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </span>
            </div>
            {it.kind === 'number' && (
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                {(
                  [
                    ['unit', t.unit],
                    ['min', t.min],
                    ['max', t.max],
                  ] as const
                ).map(([k, label]) => (
                  <label key={k} className="flex items-center gap-1.5">
                    <span className="text-muted-foreground">{tr(label)}</span>
                    <input
                      value={k === 'unit' ? (it.unit ?? '') : numIn(it[k])}
                      maxLength={10}
                      inputMode={k === 'unit' ? 'text' : 'decimal'}
                      onChange={(e) => set(i, k === 'unit' ? { unit: e.target.value } : { [k]: toNum(e.target.value) })}
                      className="h-8 w-20 rounded-lg border border-border bg-background px-2 outline-none focus:border-primary"
                    />
                  </label>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
      {items.length < MAX_ITEMS && (
        <button type="button" onClick={() => setItems([...items, { id: newItemId(), label: '', kind: 'check' }])} className={cn(btn, 'mt-2 border border-dashed border-border hover:bg-secondary')}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          {tr(t.addItem)}
        </button>
      )}
      <div className="mt-4">
        <ActiveToggle on={active} onChange={setActive} />
      </div>
      <Actions pending={pending} onCancel={onCancel} onSave={() => onSave({ name, place, items, active })} />
    </div>
  )
}

function RoundEditor({
  round,
  points,
  pending,
  onCancel,
  onSave,
}: {
  round: CheckRound | null
  points: CheckPoint[]
  pending: boolean
  onCancel: () => void
  onSave: (v: { name: string; kind: RoundKind; start: string | null; end: string | null; everyMinutes: number | null; days: number[]; pointIds: string[]; active: boolean }) => void
}) {
  const { tr, lang } = useLanguage()
  const [name, setName] = useState(round?.name ?? '')
  const [kind, setKind] = useState<RoundKind>(round?.kind ?? 'daily')
  const [start, setStart] = useState(round?.start ?? '08:00')
  const [end, setEnd] = useState(round?.end ?? '09:00')
  const [every, setEvery] = useState(round?.everyMinutes ?? 120)
  const [days, setDays] = useState<number[]>(round?.days ?? [0, 1, 2, 3, 4, 5, 6])
  const [picked, setPicked] = useState<string[]>(round?.pointIds ?? [])
  const [active, setActive] = useState(round?.active ?? true)
  // Keep the points in the order they're listed in Set up.
  const ordered = (ids: string[]) => points.map((p) => p.id).filter((id) => ids.includes(id))

  return (
    <div className="mt-3 rounded-xl border border-primary/30 bg-background p-4">
      <label className="block text-sm">
        <span className="mb-1 block font-semibold">{tr(t.name)}</span>
        <input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} className={input} autoFocus />
      </label>

      <p className="mt-4 text-sm font-semibold">{tr(t.kind)}</p>
      <div className="mt-1.5 flex flex-wrap gap-2">
        {(['daily', 'every', 'anytime'] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={cn('rounded-full border px-3.5 py-1.5 text-sm font-semibold', kind === k ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-secondary')}
          >
            {tr(t[k])}
          </button>
        ))}
      </div>

      {kind !== 'anytime' && (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
            {kind === 'every' && (
              <label className="flex items-center gap-2">
                {tr(t.everyLabel)}
                <select value={every} onChange={(e) => setEvery(Number(e.target.value))} className={cn(input, 'w-auto')}>
                  {EVERY.map((m) => (
                    <option key={m} value={m}>
                      {minutesText(m, lang)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="flex items-center gap-2">
              {tr(t.start)}
              <input type="time" value={start} onChange={(e) => setStart(e.target.value)} className={cn(input, 'w-auto')} />
            </label>
            <label className="flex items-center gap-2">
              {tr(t.end)}
              <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className={cn(input, 'w-auto')} />
            </label>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-1.5 text-sm">
            <span className="mr-1 font-semibold">{tr(t.days)}</span>
            {DAYS.map((d, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setDays(days.includes(i) ? days.filter((x) => x !== i) : [...days, i].sort())}
                className={cn('h-9 w-9 rounded-full border text-xs font-bold', days.includes(i) ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground')}
              >
                {tr(d)}
              </button>
            ))}
          </div>
        </>
      )}

      <p className="mt-4 text-sm font-semibold">
        {tr(t.pickPoints)} <span className="font-normal text-muted-foreground">({picked.length})</span>
      </p>
      <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
        {points.map((p) => (
          <label key={p.id} className={cn('flex items-center gap-2 rounded-xl border px-3 py-2 text-sm', picked.includes(p.id) ? 'border-primary bg-primary/5' : 'border-border', !p.active && 'opacity-60')}>
            <input
              type="checkbox"
              checked={picked.includes(p.id)}
              onChange={(e) => setPicked(ordered(e.target.checked ? [...picked, p.id] : picked.filter((x) => x !== p.id)))}
              className="h-4 w-4 accent-[var(--primary)]"
            />
            <span className="font-semibold">{p.name}</span>
            {!p.active && <span className="text-xs text-muted-foreground">({tr(t.off)})</span>}
          </label>
        ))}
      </div>
      <div className="mt-4">
        <ActiveToggle on={active} onChange={setActive} />
      </div>
      <Actions
        pending={pending}
        onCancel={onCancel}
        onSave={() =>
          onSave({ name, kind, start: kind === 'anytime' ? null : start, end: kind === 'anytime' ? null : end, everyMinutes: kind === 'every' ? every : null, days, pointIds: ordered(picked), active })
        }
      />
    </div>
  )
}

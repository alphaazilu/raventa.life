'use client'

import { useSyncExternalStore } from 'react'
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'
import { cn } from '@/lib/utils'

// Toasts (v0.38.32): short messages after an action ("Saved", "Checked in",
// an error) float over the page under the top bar and fade away, instead of
// a coloured bar that pushes the page down. Call toast() from any client
// component; <Toaster /> is mounted once in the console layout.
//
// A toast with an id replaces the one already showing with that id (e.g. the
// desk's "done" message, so a new sale doesn't stack on the last one).

export type ToastKind = 'success' | 'error' | 'info'
export type ToastInput = {
  id?: string
  kind?: ToastKind
  text: string
  sub?: string
  action?: { label: string; onClick: () => void }
  /** ms; default 3.5 s (errors 6 s). 0 = stays until closed. */
  duration?: number
}
type Item = Required<Pick<ToastInput, 'id' | 'kind' | 'text'>> & Omit<ToastInput, 'id' | 'kind' | 'text'> & { seq: number }

const MAX = 3
let items: Item[] = []
let seq = 0
const listeners = new Set<() => void>()
const timers = new Map<string, ReturnType<typeof setTimeout>>()

function emit() {
  for (const l of listeners) l()
}

export function dismissToast(id: string) {
  const t = timers.get(id)
  if (t) clearTimeout(t)
  timers.delete(id)
  if (!items.some((i) => i.id === id)) return
  items = items.filter((i) => i.id !== id)
  emit()
}

export function toast(input: ToastInput): string {
  const id = input.id ?? `t${++seq}`
  const kind = input.kind ?? 'success'
  const item: Item = { ...input, id, kind, seq: ++seq }
  items = [...items.filter((i) => i.id !== id), item].slice(-MAX)
  const old = timers.get(id)
  if (old) clearTimeout(old)
  const ms = input.duration ?? (kind === 'error' ? 6000 : 3500)
  if (ms > 0) timers.set(id, setTimeout(() => dismissToast(id), ms))
  else timers.delete(id)
  emit()
  return id
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}
const snapshot = () => items
const empty: Item[] = []

const ICON = { success: CheckCircle2, error: AlertCircle, info: Info }

export function Toaster({ closeLabel = 'Close' }: { closeLabel?: string }) {
  const list = useSyncExternalStore(subscribe, snapshot, () => empty)
  return (
    <div className="pointer-events-none fixed inset-x-3 top-16 z-[70] flex flex-col items-center gap-2 sm:inset-x-auto sm:right-4 sm:top-20 sm:items-end print:hidden">
      {/* polite for confirmations; errors are announced at once */}
      <div className="sr-only" aria-live="polite">
        {list.filter((t) => t.kind !== 'error').map((t) => t.text).join('. ')}
      </div>
      <div className="sr-only" aria-live="assertive">
        {list.filter((t) => t.kind === 'error').map((t) => t.text).join('. ')}
      </div>
      {list.map((t) => {
        const Icon = ICON[t.kind]
        return (
          <div
            key={`${t.id}-${t.seq}`}
            className={cn(
              'pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl px-4 py-3 text-sm shadow-lg ring-1 motion-safe:animate-toast-in',
              t.kind === 'error' ? 'bg-destructive text-white ring-destructive/30' : 'bg-foreground text-background ring-black/5',
            )}
          >
            <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', t.kind === 'success' && 'text-[color:var(--loading)]')} aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold leading-snug">{t.text}</p>
              {t.sub && <p className="mt-0.5 text-xs leading-snug opacity-75">{t.sub}</p>}
            </div>
            {t.action && (
              <button
                type="button"
                onClick={() => {
                  t.action!.onClick()
                }}
                className="-my-0.5 shrink-0 rounded-full border border-current/40 px-3 py-1 text-xs font-bold hover:bg-white/10"
              >
                {t.action.label}
              </button>
            )}
            <button type="button" onClick={() => dismissToast(t.id)} aria-label={closeLabel} className="-mr-1 shrink-0 rounded-full p-0.5 opacity-70 hover:opacity-100">
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )
      })}
    </div>
  )
}

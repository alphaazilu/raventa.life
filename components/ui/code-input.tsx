'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

// A 6-digit code shown one digit per box, typed into ONE invisible input
// that covers the boxes — so the keyboard, paste and iOS/Android
// "fill code from email/SMS" all just work, and nobody taps box by box.
// Used for every code in the app (email codes, LINE merge, tablet pairing).
export function CodeInput({
  value,
  onChange,
  length = 6,
  id,
  name,
  label,
  autoFocus = false,
  disabled = false,
  className,
}: {
  value: string
  onChange: (code: string) => void
  length?: number
  id?: string
  name?: string
  label?: string
  autoFocus?: boolean
  disabled?: boolean
  className?: string
}) {
  const toEnd = (el: HTMLInputElement) => {
    const n = el.value.length
    if (el.selectionStart !== n || el.selectionEnd !== n) el.setSelectionRange(n, n)
  }
  const [focused, setFocused] = useState(false)
  const ref = useRef<HTMLInputElement>(null)
  // autoFocus can fire before React is attached (server-rendered page), so
  // pick that focus up here and put the caret at the end.
  useEffect(() => {
    const el = ref.current
    if (el && document.activeElement === el) {
      setFocused(true)
      toEnd(el)
    }
  }, [])

  return (
    <div className={cn('relative', className)}>
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${length}, minmax(0, 1fr))` }} aria-hidden="true">
        {Array.from({ length }, (_, i) => {
          const digit = value[i]
          const active = focused && !disabled && (i === value.length || (i === length - 1 && value.length === length))
          return (
            <span
              key={i}
              className={cn(
                'flex h-14 items-center justify-center rounded-xl border bg-background font-display text-2xl font-extrabold text-foreground transition-colors',
                active ? 'border-primary ring-2 ring-primary/20' : digit ? 'border-foreground/30' : 'border-border',
                disabled && 'opacity-50',
              )}
            >
              {digit ?? (active ? <span className="h-6 w-0.5 animate-pulse bg-primary" /> : null)}
            </span>
          )
        })}
      </div>
      <input
        ref={ref}
        id={id}
        name={name}
        aria-label={label}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern={`[0-9]{${length}}`}
        autoFocus={autoFocus}
        disabled={disabled}
        value={value}
        onChange={(e) => {
          onChange(e.target.value.replace(/\D/g, '').slice(0, length))
        }}
        onFocus={(e) => {
          setFocused(true)
          toEnd(e.currentTarget)
        }}
        // Keep the caret after the last digit, so typing always adds at the
        // end and backspace always removes the last one.
        onSelect={(e) => toEnd(e.currentTarget)}
        onBlur={() => setFocused(false)}
        // Invisible but still the real, focusable field over the boxes (16px
        // text so iOS doesn't zoom in on focus).
        className="absolute inset-0 h-full w-full cursor-text text-base text-transparent caret-transparent opacity-0 outline-none selection:bg-transparent"
      />
    </div>
  )
}

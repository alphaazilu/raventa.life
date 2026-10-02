'use client'

import { useRef } from 'react'
import { Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'

// A search box with a clear (×) button that appears once there's text.
export function SearchInput({
  value,
  onChange,
  onClear,
  placeholder,
  clearLabel,
  className,
  inputClassName,
  autoFocus,
}: {
  value: string
  onChange: (v: string) => void
  onClear?: () => void
  placeholder: string
  clearLabel: string
  className?: string
  inputClassName?: string
  autoFocus?: boolean
}) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <span className={cn('relative block', className)}>
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <input
        ref={ref}
        type="text"
        inputMode="search"
        enterKeyHint="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        autoComplete="off"
        autoFocus={autoFocus}
        className={cn(
          'h-11 w-full rounded-full border border-border bg-background pl-10 pr-10 text-sm text-foreground outline-none focus:border-primary',
          inputClassName,
        )}
      />
      {value && (
        <button
          type="button"
          onClick={() => {
            onChange('')
            onClear?.()
            ref.current?.focus()
          }}
          aria-label={clearLabel}
          className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-muted text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </span>
  )
}

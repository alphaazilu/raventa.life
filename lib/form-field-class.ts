// Shared styling for form fields flagged as invalid by a Server Action
// response — a red border plus a soft glow, so the person's eye goes
// straight to what needs fixing without losing anything they already typed.
export function fieldClass(base: string, invalid: boolean): string {
  if (!invalid) return base
  return `${base} border-destructive ring-2 ring-destructive shadow-[0_0_12px_2px_rgba(239,68,68,0.55)]`
}

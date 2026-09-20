// Shared styling for form fields flagged as invalid by a Server Action
// response — a red border plus a soft glow, so the person's eye goes
// straight to what needs fixing without losing anything they already typed.
// Uses RAVENTA RED (--primary: #8b1e2d) rather than a generic error red,
// so the highlight stays on-brand.
export function fieldClass(base: string, invalid: boolean): string {
  if (!invalid) return base
  return `${base} border-primary ring-2 ring-primary shadow-[0_0_12px_2px_rgba(139,30,45,0.55)]`
}

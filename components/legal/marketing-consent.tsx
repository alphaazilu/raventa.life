'use client'

import { useLanguage } from '@/components/language-provider'
import { marketingConsentText } from '@/lib/legal/content'

// The optional marketing opt-in on the sign-up forms (§54, v0.42.0). Never
// required and never ticked for the person; the yes/no is recorded either way.
export function MarketingConsentCheckbox() {
  const { tr } = useLanguage()
  return (
    <label className="flex items-start gap-2.5 text-xs leading-relaxed text-muted-foreground">
      <input
        type="checkbox"
        name="acceptMarketing"
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-border text-primary focus:ring-2 focus:ring-primary"
      />
      <span>{tr(marketingConsentText)}</span>
    </label>
  )
}

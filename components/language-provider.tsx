'use client'

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import type { Lang } from '@/lib/i18n'

type Bilingual = { th: string; en: string }

type LanguageContextValue = {
  lang: Lang
  setLang: (lang: Lang) => void
  toggle: () => void
  /** pick the string for the active language from a { th, en } object */
  tr: (value: Bilingual) => string
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>('th')

  const toggle = useCallback(() => {
    setLang((prev) => (prev === 'th' ? 'en' : 'th'))
  }, [])

  const tr = useCallback((value: Bilingual) => value[lang], [lang])

  return (
    <LanguageContext.Provider value={{ lang, setLang, toggle, tr }}>{children}</LanguageContext.Provider>
  )
}

export function useLanguage() {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useLanguage must be used within a LanguageProvider')
  return ctx
}

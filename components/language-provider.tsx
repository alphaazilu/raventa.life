'use client'

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import type { Lang } from '@/lib/i18n'

type Bilingual = { th: string; en: string }

type LanguageContextValue = {
  lang: Lang
  setLang: (lang: Lang) => void
  toggle: () => void
  /** pick the string for the active language from a { th, en } object */
  tr: (value: Bilingual) => string
}

const LANG_KEY = 'rv-lang'

const LanguageContext = createContext<LanguageContextValue | null>(null)

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>('th')
  // The language picked last time on this device (v0.30). Pages render in
  // Thai first and switch after loading, so the server HTML never differs.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LANG_KEY)
      if (saved === 'en' || saved === 'th') setLangState(saved)
    } catch {}
  }, [])
  const remember = (l: Lang) => {
    try {
      localStorage.setItem(LANG_KEY, l)
    } catch {}
  }
  const setLang = useCallback((l: Lang) => {
    remember(l)
    setLangState(l)
  }, [])
  const toggle = useCallback(() => {
    setLangState((prev) => {
      const next = prev === 'th' ? 'en' : 'th'
      remember(next)
      return next
    })
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

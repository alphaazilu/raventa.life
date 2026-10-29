'use client'

import { createContext, useContext } from 'react'
import { DEFAULT_BRAND, type BrandInfo } from '@/lib/brand/info'

// The brand read in the root layout (v0.39.0), for client components:
// const brand = useBrand(). Defaults to lib/brand/config.ts outside a provider.

const BrandContext = createContext<BrandInfo>(DEFAULT_BRAND)

export function BrandProvider({ value, children }: { value: BrandInfo; children: React.ReactNode }) {
  return <BrandContext.Provider value={value}>{children}</BrandContext.Provider>
}

export function useBrand(): BrandInfo {
  return useContext(BrandContext)
}

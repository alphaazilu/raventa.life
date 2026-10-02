'use client'

import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { getBrowserClient } from '@/lib/supabase/client'

/**
 * Tracks the current Supabase auth user on the client, for UI like the
 * header's login/account link. Updates live on sign-in / sign-out.
 */
export function useSupabaseUser() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    let unsubscribe = () => {}
    void getBrowserClient().then((supabase) => {
      if (cancelled) return
      supabase.auth.getUser().then(({ data }) => {
        if (cancelled) return
        setUser(data.user)
        setLoading(false)
      })
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((_event, session) => {
        setUser(session?.user ?? null)
      })
      unsubscribe = () => subscription.unsubscribe()
    })
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  return { user, loading }
}

import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { DevicesView } from '@/components/console/devices-view'
import { createClient } from '@/lib/supabase/server'
import { DESK_PATH, isAdmin } from '@/lib/auth/roles'
import { listDevices } from './actions'

export const metadata: Metadata = {
  title: 'อุปกรณ์ | RAVENTA Back Office',
}

// Back Office → Devices. Scanning a tablet's pairing QR with a phone camera
// lands here with ?code=… already filled in.
export default async function DevicesPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/console/devices')
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (!isAdmin(me?.role)) redirect(DESK_PATH)

  const { code } = await searchParams
  const devices = await listDevices()
  return (
    <main>
      <DevicesView
        initialCode={(code ?? '').replace(/\D/g, '').slice(0, 6)}
        devices={devices.ok ? devices.data : []}
        loadError={devices.ok ? null : devices.error}
      />
    </main>
  )
}

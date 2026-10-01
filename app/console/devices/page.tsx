import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { DevicesView } from '@/components/console/devices-view'
import { getConsoleSession } from '@/lib/console/session'
import { DESK_PATH, isAdmin } from '@/lib/auth/roles'
import { listDevices } from './actions'

export const metadata: Metadata = {
  title: 'อุปกรณ์ | RAVENTA Back Office',
}

// Back Office → Devices. Scanning a tablet's pairing QR with a phone camera
// lands here with ?code=… already filled in.
export default async function DevicesPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { user, role } = await getConsoleSession()
  if (!user) redirect('/login?next=/console/devices')
  if (!isAdmin(role)) redirect(DESK_PATH)

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

import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { DevicesView } from '@/components/console/devices-view'
import { getConsoleSession } from '@/lib/console/session'
import { DESK_PATH, isAdmin } from '@/lib/auth/roles'
import { getCurrentDevice } from '@/lib/console/device'
import { listBranches } from '@/lib/console/settings'
import { listDevices } from './actions'
import { BRAND } from '@/lib/brand/config'

export const metadata: Metadata = {
  title: `อุปกรณ์ | ${BRAND.backOfficeName}`,
}

// Back Office → Devices. Scanning a tablet's pairing QR with a phone camera
// lands here with ?code=… already filled in.
export default async function DevicesPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { user, role } = await getConsoleSession()
  if (!user) redirect('/login?next=/console/devices')
  if (!isAdmin(role)) redirect(DESK_PATH)
  // Never from a counter tablet, even signed in as an admin: someone who
  // picks up an unlocked tablet mustn't be able to pair or revoke devices.
  if (await getCurrentDevice().catch(() => null)) redirect(DESK_PATH)

  const { code } = await searchParams
  const [devices, branches] = await Promise.all([listDevices(), listBranches().catch(() => null)])
  // Only worth showing the branch picker once there's more than one branch.
  const pickBranches = branches && branches.length > 1 ? branches.filter((b) => b.active) : []
  return (
    <main>
      <DevicesView
        initialCode={(code ?? '').replace(/\D/g, '').slice(0, 6)}
        devices={devices.ok ? devices.data : []}
        loadError={devices.ok ? null : devices.error}
        branches={pickBranches}
      />
    </main>
  )
}

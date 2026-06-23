import { isPortalAuthed } from '@/lib/portal/guard'
import { PortalLogin } from '@/components/portal/PortalLogin'
import { PortalShell } from '@/components/portal/PortalShell'

export const dynamic = 'force-dynamic'

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  if (!(await isPortalAuthed())) return <PortalLogin />
  return <PortalShell>{children}</PortalShell>
}

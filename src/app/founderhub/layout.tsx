import { isPortalAuthed } from '@/lib/portal/guard'
import { founderAuthMode } from '@/lib/portal/auth'
import { PortalLogin } from '@/components/portal/PortalLogin'
import { PortalShell } from '@/components/portal/PortalShell'

export const dynamic = 'force-dynamic'

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  // Read on the server: the sign-in screen can then say why it won't let you in,
  // rather than answering a missing env var with "Incorrect email or password".
  if (!(await isPortalAuthed())) return <PortalLogin mode={founderAuthMode()} />
  return <PortalShell>{children}</PortalShell>
}

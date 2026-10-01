import type { Metadata } from 'next'
import { isPortalAuthed } from '@/lib/portal/guard'
import { founderAuthMode } from '@/lib/portal/auth'
import { PortalLogin } from '@/components/portal/PortalLogin'
import { PortalShell } from '@/components/portal/PortalShell'

export const dynamic = 'force-dynamic'

/**
 * The hub can be added to a phone's Home Screen as its own app — which is what
 * lets it receive order notifications on an iPhone (see `lib/push`). The
 * manifest is scoped to /founderhub, so the customer site does not become
 * installable as the hub, and the dark icon (`apple-icon.png` beside this file)
 * tells the two apart if both are on one Home Screen.
 */
export const metadata: Metadata = {
  manifest: '/founderhub.webmanifest',
  appleWebApp: { capable: true, title: 'CHRGD Hub', statusBarStyle: 'black' },
}

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  // Read on the server: the sign-in screen can then say why it won't let you in,
  // rather than answering a missing env var with "Incorrect email or password".
  if (!(await isPortalAuthed())) return <PortalLogin mode={founderAuthMode()} />
  return <PortalShell>{children}</PortalShell>
}

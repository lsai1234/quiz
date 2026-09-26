import type { Metadata } from 'next'
import { Suspense } from 'react'
import { ConsultPage } from '@/components/consult/ConsultPage'
import { PortalLogin } from '@/components/portal/PortalLogin'
import { founderAuthMode } from '@/lib/portal/auth'
import { isPortalAuthed } from '@/lib/portal/guard'

/**
 * The Amp Consult, for founders only.
 *
 * `/quizv2` used to serve the adaptive interview on its own; it now serves the
 * consult, behind the same sign-in as the founder hub. Signed out, it shows the
 * founder login and nothing else — none of the consult's code is sent. The
 * adaptive interview itself is untouched and still reachable where customers
 * get it, on `/` (pin it with `/?quizArm=v2`).
 *
 * Whether customers see the consult on `/` is a separate switch, in the hub
 * (Settings → Quiz), and it is off by default.
 */
export const metadata: Metadata = {
  title: 'The Amp Consult · CHRGD',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

export default async function QuizV2Page() {
  if (!(await isPortalAuthed())) return <PortalLogin mode={founderAuthMode()} />
  // The page reads `?review=1`, and a search param read has to sit under a
  // Suspense boundary.
  return (
    <Suspense>
      <ConsultPage />
    </Suspense>
  )
}

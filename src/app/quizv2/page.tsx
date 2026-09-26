import type { Metadata } from 'next'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { Suspense } from 'react'
import { AMP_RIVE, ampRiveEnabled } from '@/lib/consult/ampRive'
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
 *
 * The preview runs with every AI feature on whenever the server has an OpenAI
 * key, whatever the hub's switch for customers says: founders reviewing the
 * consult should see all of it. The Founder preview panel says what's on.
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
  const aiConfigured = Boolean(process.env.OPENAI_API_KEY)
  const rive = ampRiveEnabled() && existsSync(path.join(process.cwd(), 'public', AMP_RIVE.src))
  return (
    <Suspense>
      <ConsultPage aiConfigured={aiConfigured} rive={rive} />
    </Suspense>
  )
}

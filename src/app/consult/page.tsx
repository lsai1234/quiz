import type { Metadata } from 'next'
import { ConsultPage } from '@/components/consult/ConsultPage'

/**
 * The Amp Consult on its own URL.
 *
 * Customers reach it from the third option on the hero at `/`. This is the
 * direct entrance for review and testing, kept out of the index like
 * `/quizv2` so it doesn't compete with the home page in search.
 */
export const metadata: Metadata = {
  title: 'The Amp Consult · CHRGD',
  robots: { index: false, follow: false },
}

export default function Page() {
  return <ConsultPage />
}

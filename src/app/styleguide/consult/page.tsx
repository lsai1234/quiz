import type { Metadata } from 'next'
import { ConsultWorkshop } from '@/components/consult/workshop/ConsultWorkshop'

/**
 * The Amp Consult workshop: every consult token, glyph and scene, in isolation.
 * A tool for whoever is building the consult, not a page — unlinked and out of
 * the crawl, like the rest of `/styleguide`.
 */
export const metadata: Metadata = {
  title: 'Consult workshop — CHRGD',
  robots: { index: false, follow: false },
}

export default function Page() {
  return <ConsultWorkshop />
}

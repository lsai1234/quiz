import type { Metadata } from 'next'
import { StyleguidePage } from '@/components/styleguide/StyleguidePage'

/**
 * The review surface for the design system.
 *
 * Every primitive, in every state, on one page over the real ground — so the
 * look is approved once, here, rather than forty times across three hubs while
 * they are being migrated. It is also the regression surface: when a token
 * changes, this is where you see what it did.
 *
 * Not linked from anywhere in the app and kept out of the crawl. It is a tool
 * for whoever is working on the system, not a page.
 */
export const metadata: Metadata = {
  title: 'Styleguide — CHRGD',
  robots: { index: false, follow: false },
}

export default function Page() {
  return <StyleguidePage />
}

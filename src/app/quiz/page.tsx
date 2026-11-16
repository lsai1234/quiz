import type { Metadata } from 'next'
import { ScrollExperience } from '@/components/scroll/ScrollExperience'

/**
 * The quiz. It lived at `/` until the shop took the main address; links that
 * still arrive there carrying a quiz's own parameters (`?ref=`, `?then=hub`,
 * a test view) are sent on here by `proxy.ts`.
 */
export const metadata: Metadata = {
  title: 'CHRGD | Build Your Stack',
  description: 'Discover your personalised supplement stack in 90 seconds.',
  alternates: { canonical: '/quiz' },
}

export default function Quiz() {
  return <ScrollExperience />
}

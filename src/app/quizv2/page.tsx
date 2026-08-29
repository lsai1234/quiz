import type { Metadata } from 'next'
import { QuizV2Experience } from '@/components/quiz/v2/QuizV2Experience'

/**
 * The adaptive interview, on its own URL.
 *
 * Not linked from anywhere on the customer site — which customers see is
 * decided by the experiment on `/`. This is the review and testing entrance,
 * and it is deliberately not indexed: a second URL serving the same quiz would
 * split the site's own search results against itself.
 */
export const metadata: Metadata = {
  title: 'Build your stack · CHRGD',
  robots: { index: false, follow: false },
}

export default function QuizV2Page() {
  return <QuizV2Experience />
}

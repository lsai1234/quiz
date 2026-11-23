import type { Metadata } from 'next'
import { FeedbackPage } from '@/components/hub/feedback/FeedbackPage'

export const metadata: Metadata = { title: 'Tell us what you think', robots: { index: false } }

export default function Feedback() {
  return <FeedbackPage />
}

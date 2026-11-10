import type { Metadata } from 'next'
import { ProgressPage } from '@/components/training/ProgressPage'

export const metadata: Metadata = { title: 'Your progress', robots: { index: false } }

export default function Progress() {
  return <ProgressPage />
}

import type { Metadata } from 'next'
import { BundleLandingPage } from '@/components/bundles/BundleLandingPage'
import { BIG_NIGHT_BIG_MORNING } from '@/lib/bundles'

export const metadata: Metadata = {
  title: BIG_NIGHT_BIG_MORNING.metaTitle,
  description: BIG_NIGHT_BIG_MORNING.metaDescription,
}

export default function BigNightBigMorningPage() {
  return <BundleLandingPage bundle={BIG_NIGHT_BIG_MORNING} />
}

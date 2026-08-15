import { Suspense } from 'react'
import type { Metadata } from 'next'
import { ComparePage } from '@/components/styleguide/compare/ComparePage'

/**
 * The A/B surface for the design system.
 *
 * `/styleguide` shows the parts; this shows a real screen made of them, next to
 * the same screen as it is today. It is the only artefact in the repo that can
 * answer "does this actually look better to anyone" — see the component for the
 * URL forms, including the blind one you should send to people.
 *
 * Under `/styleguide`, so it inherits the crawl exclusion in `robots.ts`.
 */
export const metadata: Metadata = {
  title: 'My Hub — design comparison',
  robots: { index: false, follow: false },
}

export default function Page() {
  // `useSearchParams` needs a boundary; the fallback is never really seen, since
  // both arms are client components that render immediately.
  return (
    <Suspense>
      <ComparePage />
    </Suspense>
  )
}

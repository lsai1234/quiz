import type { Metadata } from 'next'
import { LegalDocumentView } from '@/components/legal/LegalDocumentView'
import { getTermsDocument, missingEntityDetails } from '@/lib/legal/content'
import { syncPortalRuntime } from '@/lib/portal/store'

export const metadata: Metadata = {
  title: 'Subscription terms · CHRGD',
  description: 'What you pay, what happens when prices or products change, and how to cancel.',
}

/**
 * The terms quote the live notice period, which a founder can change in the
 * portal — so this reads the persisted pricing config first and renders per
 * request rather than being prerendered with a stale number.
 */
export const dynamic = 'force-dynamic'

export default async function TermsPage() {
  await syncPortalRuntime()
  const doc = getTermsDocument()
  const missing = missingEntityDetails()

  return (
    <LegalDocumentView
      doc={doc}
      warning={
        missing.length > 0
          ? `Not ready to publish: ${missing.join(', ')} still shows a placeholder. Fill these in before taking real payments, and have a solicitor review this page.`
          : null
      }
    />
  )
}

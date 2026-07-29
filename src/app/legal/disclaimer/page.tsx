import type { Metadata } from 'next'
import { LegalDocumentView } from '@/components/legal/LegalDocumentView'
import { getDisclaimerDocument, missingEntityDetails } from '@/lib/legal/content'

export const metadata: Metadata = {
  title: 'Health, allergens and liability · CHRGD',
  description:
    'We sell supplements, not medical advice. What that means, and why the label on the pack always wins.',
}

export default function DisclaimerPage() {
  const missing = missingEntityDetails()

  return (
    <LegalDocumentView
      doc={getDisclaimerDocument()}
      warning={
        missing.length > 0
          ? `Not ready to publish: ${missing.join(', ')} still shows a placeholder. Fill these in before taking real payments, and have a solicitor review this page.`
          : null
      }
    />
  )
}

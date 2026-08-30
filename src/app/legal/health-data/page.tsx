import type { Metadata } from 'next'
import { LegalDocumentView } from '@/components/legal/LegalDocumentView'
import { getHealthDataDocument, missingEntityDetails } from '@/lib/legal/content'

export const metadata: Metadata = {
  title: 'Using your health answers · CHRGD',
  description: 'What the safety screen does with your answer, and how to take it back.',
}

export default function HealthDataPage() {
  const missing = missingEntityDetails()

  return (
    <LegalDocumentView
      doc={getHealthDataDocument()}
      warning={
        missing.length > 0
          ? `Not ready to publish: ${missing.join(', ')} still shows a placeholder. Fill these in before taking real payments, and have a solicitor review this page.`
          : null
      }
    />
  )
}

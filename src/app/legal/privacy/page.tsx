import type { Metadata } from 'next'
import { LegalDocumentView } from '@/components/legal/LegalDocumentView'
import { getPrivacyDocument, missingEntityDetails } from '@/lib/legal/content'

export const metadata: Metadata = {
  title: 'Privacy notice · CHRGD',
  description: 'What we collect, why, how long we keep it, and how to get it back or get rid of it.',
}

/**
 * The privacy notice.
 *
 * Every place that asks for an email address links here, because UK GDPR Art. 13
 * requires the telling to happen at the point of collection rather than
 * somewhere findable afterwards. It carries the same placeholder warning as the
 * terms: a notice naming "[Registered company name]" as the data controller
 * names nobody, and a member cannot exercise a right against a placeholder.
 */
export default function PrivacyPage() {
  const doc = getPrivacyDocument()
  const missing = missingEntityDetails()

  return (
    <LegalDocumentView
      doc={doc}
      warning={
        missing.length > 0
          ? `Not ready to publish: ${missing.join(', ')} still shows a placeholder. This notice names the data controller and where to send a rights request, so fill these in before collecting a single address — and have a solicitor review it.`
          : null
      }
    />
  )
}

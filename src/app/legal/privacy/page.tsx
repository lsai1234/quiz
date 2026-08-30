import type { Metadata } from 'next'
import { LegalDocumentView } from '@/components/legal/LegalDocumentView'
import { getPrivacyDocument, missingEntityDetails } from '@/lib/legal/content'
import { AnalyticsOptOut } from '@/components/legal/AnalyticsOptOut'

export const metadata: Metadata = {
  title: 'Privacy notice · CHRGD',
  description:
    'What we collect, why, who else sees it, how long we keep it, and how to get it back or have it deleted.',
}

export default function PrivacyPage() {
  const missing = missingEntityDetails()

  return (
    <LegalDocumentView
      doc={getPrivacyDocument()}
      warning={
        missing.length > 0
          ? `Not ready to publish: ${missing.join(', ')} still shows a placeholder. A privacy notice has to name the controller and give a working contact address before it means anything — fill these in, and have a solicitor review this page.`
          : null
      }
    >
      {/* The switch beside the paragraph that explains it, rather than a strip
          floating over whatever page someone happens to be on. */}
      <section>
        <h2
          className="text-lg font-black mb-3"
          style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}
        >
          Turn usage analytics off
        </h2>
        <AnalyticsOptOut />
      </section>
    </LegalDocumentView>
  )
}

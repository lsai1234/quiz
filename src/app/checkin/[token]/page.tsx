import type { Metadata } from 'next'
import { Card, Ground } from '@/components/system'
import { CHRGDLogo } from '@/components/brand/CHRGDLogo'
import { CheckInForm } from '@/components/checkin/CheckInForm'
import { getCheckIns } from '@/lib/checkin/store'
import { getGuide } from '@/lib/guide/store'
import { checkInView } from '@/lib/checkin/view'
import { CHECKIN_COPY } from '@/lib/checkin/copy'

/**
 * Amp's check-in for one box (Option 2), from the link in each check-in email.
 * `?stop=1` is the email's "Stop these check-ins": it asks, then stops.
 */
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Check in · CHRGD',
  robots: { index: false, follow: false },
}

type Props = { params: Promise<{ token: string }>; searchParams: Promise<{ stop?: string }> }

export default async function CheckInPage({ params, searchParams }: Props) {
  const [{ token }, { stop }] = await Promise.all([params, searchParams])
  const [record, guide] = await Promise.all([getCheckIns(token), getGuide(token)])
  return (
    <Ground className="my-hub">
      <header style={{ borderBottom: '1px solid var(--edge)' }}>
        <div className="max-w-lg mx-auto flex items-center" style={{ padding: 'var(--space-3) var(--gutter)' }}>
          <CHRGDLogo markSize={20} wordClassName="text-base" />
        </div>
      </header>
      <main className="max-w-lg mx-auto" style={{ padding: 'var(--space-6) var(--gutter) var(--space-8)' }}>
        {record && guide ? (
          <CheckInForm initial={checkInView(record, guide)} stopAsked={stop === '1'} />
        ) : (
          <Card padding="roomy">
            <p style={{ color: 'var(--ink-2)', fontSize: 'var(--text-body)' }}>{CHECKIN_COPY.notFound}</p>
          </Card>
        )}
      </main>
    </Ground>
  )
}

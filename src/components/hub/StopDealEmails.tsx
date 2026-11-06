'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Button, Card, Note, buttonSurface } from '@/components/system'
import { DEALS_COPY as C } from '@/lib/deals/copy'
import { HubShell } from './HubShell'

/**
 * The stop link in a member price email. A button rather than stopping on
 * load, so a mail scanner opening the link can't stop them by accident.
 */
export function StopDealEmails({ token }: { token: string | null }) {
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'unknown'>(token ? 'idle' : 'unknown')
  const back = buttonSurface('secondary', 'md')
  return (
    <HubShell>
      <div data-stop-deal-emails>
        <Card padding="roomy">
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-title)', fontWeight: 'var(--weight-strong)', color: 'var(--ink-1)' }}>{C.stopTitle}</h1>
          {state === 'done' ? (
            <div style={{ marginTop: 'var(--space-3)' }}>
              <Note tone="positive" live="polite">
                {C.stopped}
              </Note>
            </div>
          ) : state === 'unknown' ? (
            <p style={{ marginTop: 'var(--space-3)', color: 'var(--ink-2)', fontSize: 'var(--text-body-sm)' }}>{C.stopUnknown}</p>
          ) : (
            <>
              <p style={{ marginTop: 'var(--space-3)', color: 'var(--ink-2)', fontSize: 'var(--text-body-sm)', lineHeight: 'var(--leading-body)' }}>{C.stopBody}</p>
              <div style={{ marginTop: 'var(--space-4)' }}>
                <Button
                  variant="secondary"
                  loading={state === 'busy'}
                  onClick={async () => {
                    setState('busy')
                    const res = await fetch('/api/hub/deal-emails', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) }).catch(() => null)
                    setState(res?.ok ? 'done' : 'unknown')
                  }}
                  data-stop
                >
                  {C.stopCta}
                </Button>
              </div>
            </>
          )}
          <div style={{ marginTop: 'var(--space-5)' }}>
            <Link href="/myhub" className={back.className} style={back.style}>
              Back to your hub
            </Link>
          </div>
        </Card>
      </div>
    </HubShell>
  )
}

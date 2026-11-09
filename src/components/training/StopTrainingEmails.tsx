'use client'

import Link from 'next/link'
import { useState } from 'react'
import { HubShell } from '@/components/hub/HubShell'
import { Button, Card, Note, buttonSurface } from '@/components/system'
import { TRAINING_EMAIL_COPY as C } from '@/lib/training/email-copy'
import { body, display, stack } from './styles'

/**
 * The stop link in a training email. A button rather than stopping on load,
 * so a mail scanner opening the link can't stop them by accident.
 */
export function StopTrainingEmails({ token }: { token: string | null }) {
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'unknown'>(token ? 'idle' : 'unknown')
  const back = buttonSurface('secondary', 'md')
  return (
    <HubShell>
      <div data-stop-training-emails>
        <Card padding="roomy">
          <div style={stack('var(--space-3)')}>
            <h1 style={display}>{C.stopTitle}</h1>
            {state === 'done' ? (
              <Note tone="positive" live="polite">
                {C.stopped}
              </Note>
            ) : state === 'unknown' ? (
              <p style={body}>{C.stopUnknown}</p>
            ) : (
              <>
                <p style={body}>{C.stopBody}</p>
                <div>
                  <Button
                    variant="secondary"
                    loading={state === 'busy'}
                    onClick={async () => {
                      setState('busy')
                      const res = await fetch('/api/hub/training-emails', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) }).catch(() => null)
                      setState(res?.ok ? 'done' : 'unknown')
                    }}
                    data-stop
                  >
                    {C.stopCta}
                  </Button>
                </div>
              </>
            )}
            <div>
              <Link href="/myhub/training" className={back.className} style={back.style}>
                {C.stopBack}
              </Link>
            </div>
          </div>
        </Card>
      </div>
    </HubShell>
  )
}

'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Card, buttonSurface } from '@/components/system'
import { TRAINING_COPY as C, WEEKDAY_LONG } from '@/lib/training/copy'
import { weekdayOf } from '@/lib/training/generate'
import type { TrainingState } from '@/lib/training/state'
import { nextSession, progressOf, sessionTitle } from '@/lib/training/view'

/**
 * The way into the training plan from the hub: this week's progress and the
 * next session, or the invitation to build one. Shows nothing while the plan
 * is switched off or their hub is closed.
 */
export function TrainingCard() {
  const [state, setState] = useState<TrainingState | null>(null)

  useEffect(() => {
    let live = true
    if (typeof fetch !== 'function') return
    fetch('/api/hub/training')
      .then((r) => (r.ok ? r.json() : null))
      .then((s: TrainingState | null) => live && setState(s))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [])

  if (!state?.access?.allowed) return null
  const cta = buttonSurface('primary', 'md')
  const plan = state.plan
  const next = plan ? nextSession(plan, weekdayOf(new Date())) : null
  const progress = plan ? progressOf(plan) : null

  return (
    <div data-training-card>
      <Card padding="roomy" glow="accent">
        <p
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'var(--text-micro)',
            fontWeight: 'var(--weight-strong)',
            letterSpacing: 'var(--tracking-eyebrow)',
            textTransform: 'uppercase',
            color: 'var(--accent)',
          }}
        >
          {C.hubCardTitle}
        </p>
        <p
          style={{
            color: 'var(--ink-1)',
            fontSize: 'var(--text-body)',
            fontWeight: 'var(--weight-strong)',
            marginTop: 'var(--space-2)',
            lineHeight: 'var(--leading-snug)',
          }}
        >
          {progress ? C.hubCardWeek(progress.done, progress.planned) : C.hubCardNew}
        </p>
        {next && (
          <p
            style={{
              color: 'var(--ink-2)',
              fontSize: 'var(--text-body-sm)',
              marginTop: 'var(--space-1)',
            }}
          >
            {C.hubCardNext(sessionTitle(next), WEEKDAY_LONG[next.day])}
          </p>
        )}
        <div style={{ marginTop: 'var(--space-4)' }}>
          <Link href="/myhub/training" className={cta.className} style={cta.style}>
            {plan ? C.hubCardOpen : C.hubCardStart}
          </Link>
        </div>
      </Card>
    </div>
  )
}

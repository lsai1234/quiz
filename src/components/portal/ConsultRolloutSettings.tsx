'use client'

import { useCallback, useEffect, useState } from 'react'
import { Card, Note, Segmented } from '@/components/system'
import type { ConsultMode, ConsultRollout } from '@/lib/experiments/consult'

/**
 * The Amp Consult's front door (build H11).
 *
 * Off, a third option beside the quiz, an A/B split against it, or the only
 * way in. Both doors lead to the same results page, so the split compares like
 * with like. Nothing to deploy: the next page load picks it up.
 */
export function ConsultRolloutSettings() {
  const [rollout, setRollout] = useState<ConsultRollout | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/portal/consult-rollout')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('read failed'))))
      .then((d: { rollout: ConsultRollout }) => setRollout(d.rollout))
      .catch(() => setError('Could not load the consult setting. Reload the page to try again.'))
  }, [])

  const save = useCallback(async (patch: Partial<ConsultRollout>) => {
    try {
      const res = await fetch('/api/portal/consult-rollout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rollout: patch }),
      })
      if (!res.ok) throw new Error('save failed')
      setRollout(((await res.json()) as { rollout: ConsultRollout }).rollout)
      setError(null)
    } catch {
      setError('That did not save. Nothing has changed — try again.')
    }
  }, [])

  if (error && !rollout) return <Note tone="critical" icon="alert-triangle">{error}</Note>
  if (!rollout) return <Note tone="neutral" icon="clock">Reading the consult setting…</Note>

  return (
    <Card elevation={1} padding="roomy">
      {error && <Note tone="critical" icon="alert-triangle" live="assertive">{error}</Note>}
      <h3 style={{ fontSize: 'var(--text-body)', fontWeight: 'var(--weight-strong)', color: 'var(--ink-1)' }}>
        The Amp Consult
      </h3>
      <p style={{ fontSize: 'var(--text-meta)', lineHeight: 'var(--leading-snug)', color: 'var(--ink-3)', margin: 'var(--space-1) 0 var(--space-4)' }}>
        What the first screen offers. <strong>Option</strong> shows the consult beside the two quiz tracks.{' '}
        <strong>Split</strong> shows each visitor one door — the consult or the quiz — so the two can be compared.
        Add <code>?consultArm=consult</code> or <code>?consultArm=quiz</code> to a URL to see either yourself.
      </p>
      <Segmented
        label="What the first screen offers"
        columns={4}
        value={rollout.mode}
        onChange={(mode: ConsultMode) => void save({ mode })}
        options={[
          { value: 'off', label: 'Off', sub: 'Quiz only' },
          { value: 'option', label: 'Option', sub: 'Quiz + consult' },
          { value: 'split', label: 'Split', sub: `${rollout.split}% consult` },
          { value: 'all', label: 'All', sub: 'Consult only' },
        ]}
      />
      {rollout.mode === 'split' && (
        <div style={{ marginTop: 'var(--space-5)' }}>
          <Segmented
            label="Share of visitors shown the consult"
            columns={4}
            value={rollout.split}
            onChange={(split: number) => void save({ split })}
            options={[10, 25, 50, 75].map((n) => ({ value: n, label: `${n}%` }))}
          />
        </div>
      )}
    </Card>
  )
}

'use client'

import { useCallback, useEffect, useState } from 'react'
import { Card, Note, Segmented } from '@/components/system'
import type { ConsultMode, ConsultRollout } from '@/lib/experiments/consult'
import type { ConsultFunnel, DoorFunnel } from '@/lib/analytics/consult-funnel'

/**
 * The Amp Consult's front door (build H11) and how it's doing (build H12).
 *
 * Off, a third option beside the quiz, an A/B split against it, or the only
 * way in. Both doors lead to the same results page, so the funnel underneath
 * compares like with like: started → finished → results → checkout → bought →
 * subscribed, per door, and the consult's drop-off and time per scene.
 * Nothing to deploy: the next page load picks the setting up.
 */

interface Data {
  rollout: ConsultRollout
  windowDays: number
  funnel: { consult: ConsultFunnel; quiz: DoorFunnel }
}

const pct = (n: number) => `${(n * 100).toFixed(1)}%`
const secs = (n: number | null) => (n == null ? '—' : `${n.toFixed(1)}s`)

const SCENE_NAMES: Record<string, string> = {
  goals: 'Goals',
  about: 'About you',
  training: 'Training',
  energy: 'Energy',
  sleep: 'Sleep',
  daylight: 'Daylight',
  caffeine: 'Caffeine',
  food: 'Food',
  body: 'Body',
  shelf: 'Current stack',
  review: 'Review',
  circuit: 'Circuit check',
}

export function ConsultRolloutSettings() {
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/portal/consult-rollout')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('read failed'))))
      .then((d: Data) => setData(d))
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
      setData((await res.json()) as Data)
      setError(null)
    } catch {
      setError('That did not save. Nothing has changed — try again.')
    }
  }, [])

  if (error && !data) return <Note tone="critical" icon="alert-triangle">{error}</Note>
  if (!data) return <Note tone="neutral" icon="clock">Reading the consult setting…</Note>

  const { rollout, funnel, windowDays } = data

  return (
    <div style={{ display: 'grid', gap: 'var(--space-6)' }}>
      <Card elevation={1} padding="roomy">
        {error && <Note tone="critical" icon="alert-triangle" live="assertive">{error}</Note>}
        <Heading title="The Amp Consult">
          What the first screen offers. <strong>Option</strong> shows the consult beside the two quiz tracks.{' '}
          <strong>Split</strong> shows each visitor one door — the consult or the quiz — so the two can be compared.
          Add <code>?consultArm=consult</code> or <code>?consultArm=quiz</code> to a URL to see either yourself.
        </Heading>
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
        <div style={{ marginTop: 'var(--space-5)' }}>
          <Heading title="Amp's words">
            Scripted is free and always works. AI rewords each question to suit the person — never the interaction,
            never the circuit check — and falls back to the script whenever it's slow, down or off-message. Every AI
            consult costs a little.
          </Heading>
          <Segmented
            label="Amp's words"
            columns={2}
            value={rollout.ai ? 'ai' : 'scripted'}
            onChange={(v: string) => void save({ ai: v === 'ai' })}
            options={[
              { value: 'scripted', label: 'Scripted', sub: 'No AI' },
              { value: 'ai', label: 'AI', sub: 'Reworded per person' },
            ]}
          />
        </div>
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

      <Card elevation={1} padding="roomy">
        <Heading title="Consult against the quiz">
          Sessions over the last {windowDays} days, counted once per measure. Conversion is the one that decides it, and
          it needs thousands of sessions per door before a difference means anything.
        </Heading>
        {funnel.consult.started === 0 ? (
          <Note tone="neutral" icon="info">Nobody has started the consult yet. Numbers appear here as sessions come in.</Note>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-meta)', color: 'var(--ink-2)' }}>
            <thead>
              <tr>
                <Th>Measure</Th>
                <Th align="right">Consult</Th>
                <Th align="right">Quiz</Th>
              </tr>
            </thead>
            <tbody>
              <DoorRow label="Started" c={funnel.consult.started} q={funnel.quiz.started} />
              <DoorRow label="Finished" c={funnel.consult.completed} q={funnel.quiz.completed} of={[funnel.consult.started, funnel.quiz.started]} />
              <DoorRow label="Reached the results" c={funnel.consult.reachedResults} q={funnel.quiz.reachedResults} of={[funnel.consult.started, funnel.quiz.started]} />
              <DoorRow label="Started checkout" c={funnel.consult.startedCheckout} q={funnel.quiz.startedCheckout} of={[funnel.consult.started, funnel.quiz.started]} />
              <DoorRow label="Bought" c={funnel.consult.purchased} q={funnel.quiz.purchased} of={[funnel.consult.started, funnel.quiz.started]} />
              <DoorRow label="Subscribed" c={funnel.consult.subscribed} q={funnel.quiz.subscribed} of={[funnel.consult.started, funnel.quiz.started]} />
            </tbody>
          </table>
        )}
      </Card>

      <Card elevation={1} padding="roomy">
        <Heading title="Where people leave the consult">
          Per scene: who reached it, who left before the next one, and how long it took. Seconds per touch is time on
          the scene over how many times they touched its element — high means it's fiddly, not that it's slow.
        </Heading>
        {funnel.consult.worstScene && (
          <Note tone="attention" icon="alert-triangle">
            Most lost at {SCENE_NAMES[funnel.consult.worstScene.sceneId] ?? funnel.consult.worstScene.sceneId}:{' '}
            {funnel.consult.worstScene.dropped} sessions ({pct(funnel.consult.worstScene.dropOffPct)}).
          </Note>
        )}
        {funnel.consult.scenes.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-meta)', color: 'var(--ink-2)', marginTop: 'var(--space-4)' }}>
            <thead>
              <tr>
                <Th>Scene</Th>
                <Th align="right">Reached</Th>
                <Th align="right">Left</Th>
                <Th align="right">Time</Th>
                <Th align="right">Per touch</Th>
              </tr>
            </thead>
            <tbody>
              {funnel.consult.scenes.map((s) => (
                <tr key={s.sceneId} style={{ borderTop: '1px solid var(--edge)' }}>
                  <Td>{SCENE_NAMES[s.sceneId] ?? s.sceneId}</Td>
                  <Td align="right">{s.sessions}</Td>
                  <Td align="right">{s.dropped ? pct(s.dropOffPct) : '—'}</Td>
                  <Td align="right">{secs(s.medianSeconds)}</Td>
                  <Td align="right">{secs(s.secondsPerInteraction)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {Object.keys(funnel.consult.stopped).length > 0 && (
          <p style={{ marginTop: 'var(--space-4)', fontSize: 'var(--text-meta)', color: 'var(--ink-3)' }}>
            Stopped at the circuit check:{' '}
            {Object.entries(funnel.consult.stopped)
              .map(([reason, n]) => `${n} ${reason === 'kidney-liver' ? 'kidney or liver' : reason}`)
              .join(' · ')}
          </p>
        )}
      </Card>
    </div>
  )
}

function Heading({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <h3 style={{ fontSize: 'var(--text-body)', fontWeight: 'var(--weight-strong)', color: 'var(--ink-1)' }}>{title}</h3>
      <p style={{ fontSize: 'var(--text-meta)', lineHeight: 'var(--leading-snug)', color: 'var(--ink-3)', margin: 'var(--space-1) 0 var(--space-4)' }}>
        {children}
      </p>
    </>
  )
}

function DoorRow({ label, c, q, of }: { label: string; c: number; q: number; of?: [number, number] }) {
  const fmt = (n: number, d?: number) => (d ? `${n} · ${pct(d ? n / d : 0)}` : String(n))
  return (
    <tr style={{ borderTop: '1px solid var(--edge)' }}>
      <Td>{label}</Td>
      <Td align="right">{fmt(c, of?.[0])}</Td>
      <Td align="right">{fmt(q, of?.[1])}</Td>
    </tr>
  )
}

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th style={{ textAlign: align, padding: 'var(--space-2) 0', fontWeight: 'var(--weight-body)', color: 'var(--ink-3)' }}>{children}</th>
  )
}

function Td({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return <td style={{ textAlign: align, padding: 'var(--space-2) 0', fontVariantNumeric: 'tabular-nums' }}>{children}</td>
}

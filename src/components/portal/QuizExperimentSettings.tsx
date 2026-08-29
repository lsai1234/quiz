'use client'

import { useCallback, useEffect, useState } from 'react'
import { Badge, Button, Card, Note, Segmented } from '@/components/system'
import type { QuizExperimentConfig } from '@/lib/experiments/assignment'
import { BUDGET_MAX, BUDGET_MIN, DEFAULT_QUIZ_EXPERIMENT } from '@/lib/experiments/assignment'
import type { QuizFunnel } from '@/lib/analytics/funnel'

/**
 * Which quiz customers get — and, beside it, whether the new one is any good.
 *
 * ── Why the read-out is on the same screen as the switch ────────────────────
 * A split test that has to be reasoned about somewhere else does not get
 * reasoned about. The two funnels sit under the control that created them, so
 * the question "should this still be at 50?" is answerable without leaving the
 * page.
 *
 * ── Why the numbers are shown with a sample-size warning ────────────────────
 * The failure mode of a founder-facing experiment screen is calling it early:
 * v2 is up two points on 80 sessions and it goes to 100%, and the two points
 * were noise. So the thresholds from `docs/QUIZ_V2_ADAPTIVE.md` §1.4 are printed
 * as the actual bar, and conversion is explicitly labelled as not-yet-readable
 * until it is met. It is not a lock — the founder can do what they like — but
 * they cannot say they were not told.
 */

interface SteerHealth {
  attempts: number
  used: number
  usedPct: number
  p50: number | null
  p95: number | null
  reasons: Record<string, number>
}

interface Data {
  config: QuizExperimentConfig
  windowDays: number
  arms: { v1: QuizFunnel; v2: QuizFunnel }
  steer: SteerHealth
}

/** Sessions per arm before each measure means anything. See the doc, §1.4. */
const READABLE_AT = { completion: 1500, swaps: 1900, conversion: 5400 }

const pct = (n: number) => `${(n * 100).toFixed(1)}%`

export function QuizExperimentSettings() {
  const [data, setData] = useState<Data | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/portal/quiz-experiment')
      if (!res.ok) throw new Error('could not read the setting')
      setData(await res.json())
      setError(null)
    } catch {
      setError('Could not load the experiment. Reload the page to try again.')
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const save = useCallback(async (patch: Partial<QuizExperimentConfig>) => {
    setSaving(true)
    try {
      const res = await fetch('/api/portal/quiz-experiment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: patch }),
      })
      if (!res.ok) throw new Error('save failed')
      setData(await res.json())
      setError(null)
    } catch {
      setError('That did not save. Nothing has changed — try again.')
    } finally {
      setSaving(false)
    }
  }, [])

  if (error && !data) return <Note tone="critical" icon="alert-triangle">{error}</Note>
  if (!data) return <Note tone="neutral" icon="clock">Reading the experiment…</Note>

  const { config, arms, steer, windowDays } = data
  const live = config.mode !== 'off'

  return (
    <div style={{ display: 'grid', gap: 'var(--space-6)' }}>

      {error && <Note tone="critical" icon="alert-triangle" live="assertive">{error}</Note>}

      {/* ── The switch ─────────────────────────────────────────────────── */}
      <Card elevation={1} padding="roomy">
        <Row
          title="Which quiz customers get"
          blurb="Off is the default and the kill switch: everyone gets the quiz that ships today. Changes take effect on the next page load — there is nothing to deploy."
        />
        <Segmented
          label="Which quiz customers get"
          columns={3}
          value={config.mode}
          onChange={(mode) => void save({ mode })}
          options={[
            { value: 'off', label: 'Off', sub: 'Everyone gets v1' },
            { value: 'split', label: 'Split', sub: `${config.split}% get v2` },
            { value: 'all-v2', label: 'All v2', sub: 'Everyone gets v2' },
          ]}
        />

        {config.mode === 'split' && (
          <div style={{ marginTop: 'var(--space-5)' }}>
            <Row
              title="How many get the new quiz"
              blurb="50 is the even split the experiment is designed around. Start at 10 for a day to watch the error rate, then move it up."
            />
            <Segmented
              label="Share of visitors on the new quiz"
              columns={4}
              value={config.split}
              onChange={(split) => void save({ split })}
              options={[10, 25, 50, 75].map((n) => ({ value: n, label: `${n}%` }))}
            />
          </div>
        )}
      </Card>

      {/* ── How v2 behaves ─────────────────────────────────────────────── */}
      <Card elevation={1} padding="roomy">
        <Row
          title="AI steering"
          blurb="The new quiz picks its next question itself and always can, instantly. This decides whether it also asks the model to re-rank and reword what it picked. Turning it off runs the new quiz on its own planner — which is how you find out whether the AI is earning its keep, without a code change."
        />
        <Segmented
          label="AI steering"
          columns={2}
          value={config.aiSteer ? 'on' : 'off'}
          onChange={(v) => void save({ aiSteer: v === 'on' })}
          options={[
            { value: 'on', label: 'On', sub: 'Model re-ranks and rewords' },
            { value: 'off', label: 'Off', sub: 'Planner only' },
          ]}
        />

        <div style={{ marginTop: 'var(--space-5)' }}>
          <Row
            title="How many questions it asks"
            blurb={`Including the fixed screens. The defaults (${DEFAULT_QUIZ_EXPERIMENT.budget.performance} and ${DEFAULT_QUIZ_EXPERIMENT.budget.wellbeing}) match today's quiz, so the experiment measures the questions rather than the length. The quiz can still finish early when it has heard enough.`}
          />
          <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
            <BudgetRow
              label="Performance track"
              value={config.budget.performance}
              onChange={(performance) => void save({ budget: { ...config.budget, performance } })}
            />
            <BudgetRow
              label="Wellbeing track"
              value={config.budget.wellbeing}
              onChange={(wellbeing) => void save({ budget: { ...config.budget, wellbeing } })}
            />
          </div>
        </div>
      </Card>

      {/* ── The comparison ─────────────────────────────────────────────── */}
      <Card elevation={1} padding="roomy">
        <Row
          title="How the two are doing"
          blurb={`Sessions over the last ${windowDays} days. A session counts once per measure, so backtracking cannot inflate it.`}
        />

        {arms.v2.started === 0 ? (
          <Note tone="neutral" icon="info">
            {live
              ? 'Nobody has taken the new quiz yet. Numbers appear here as sessions come in.'
              : 'The experiment is off, so only the current quiz has numbers. Switch to Split to start the comparison.'}
          </Note>
        ) : (
          <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
            <Compare
              label="Finished the quiz"
              v1={rate(arms.v1.completed, arms.v1.started)}
              v2={rate(arms.v2.completed, arms.v2.started)}
              readable={Math.min(arms.v1.started, arms.v2.started) >= READABLE_AT.completion}
              needs={READABLE_AT.completion}
              have={Math.min(arms.v1.started, arms.v2.started)}
            />
            <Compare
              label="Bought"
              v1={rate(arms.v1.purchased, arms.v1.started)}
              v2={rate(arms.v2.purchased, arms.v2.started)}
              readable={Math.min(arms.v1.started, arms.v2.started) >= READABLE_AT.conversion}
              needs={READABLE_AT.conversion}
              have={Math.min(arms.v1.started, arms.v2.started)}
            />
            <Counts label="Started" v1={arms.v1.started} v2={arms.v2.started} />
            <Counts label="Reached the results" v1={arms.v1.reachedReveal} v2={arms.v2.reachedReveal} />
            <Counts label="Reached checkout" v1={arms.v1.startedCheckout} v2={arms.v2.startedCheckout} />
          </div>
        )}
      </Card>

      {/* ── Steer health ───────────────────────────────────────────────── */}
      <Card elevation={1} padding="roomy">
        <Row
          title="AI steering, measured"
          blurb="Nothing on screen ever waits for the model, so a slow steer costs nothing but is silently doing nothing. This is where that shows up."
        />
        {steer.attempts === 0 ? (
          <Note tone="neutral" icon="info">No steer attempts recorded yet.</Note>
        ) : (
          <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
            <Counts label="Attempts" v1={steer.attempts} v2={steer.used} v1Label="tried" v2Label="landed in time" />
            <Counts
              label="Latency"
              v1={steer.p50 ?? 0}
              v2={steer.p95 ?? 0}
              v1Label="p50 ms"
              v2Label="p95 ms"
            />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', marginTop: 'var(--space-1)' }}>
              {Object.entries(steer.reasons).map(([reason, n]) => (
                <Badge key={reason} tone={reason === 'ok' ? 'positive' : 'neutral'}>
                  {reason} · {n}
                </Badge>
              ))}
            </div>
            {steer.usedPct < 0.5 && (
              <Note tone="attention" icon="alert-triangle">
                Fewer than half the steers land in time. The questions are still instant — the
                planner covers every one that misses — but the model is contributing to under half
                of them. Worth turning AI steering off and comparing.
              </Note>
            )}
          </div>
        )}
      </Card>

      <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
        <Button variant="secondary" onClick={() => void load()} disabled={saving} icon="refresh">
          Refresh
        </Button>
        <span style={{ fontSize: 'var(--text-micro)', color: 'var(--ink-3)' }}>
          {saving ? 'Saving…' : 'Saved automatically'}
        </span>
      </div>
    </div>
  )
}

const rate = (n: number, of: number) => (of > 0 ? n / of : 0)

function Row({ title, blurb }: { title: string; blurb: string }) {
  return (
    <div style={{ marginBottom: 'var(--space-3)' }}>
      <h3
        style={{
          fontSize: 'var(--text-body)',
          fontWeight: 'var(--weight-strong)',
          fontFamily: 'var(--font-display)',
          color: 'var(--ink-1)',
        }}
      >
        {title}
      </h3>
      <p
        style={{
          fontSize: 'var(--text-meta)',
          lineHeight: 'var(--leading-snug)',
          color: 'var(--ink-3)',
          marginTop: 'var(--space-1)',
          maxWidth: '46rem',
        }}
      >
        {blurb}
      </p>
    </div>
  )
}

function BudgetRow({
  label, value, onChange,
}: { label: string; value: number; onChange: (n: number) => void }) {
  const choices: number[] = []
  for (let n = BUDGET_MIN; n <= BUDGET_MAX; n += 2) choices.push(n)
  return (
    <div>
      <p
        style={{
          fontSize: 'var(--text-micro)',
          fontWeight: 'var(--weight-strong)',
          letterSpacing: 'var(--tracking-eyebrow)',
          textTransform: 'uppercase',
          color: 'var(--ink-3)',
          marginBottom: 'var(--space-2)',
        }}
      >
        {label}
      </p>
      <Segmented
        label={`${label} question budget`}
        columns="wrap"
        value={value}
        onChange={onChange}
        options={choices.map((n) => ({ value: n, label: String(n), ariaLabel: `${n} questions` }))}
      />
    </div>
  )
}

/** One measure, both arms, with an explicit "not readable yet" when the sample
 *  is too small to mean anything. */
function Compare({
  label, v1, v2, readable, needs, have,
}: {
  label: string; v1: number; v2: number
  readable: boolean; needs: number; have: number
}) {
  const delta = v2 - v1
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0,1fr) auto auto auto',
        alignItems: 'baseline',
        gap: 'var(--space-3)',
        paddingBottom: 'var(--space-3)',
        borderBottom: '1px solid var(--edge)',
      }}
    >
      <span style={{ fontSize: 'var(--text-body-sm)', color: 'var(--ink-2)' }}>{label}</span>
      <span style={{ fontSize: 'var(--text-body-sm)', color: 'var(--ink-2)', fontVariantNumeric: 'tabular-nums' }}>
        v1 {pct(v1)}
      </span>
      <span style={{ fontSize: 'var(--text-body-sm)', color: 'var(--ink-1)', fontWeight: 'var(--weight-strong)', fontVariantNumeric: 'tabular-nums' }}>
        v2 {pct(v2)}
      </span>
      {readable ? (
        <Badge tone={delta >= 0 ? 'positive' : 'critical'}>
          {delta >= 0 ? '+' : ''}{(delta * 100).toFixed(1)}pt
        </Badge>
      ) : (
        <Badge tone="neutral">{have}/{needs} to read</Badge>
      )}
    </div>
  )
}

function Counts({
  label, v1, v2, v1Label = 'v1', v2Label = 'v2',
}: { label: string; v1: number; v2: number; v1Label?: string; v2Label?: string }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0,1fr) auto auto',
        alignItems: 'baseline',
        gap: 'var(--space-3)',
      }}
    >
      <span style={{ fontSize: 'var(--text-meta)', color: 'var(--ink-3)' }}>{label}</span>
      <span style={{ fontSize: 'var(--text-meta)', color: 'var(--ink-2)', fontVariantNumeric: 'tabular-nums' }}>
        {v1Label} {v1}
      </span>
      <span style={{ fontSize: 'var(--text-meta)', color: 'var(--ink-2)', fontVariantNumeric: 'tabular-nums' }}>
        {v2Label} {v2}
      </span>
    </div>
  )
}

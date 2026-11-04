'use client'

import { useState } from 'react'
import { Button, Card, ChargeScale, Note, Segmented, buttonSurface } from '@/components/system'
import { CHECKIN_COPY } from '@/lib/checkin/copy'
import type { CheckInAnswer, Training, Using } from '@/lib/checkin/model'
import type { CheckInView } from '@/lib/checkin/view'

/**
 * Amp's check-in (Option 2): thirty seconds on the box, then their answers so
 * far and what they could change. Every value from tokens and the system's
 * own controls.
 */
const C = CHECKIN_COPY

const eyebrow = {
  fontFamily: 'var(--font-display)',
  fontSize: 'var(--text-micro)',
  fontWeight: 'var(--weight-strong)',
  letterSpacing: 'var(--tracking-eyebrow)',
  textTransform: 'uppercase' as const,
  color: 'var(--accent)',
}
const title = { fontFamily: 'var(--font-display)', fontSize: 'var(--text-title)', fontWeight: 'var(--weight-strong)', color: 'var(--ink-1)', lineHeight: 'var(--leading-tight)' }
const body = { color: 'var(--ink-2)', fontSize: 'var(--text-body-sm)', lineHeight: 'var(--leading-body)' }

export function CheckInForm({ initial, stopAsked = false }: { initial: CheckInView; stopAsked?: boolean }) {
  const [view, setView] = useState(initial)
  const [using, setUsing] = useState<Record<string, Using>>({})
  const [training, setTraining] = useState<Training | null>(null)
  const [timesWork, setTimesWork] = useState<boolean | null>(null)
  const [happy, setHappy] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function post(payload: unknown) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/checkin/${view.token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (!res.ok) throw new Error()
      setView((await res.json()) as CheckInView)
      return true
    } catch {
      setError('That didn’t save. Try again in a moment.')
      return false
    } finally {
      setBusy(false)
    }
  }

  if (stopAsked || view.stopped) {
    return (
      <Card padding="roomy">
        <h1 style={title}>{view.stopped ? C.stopped : C.stopHeading}</h1>
        {!view.stopped && (
          <>
            <p style={{ ...body, marginTop: 'var(--space-3)' }}>{C.stopBody}</p>
            <div style={{ marginTop: 'var(--space-4)' }}>
              <Button variant="secondary" loading={busy} onClick={() => void post({ stop: true })}>
                {C.stopConfirm}
              </Button>
            </div>
          </>
        )}
        {error && <Note tone="critical" live="assertive">{error}</Note>}
      </Card>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--stack)' }} data-checkin>
      <header>
        <p style={eyebrow}>Amp</p>
        <h1 style={{ ...title, fontSize: 'var(--text-display)', marginTop: 'var(--space-2)' }}>{C.heading}</h1>
        <p style={{ ...body, marginTop: 'var(--space-2)' }}>{C.sub}</p>
      </header>

      {!done ? (
        <Card padding="roomy">
          <form
            onSubmit={async (e) => {
              e.preventDefault()
              const answer: Omit<CheckInAnswer, 'at'> = { using, training, timesWork, happy }
              if (await post({ answer })) setDone(true)
            }}
            style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}
          >
            <fieldset style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <legend style={{ ...eyebrow, marginBottom: 'var(--space-3)' }}>{C.usingHeading}</legend>
              {view.products.map((p) => (
                <div key={p.id} data-checkin-product={p.id}>
                  <p style={{ color: 'var(--ink-1)', fontSize: 'var(--text-body)', fontWeight: 'var(--weight-strong)', marginBottom: 'var(--space-2)' }}>{p.short}</p>
                  <Segmented<Using>
                    label={`${p.short}: ${C.usingHeading}`}
                    columns={2}
                    value={using[p.id] ?? null}
                    onChange={(v) => setUsing((u) => ({ ...u, [p.id]: v }))}
                    options={(Object.keys(C.using) as Using[]).map((k) => ({ value: k, label: C.using[k] }))}
                  />
                </div>
              ))}
            </fieldset>

            <div>
              <p style={{ ...eyebrow, marginBottom: 'var(--space-3)' }}>{C.trainingHeading}</p>
              <Segmented<Training>
                label={C.trainingHeading}
                columns={2}
                value={training}
                onChange={setTraining}
                options={(Object.keys(C.training) as Training[]).map((k) => ({ value: k, label: C.training[k] }))}
              />
            </div>

            <div>
              <p style={{ ...eyebrow, marginBottom: 'var(--space-3)' }}>{C.timesHeading}</p>
              <Segmented<'yes' | 'no'>
                label={C.timesHeading}
                columns={2}
                value={timesWork === null ? null : timesWork ? 'yes' : 'no'}
                onChange={(v) => setTimesWork(v === 'yes')}
                options={[
                  { value: 'yes', label: C.times.yes },
                  { value: 'no', label: C.times.no },
                ]}
              />
            </div>

            <div>
              <p style={{ ...eyebrow, marginBottom: 'var(--space-3)' }}>{C.happyHeading}</p>
              <ChargeScale label={C.happyHeading} value={happy} onChange={setHappy} lowLabel={C.happyLow} highLabel={C.happyHigh} />
            </div>

            {error && <Note tone="critical" live="assertive">{error}</Note>}
            <Button type="submit" variant="primary" size="lg" fullWidth loading={busy}>
              {busy ? C.saving : C.submit}
            </Button>
          </form>
        </Card>
      ) : (
        <Results view={view} />
      )}
    </div>
  )
}

function Results({ view }: { view: CheckInView }) {
  const guide = buttonSurface('secondary', 'md')
  const account = buttonSurface('secondary', 'md')
  const reorder = buttonSurface('primary', 'md')
  return (
    <>
      <Note tone="positive" live="polite">{C.thanks}</Note>

      <Card padding="roomy" glow="accent">
        <h2 style={eyebrow}>{C.suggestionsHeading}</h2>
        {view.suggestions.length === 0 ? (
          <p style={{ ...body, marginTop: 'var(--space-3)' }}>{C.noSuggestions}</p>
        ) : (
          <ul style={{ marginTop: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            {view.suggestions.map((s) => (
              <li key={`${s.kind}-${s.productId ?? ''}`} data-suggestion={s.kind}>
                <p style={{ color: 'var(--ink-1)', fontSize: 'var(--text-body-sm)', lineHeight: 'var(--leading-body)' }}>{s.text}</p>
                {s.action && (
                  <div style={{ marginTop: 'var(--space-2)' }}>
                    {s.action.kind === 'reorder-without' && (
                      <a href={`/reorder/${view.token}?without=${encodeURIComponent(s.action.productIds.join(','))}`} className={reorder.className} style={reorder.style}>
                        {C.reorderWithout}
                      </a>
                    )}
                    {s.action.kind === 'account' && (
                      <a href="/myhub" className={account.className} style={account.style}>
                        {C.changeInAccount}
                      </a>
                    )}
                    {s.action.kind === 'guide' && (
                      <a href={`/stack-guide/${view.token}`} className={guide.className} style={guide.style}>
                        {C.openGuide}
                      </a>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        {view.plan === 'oneoff' && (
          <div style={{ marginTop: 'var(--space-4)' }}>
            <a href={`/reorder/${view.token}`} className={guide.className} style={guide.style} data-reorder>
              {C.reorderAll}
            </a>
          </div>
        )}
      </Card>

      <Card padding="roomy">
        <h2 style={eyebrow}>{C.historyHeading}</h2>
        <ol style={{ marginTop: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {[...view.answers].reverse().map((a) => (
            <li key={a.at}>
              <p style={{ color: 'var(--ink-1)', fontSize: 'var(--text-body-sm)', fontWeight: 'var(--weight-strong)' }}>
                {C.checkInOn(new Date(a.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' }))}
              </p>
              <p style={{ ...body, fontSize: 'var(--text-meta)' }}>
                {[
                  ...view.products.filter((p) => a.using[p.id]).map((p) => `${p.short}: ${C.using[a.using[p.id]].toLowerCase()}`),
                  a.training ? `${C.trainingHeading.toLowerCase()}: ${C.training[a.training].toLowerCase()}` : null,
                  a.happy ? `${a.happy}/5` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </li>
          ))}
        </ol>
        {view.nextDue && <p style={{ ...body, fontSize: 'var(--text-meta)', marginTop: 'var(--space-4)' }}>{C.nextOn(view.nextDue)}</p>}
      </Card>
    </>
  )
}

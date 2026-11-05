'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Button, Card, Note, Segmented, buttonSurface } from '@/components/system'
import { TRAINING_COPY as C } from '@/lib/training/copy'
import { body, display, eyebrow, meta, stack, strong, title } from './styles'

/**
 * The readiness check before a first plan: the standard questions, answered
 * on this screen and kept on it. Only "done, and when" goes to the server
 * (`onCleared`); a yes sends them to their GP and saves nothing.
 */
export function Readiness({ onCleared, busy }: { onCleared: () => void; busy: boolean }) {
  const [answers, setAnswers] = useState<(boolean | null)[]>(() => C.readyQuestions.map(() => null))
  const anyYes = answers.some((a) => a === true)
  const allNo = answers.every((a) => a === false)
  const back = buttonSurface('ghost', 'md')

  return (
    <div style={stack('var(--stack)')} data-readiness>
      <header>
        <p style={eyebrow}>{C.eyebrow}</p>
        <h1 style={{ ...display, marginTop: 'var(--space-2)' }}>{C.readyTitle}</h1>
        <p style={{ ...body, marginTop: 'var(--space-2)' }}>{C.readyBody}</p>
      </header>

      <Card padding="roomy">
        <ol style={stack('var(--space-5)')}>
          {C.readyQuestions.map((q, i) => (
            <li key={i} data-question={i}>
              <p
                style={{
                  ...strong,
                  fontSize: 'var(--text-body-sm)',
                  marginBottom: 'var(--space-2)',
                }}
              >
                {i + 1}. {q}
              </p>
              <Segmented<'yes' | 'no'>
                label={q}
                columns={2}
                value={answers[i] === null ? null : answers[i] ? 'yes' : 'no'}
                onChange={(v) => setAnswers((a) => a.map((x, j) => (j === i ? v === 'yes' : x)))}
                options={[
                  { value: 'no', label: C.no },
                  { value: 'yes', label: C.yes },
                ]}
              />
            </li>
          ))}
        </ol>
        <p style={{ ...meta, marginTop: 'var(--space-5)' }}>{C.readyPrivacy}</p>
      </Card>

      {anyYes ? (
        <div data-gp>
          <Card padding="roomy" glow="attention">
            <h2 style={title}>{C.gpTitle}</h2>
            <p style={{ ...body, marginTop: 'var(--space-2)' }}>{C.gpBody}</p>
            <p style={{ ...meta, marginTop: 'var(--space-3)' }}>{C.gpNothingSaved}</p>
            <div className="flex flex-wrap" style={{ gap: 'var(--space-2)', marginTop: 'var(--space-4)' }}>
              <Link href="/myhub" className={back.className} style={back.style}>
                {C.backToHub}
              </Link>
              <Button variant="secondary" loading={busy} onClick={onCleared}>
                {C.gpCleared}
              </Button>
            </div>
          </Card>
        </div>
      ) : (
        <div style={stack('var(--space-2)')}>
          {!allNo && <Note tone="neutral">{C.readyAnswerAll}</Note>}
          <Button variant="primary" size="lg" fullWidth disabled={!allNo} loading={busy} onClick={onCleared} data-ready>
            {C.readyCta}
          </Button>
        </div>
      )}
    </div>
  )
}

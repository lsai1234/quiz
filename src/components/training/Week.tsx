'use client'

import { useState } from 'react'
import { Badge, Button, Card, ChargeMeter, Note } from '@/components/system'
import { FOCUS_COPY, SPLIT_COPY, TRAINING_COPY as C, WEEKDAY_LONG, areasPhrase } from '@/lib/training/copy'
import { weekdayOf } from '@/lib/training/generate'
import type { TrainingAction, TrainingState } from '@/lib/training/state'
import { WEEKDAYS, type Session, type TrainingPlan } from '@/lib/training/types'
import { longDay, progressOf, sessionSummary, sessionTitle } from '@/lib/training/view'
import { ChangePlanSheet } from './ChangePlanSheet'
import { SessionSheet } from './SessionSheet'
import { body, display, eyebrow, meta, stack, strong } from './styles'

type Act = (a: TrainingAction) => Promise<boolean>

/**
 * The week: Monday to Sunday, today marked, each session one tap from its
 * detail and one tap from done. "Change your plan" holds the setup.
 */
export function Week({ state, plan, act, busy, error }: { state: TrainingState; plan: TrainingPlan; act: Act; busy: string | null; error: string | null }) {
  const [openId, setOpenId] = useState<string | null>(null)
  const [changing, setChanging] = useState(false)
  const today = weekdayOf(new Date())
  const { done, planned } = progressOf(plan)
  const open = plan.sessions.find((s) => s.id === openId) ?? null
  const last = plan.history[0]

  return (
    <div style={stack('var(--stack)')} data-week>
      <header>
        <p style={eyebrow}>{C.eyebrow}</p>
        <h1 style={{ ...display, marginTop: 'var(--space-2)' }}>{C.title}</h1>
        <p style={{ ...body, marginTop: 'var(--space-2)' }}>{C.intro}</p>
      </header>

      <Card padding="roomy" glow="accent">
        <div style={stack('var(--space-3)')}>
          <ChargeMeter label={C.progressLabel} value={planned ? (done / planned) * 100 : 0} showValue valueText={C.progress(done, planned)} tone="positive" />
          <div className="flex flex-wrap" style={{ gap: 'var(--space-1)' }}>
            <Badge tone="accent">{FOCUS_COPY[plan.prefs.focus].label}</Badge>
            {plan.prefs.focus !== 'mobility' && <Badge>{SPLIT_COPY[plan.prefs.split].label}</Badge>}
            <Badge>{C.minutesOption(plan.prefs.minutes)}</Badge>
          </div>
          <p style={meta}>
            {plan.source === 'ai' ? C.builtWithAi : C.builtWithRules}
            {last ? ` ${C.lastWeek(last.done, last.planned)}` : ''}
          </p>
          <div>
            <Button variant="secondary" icon="sliders" onClick={() => setChanging(true)} data-change>
              {C.changeCta}
            </Button>
          </div>
        </div>
      </Card>

      {error && (
        <Note tone="critical" live="assertive">
          {error}
        </Note>
      )}

      <ol style={stack('var(--space-4)')} aria-label={C.title}>
        {WEEKDAYS.map((d) => {
          const sessions = plan.sessions.filter((s) => s.day === d)
          const isToday = d === today
          return (
            <li key={d} data-weekday={d}>
              <div
                className="flex items-center"
                style={{
                  gap: 'var(--space-2)',
                  marginBottom: 'var(--space-2)',
                }}
              >
                <h2
                  style={{
                    ...eyebrow,
                    color: isToday ? 'var(--accent)' : 'var(--ink-2)',
                  }}
                >
                  {WEEKDAY_LONG[d]}
                </h2>
                {isToday && (
                  <Badge tone="accent" dot>
                    {C.today}
                  </Badge>
                )}
              </div>
              {sessions.length === 0 ? (
                <p style={meta}>{C.restBody}</p>
              ) : (
                <div style={stack('var(--space-2)')}>
                  {sessions.map((s) => (
                    <SessionCard key={s.id} session={s} act={act} busy={busy} onOpen={() => setOpenId(s.id)} />
                  ))}
                </div>
              )}
            </li>
          )
        })}
      </ol>

      <footer style={stack('var(--space-2)')}>
        {plan.prefs.avoid.length > 0 && <p style={meta}>{C.workingAround(areasPhrase(plan.prefs.avoid))}</p>}
        <p style={meta}>{C.notMedical}</p>
        <p style={meta}>{state.access.via === 'order' && state.access.until ? C.openUntil(longDay(state.access.until)) : C.openMonthly}</p>
      </footer>

      {open && <SessionSheet session={open} prefs={plan.prefs} tutorials={state.tutorials} act={act} busy={busy} onClose={() => setOpenId(null)} />}
      {changing && <ChangePlanSheet plan={plan} act={act} busy={busy} error={error} onClose={() => setChanging(false)} />}
    </div>
  )
}

function SessionCard({ session, act, busy, onOpen }: { session: Session; act: Act; busy: string | null; onOpen: () => void }) {
  return (
    <div data-session={session.id} data-session-type={session.type} data-done={session.done}>
      <Card padding="normal" tone={session.done ? 'positive' : undefined}>
        <div className="flex items-center justify-between" style={{ gap: 'var(--space-3)' }}>
          <div className="min-w-0">
            <p style={strong}>{sessionTitle(session)}</p>
            <p style={meta}>{sessionSummary(session)}</p>
            {session.type === 'activity' && session.suggested && (
              <div style={{ marginTop: 'var(--space-1)' }}>
                <Badge tone="info">{C.suggested}</Badge>
              </div>
            )}
          </div>
          <div className="flex shrink-0 items-center" style={{ gap: 'var(--space-2)' }}>
            <Button
              variant={session.done ? 'primary' : 'secondary'}
              size="sm"
              icon="check"
              aria-pressed={session.done}
              aria-label={`${session.done ? C.markNotDone : C.markDone}: ${sessionTitle(session)}`}
              loading={busy === `done:${session.id}`}
              disabled={busy !== null}
              onClick={() =>
                void act({
                  action: 'done',
                  sessionId: session.id,
                  done: !session.done,
                })
              }
            />
            <Button variant="secondary" size="sm" iconRight="chevron-right" onClick={onOpen} aria-label={`${C.open} ${sessionTitle(session)}`} data-open-session>
              {C.open}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}

'use client'

import { useState } from 'react'
import { Badge, Button, Card, ChargeMeter, Note, buttonSurface } from '@/components/system'
import { Icon } from '@/components/ui/Icon'
import Link from 'next/link'
import { TRAINER_COPY } from '@/lib/trainer/copy'
import type { PublicTrainer } from '@/lib/trainer/types'
import type { PlanCheck } from '@/lib/training/types'
import { FOCUS_COPY, SPLIT_COPY, TRAINING_COPY as C, WEEKDAY_LONG, WEEKDAY_SHORT, areasPhrase } from '@/lib/training/copy'
import { weekdayOf } from '@/lib/training/generate'
import type { TrainingAction, TrainingState } from '@/lib/training/state'
import { WEEKDAYS, type Session, type TrainingPlan } from '@/lib/training/types'
import { longDay, nextSession, progressOf, sessionSummary, sessionTitle } from '@/lib/training/view'
import { ChangePlanSheet } from './ChangePlanSheet'
import { BackAfterGapCard, ChangedBy, LiveCalendarCard, MeetTrainerCard, TrainingEmailsCard, WeekModeCard, backAfterGap } from './CoachingBits'
import { SessionSheet } from './SessionSheet'
import { COACHING_COPY as W } from '@/lib/training/coaching-copy'
import { body, display, eyebrow, meta, stack, strong } from './styles'

type Act = (a: TrainingAction) => Promise<boolean>

/**
 * The week: Monday to Sunday, today marked, each session one tap from its
 * detail and one tap from done. "Change your plan" holds the setup.
 */
export function Week({
  state,
  plan,
  act,
  busy,
  error,
  onStart,
}: {
  state: TrainingState
  plan: TrainingPlan
  act: Act
  busy: string | null
  error: string | null
  /** Workout mode, while the coaching tools are on. */
  onStart?: (sessionId: string) => void
}) {
  const coaching = Boolean(state.coaching?.coaching)
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

      {coaching && state.trainer && !plan.introSeen && <MeetTrainerCard trainer={state.trainer} plan={plan} act={act} busy={busy} />}

      {state.trainer && plan.check && <PlanCheckCard trainer={state.trainer} check={plan.check} />}

      {coaching && backAfterGap(plan) && <BackAfterGapCard next={nextSession(plan, today as Session['day'])} act={act} busy={busy} />}

      <Card padding="roomy" glow="accent">
        <div style={stack('var(--space-3)')}>
          <ChargeMeter label={C.progressLabel} value={planned ? (done / planned) * 100 : 0} showValue valueText={C.progress(done, planned)} tone="positive" />
          <WeekStrip plan={plan} today={today} />
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

      <Up plan={plan} today={today} onOpen={setOpenId} onStart={coaching ? onStart : undefined} />

      {coaching && <WeekModeCard plan={plan} act={act} busy={busy} />}

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
                    <SessionCard key={s.id} session={s} act={act} busy={busy} onOpen={() => setOpenId(s.id)} video={coaching && s.type === 'strength' && s.exercises.some((p) => state.videos?.[p.id])} />
                  ))}
                </div>
              )}
            </li>
          )
        })}
      </ol>

      {coaching ? (
        <>
          <LiveCalendarCard url={state.calendarUrl ?? null} act={act} busy={busy} />
          <TrainingEmailsCard plan={plan} act={act} busy={busy} />
        </>
      ) : (
        <div style={stack('var(--space-1)')}>
          <div>
            <a href="/api/hub/training/calendar" className={buttonSurface('secondary', 'sm').className} style={buttonSurface('secondary', 'sm').style} data-training-calendar>
              {C.calendar}
            </a>
          </div>
          <p style={meta}>{C.calendarNote}</p>
        </div>
      )}

      <footer style={stack('var(--space-2)')}>
        {plan.prefs.avoid.length > 0 && <p style={meta}>{C.workingAround(areasPhrase(plan.prefs.avoid))}</p>}
        <p style={meta}>{C.notMedical}</p>
        <p style={meta}>{state.access.via === 'order' && state.access.until ? C.openUntil(longDay(state.access.until)) : C.openMonthly}</p>
      </footer>

      {open && (
        <SessionSheet
          session={open}
          plan={plan}
          prefs={plan.prefs}
          tutorials={state.tutorials}
          act={act}
          busy={busy}
          onClose={() => setOpenId(null)}
          coaching={coaching}
          trainer={state.trainer}
          tips={state.tips ?? {}}
          videos={state.videos ?? {}}
          onStart={
            coaching && onStart
              ? (id) => {
                  setOpenId(null)
                  onStart(id)
                }
              : undefined
          }
        />
      )}
      {changing && <ChangePlanSheet plan={plan} act={act} busy={busy} error={error} onClose={() => setChanging(false)} />}
    </div>
  )
}

function SessionCard({ session, act, busy, onOpen, video = false }: { session: Session; act: Act; busy: string | null; onOpen: () => void; video?: boolean }) {
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
            {session.type === 'strength' && (session.lighter || session.changedBy || video) && (
              <div className="flex flex-wrap" style={{ marginTop: 'var(--space-1)', gap: 'var(--space-1)' }}>
                {session.lighter && <Badge tone="attention">{W.lighterBadge}</Badge>}
                {session.changedBy && <ChangedBy change={session.changedBy} />}
                {video && (
                  <span aria-label="Has video" style={{ color: 'var(--accent)', display: 'inline-flex' }}>
                    <Icon name="play" size={14} />
                  </span>
                )}
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

/** The one next thing: today's session, or the next one, a tap from starting. */
function Up({ plan, today, onOpen, onStart }: { plan: TrainingPlan; today: number; onOpen: (id: string) => void; onStart?: (id: string) => void }) {
  const next = nextSession(plan, today as Session['day'])
  if (!next) return plan.sessions.every((s) => s.done) ? <Note tone="positive">{C.allDone}</Note> : <Note tone="neutral">{C.weekLeft}</Note>
  const isToday = next.day === today
  return (
    <div data-up={next.id}>
      <Card padding="normal" tone={isToday ? 'accent' : undefined}>
        <div className="flex items-center justify-between" style={{ gap: 'var(--space-3)' }}>
          <div className="min-w-0">
            <p style={eyebrow}>{isToday ? C.todayTitle : C.nextTitle(WEEKDAY_LONG[next.day])}</p>
            <p style={{ ...strong, marginTop: 'var(--space-1)' }}>{sessionTitle(next)}</p>
            <p style={meta}>{sessionSummary(next)}</p>
          </div>
          {onStart && next.type === 'strength' ? (
            <div className="flex shrink-0 flex-col items-end" style={{ gap: 'var(--space-2)' }}>
              <Button variant="primary" icon="play" onClick={() => onStart(next.id)} data-start-workout>
                {W.start}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => onOpen(next.id)} data-start>
                {C.open}
              </Button>
            </div>
          ) : (
            <Button variant="primary" iconRight="chevron-right" onClick={() => onOpen(next.id)} data-start>
              {C.start}
            </Button>
          )}
        </div>
      </Card>
    </div>
  )
}

/**
 * The week at a glance, as the reveal drew it before they bought: a block on
 * each day with a session, filled once it's done, today's day lit. The list
 * under the card says the same in words, so this is decoration to a reader.
 */
function WeekStrip({ plan, today }: { plan: TrainingPlan; today: number }) {
  return (
    <div className="grid grid-cols-7" style={{ gap: 'var(--space-1)' }} aria-hidden data-week-strip>
      {WEEKDAYS.map((d) => {
        const sessions = plan.sessions.filter((s) => s.day === d)
        const strength = sessions.some((s) => s.type === 'strength')
        const allDone = sessions.length > 0 && sessions.every((s) => s.done)
        const ground = allDone
          ? { background: 'var(--fill-positive)', color: 'var(--ink-on-accent)' }
          : strength
            ? { background: 'var(--fill-accent)', color: 'var(--ink-on-accent)', boxShadow: '0 var(--space-1) var(--space-3) calc(var(--space-1) * -1) var(--accent-glow)' }
            : sessions.length
              ? { border: '1.5px solid var(--accent-line)', color: 'var(--accent)' }
              : { background: 'var(--surface-1)' }
        return (
          <div key={d} className="flex flex-col items-center" style={{ gap: 'var(--space-1)' }}>
            <span style={{ ...meta, fontSize: 'var(--text-micro)', fontWeight: 'var(--weight-strong)', color: d === today ? 'var(--accent)' : 'var(--ink-3)' }}>
              {WEEKDAY_SHORT[d].charAt(0)}
            </span>
            <span
              className="flex w-full items-center justify-center"
              style={{
                height: 'var(--space-8)',
                borderRadius: 'var(--radius-chip)',
                outline: d === today ? '1.5px solid var(--accent)' : 'none',
                outlineOffset: 2,
                ...ground,
              }}
            >
              {sessions.length > 0 && <Icon name={allDone ? 'check' : strength ? 'dumbbell' : 'activity'} size={13} />}
            </span>
          </div>
        )
      })}
    </div>
  )
}

/**
 * The trainer's check on this plan: waiting (start anyway, ask anything), or
 * checked, by name. Only while the trainer checks plans.
 */
function PlanCheckCard({ trainer, check }: { trainer: PublicTrainer; check: PlanCheck }) {
  const checked = check.state === 'checked'
  const ask = buttonSurface('ghost', 'sm')
  return (
    <div data-plan-check={check.state}>
      <Card padding="normal" tone={checked ? 'positive' : 'info'}>
        <div className="flex items-start" style={{ gap: 'var(--space-3)' }}>
          <span
            aria-hidden
            className="inline-flex shrink-0 items-center justify-center"
            style={{
              width: 'var(--space-8)',
              height: 'var(--space-8)',
              borderRadius: 'var(--radius-pill)',
              background: checked ? 'var(--fill-positive)' : 'var(--fill-accent)',
              color: 'var(--ink-on-accent)',
            }}
          >
            <Icon name={checked ? 'check' : 'clock'} size={16} />
          </span>
          <div className="min-w-0" style={{ flex: 1 }}>
            <p style={strong}>{checked ? TRAINER_COPY.planChecked(trainer.name) : TRAINER_COPY.planChecking(trainer.name)}</p>
            <p style={{ ...body, marginTop: 'var(--space-1)' }}>
              {checked ? TRAINER_COPY.planCheckedLine(trainer.name) : TRAINER_COPY.planCheckingLine(trainer.name, trainer.replyHours)}
            </p>
            <div style={{ marginTop: 'var(--space-2)' }}>
              <Link href={`/myhub/trainer?about=${encodeURIComponent(TRAINER_COPY.planNoteAbout)}`} className={ask.className} style={ask.style} data-ask-plan>
                {TRAINER_COPY.askAboutPlan(trainer.name)} →
              </Link>
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}

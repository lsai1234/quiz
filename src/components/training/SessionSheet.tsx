'use client'

import { useEffect, useRef, useState } from 'react'
import { Badge, Button, Input, Modal, ModalBody, ModalFooter, ModalHeader, Note, OptionRow, Select, buttonSurface } from '@/components/system'
import { INTENSITY_COPY, MUSCLE_COPY, TRAINING_COPY as C, WEEKDAY_LONG, areasPhrase } from '@/lib/training/copy'
import { activityConflicts, alternativesFor } from '@/lib/training/generate'
import { ACTIVITIES, exerciseById } from '@/lib/training/library'
import type { TrainingAction } from '@/lib/training/state'
import { WEEKDAYS, type ActivitySession, type PlannedExercise, type Session, type StrengthSession, type TrainingPlan, type TrainingPrefs, type Weekday } from '@/lib/training/types'
import { lastTime, nextStep, todays, type NextStep } from '@/lib/training/progress'
import { doseLine, sessionSummary, sessionTitle } from '@/lib/training/view'
import { body, eyebrow, meta, stack, strong } from './styles'
import Link from 'next/link'
import { useOfferSettings } from '@/hooks/useOfferSettings'
import { trainerLive } from '@/lib/offer/settings'
import { TRAINER_COPY } from '@/lib/trainer/copy'

type Act = (a: TrainingAction) => Promise<boolean>

/**
 * One session, opened: its warm-up and exercises with sets to tick, or an
 * activity and how to pace it; and everything to change about it. Tapping
 * an exercise opens its detail in the same sheet, with a way back.
 */
export function SessionSheet({
  session,
  plan,
  prefs,
  tutorials,
  act,
  busy,
  onClose,
}: {
  session: Session
  plan: TrainingPlan
  prefs: TrainingPrefs
  tutorials: Record<string, string>
  act: Act
  busy: string | null
  onClose: () => void
}) {
  const [detail, setDetail] = useState<{ id: string; main: boolean } | null>(null)

  return (
    <Modal onClose={onClose} presentation="sheet" size="md" label={`${WEEKDAY_LONG[session.day]}: ${sessionTitle(session)}`}>
      <ModalHeader eyebrow={WEEKDAY_LONG[session.day]} title={sessionTitle(session)} subtitle={sessionSummary(session)} />
      <ModalBody>
        {detail ? (
          <ExerciseDetail
            id={detail.id}
            main={detail.main}
            session={session as StrengthSession}
            prefs={prefs}
            tutorial={tutorials[detail.id] ?? null}
            busy={busy}
            onBack={() => setDetail(null)}
            onOpen={(id) => setDetail({ id, main: false })}
            onSwap={async (to) => {
              if (await act({ action: 'swap', sessionId: session.id, from: detail.id, to })) setDetail({ id: to, main: true })
            }}
          />
        ) : session.type === 'strength' ? (
          <StrengthBody session={session} plan={plan} prefs={prefs} act={act} busy={busy} onOpen={(id, main) => setDetail({ id, main })} />
        ) : (
          <ActivityBody session={session} prefs={prefs} tutorial={tutorials[session.activity] ?? null} />
        )}
        {!detail && <SessionActions session={session} act={act} busy={busy} onRemoved={onClose} />}
      </ModalBody>
      {!detail && (
        <ModalFooter>
          <Button
            variant={session.done ? 'secondary' : 'primary'}
            fullWidth
            icon={session.done ? undefined : 'check'}
            loading={busy === `done:${session.id}`}
            onClick={() => void act({ action: 'done', sessionId: session.id, done: !session.done })}
            data-session-done
          >
            {session.done ? C.markNotDone : C.markDone}
          </Button>
        </ModalFooter>
      )}
    </Modal>
  )
}

function Safety({ prefs }: { prefs: TrainingPrefs }) {
  return (
    <div style={{ ...stack('var(--space-2)'), marginTop: 'var(--space-5)' }}>
      {prefs.avoid.length > 0 && <p style={meta}>{C.workingAround(areasPhrase(prefs.avoid))}</p>}
      <p style={meta}>{C.notMedical}</p>
    </div>
  )
}

function StrengthBody({
  session,
  plan,
  prefs,
  act,
  busy,
  onOpen,
}: {
  session: StrengthSession
  plan: TrainingPlan
  prefs: TrainingPrefs
  act: Act
  busy: string | null
  onOpen: (id: string, main: boolean) => void
}) {
  const today = new Date().toISOString().slice(0, 10)
  const timer = useRestTimer()
  return (
    <div style={stack('var(--space-5)')}>
      {timer.view}
      {session.warmup.length > 0 && (
        <section>
          <h3 style={eyebrow}>{C.warmupTitle}</h3>
          <p style={{ ...meta, marginTop: 'var(--space-1)', marginBottom: 'var(--space-2)' }}>{C.warmupBody}</p>
          <div style={stack('var(--space-2)')}>
            {session.warmup.map((id) => (
              <OptionRow key={id} label={exerciseById(id)?.name ?? id} navigates onClick={() => onOpen(id, false)} />
            ))}
          </div>
        </section>
      )}
      <section>
        <h3 style={{ ...eyebrow, marginBottom: 'var(--space-2)' }}>{C.mainTitle}</h3>
        <ol style={stack('var(--space-5)')}>
          {session.exercises.map((p) => {
            const ex = exerciseById(p.id)
            if (!ex) return null
            return (
              <li key={p.id} data-exercise={p.id}>
                <OptionRow label={ex.name} sub={`${doseLine(p)} · ${C.rest_(p.restSec)}`} navigates onClick={() => onOpen(p.id, true)} />
                <div className="flex flex-wrap items-center" style={{ gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
                  {Array.from({ length: p.sets }, (_, i) => {
                    const n = i + 1
                    const on = p.doneSets >= n
                    return (
                      <Button
                        key={n}
                        size="sm"
                        variant={on ? 'primary' : 'secondary'}
                        aria-pressed={on}
                        aria-label={C.tickSet(n, ex.name)}
                        disabled={busy !== null && busy.startsWith('sets:')}
                        onClick={async () => {
                          const ticking = !(on && p.doneSets === n)
                          if (await act({ action: 'sets', sessionId: session.id, exerciseId: p.id, doneSets: ticking ? n : n - 1 })) {
                            // Rest between sets, not after the last one.
                            if (ticking && n < p.sets) timer.start(p.restSec)
                            else timer.stop()
                          }
                        }}
                      >
                        {on ? '✓' : n}
                      </Button>
                    )
                  })}
                  <span style={meta}>{C.setTicks(p.doneSets, p.sets)}</span>
                </div>
                <LogRow planned={p} name={ex.name} seconds={ex.unit === 'seconds'} plan={plan} today={today} act={act} busy={busy} />
              </li>
            )
          })}
        </ol>
      </section>
      {prefs.focus !== 'mobility' && <Note tone="info">{C.progressionTip}</Note>}
      <Safety prefs={prefs} />
    </div>
  )
}

const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`

/** A rest countdown between sets: started by ticking a set, skippable, quiet until it ends. */
function useRestTimer() {
  const [until, setUntil] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (until === null) return
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [until])
  const left = until === null ? null : Math.max(0, Math.ceil((until - now) / 1000))
  const start = (sec: number) => {
    setNow(Date.now())
    setUntil(Date.now() + sec * 1000)
  }
  const stop = () => setUntil(null)
  const view =
    left === null ? null : left > 0 ? (
      <div className="flex items-center justify-between" style={{ gap: 'var(--space-3)' }} data-rest-timer>
        <p role="timer" aria-live="off" style={{ ...strong, fontSize: 'var(--text-title)', fontFamily: 'var(--font-display)', fontVariantNumeric: 'tabular-nums' }}>
          {C.restFor(clock(left))}
        </p>
        <Button variant="secondary" size="sm" onClick={stop}>
          {C.restSkip}
        </Button>
      </div>
    ) : (
      <Note tone="positive" live="polite">
        {C.restDone}
      </Note>
    )
  return { start, stop, view }
}

function nextLine(step: NextStep): string {
  switch (step.kind) {
    case 'weight':
      return C.nextWeight(step.kg)
    case 'reps':
      return C.nextReps(step.reps)
    case 'seconds':
      return C.nextSeconds(step.seconds)
    case 'harder':
      return C.nextHarder(step.name)
    case 'same':
      return C.nextSame
  }
}

/** What they did last time, what to try, and a place to note today's best set. */
function LogRow({
  planned,
  name,
  seconds,
  plan,
  today,
  act,
  busy,
}: {
  planned: PlannedExercise
  name: string
  seconds: boolean
  plan: TrainingPlan
  today: string
  act: Act
  busy: string | null
}) {
  const last = lastTime(plan, planned.id, today)
  const now = todays(plan, planned.id, today)
  const step = nextStep(planned, last)
  const [kg, setKg] = useState(now?.weightKg != null ? String(now.weightKg) : last?.weightKg != null ? String(last.weightKg) : '')
  const [reps, setReps] = useState(now?.reps != null ? String(now.reps) : '')
  const num = (v: string) => (v.trim() === '' ? null : Number(v))
  const canSave = (num(kg) ?? 0) > 0 || (num(reps) ?? 0) > 0
  const dirty = !now || (seconds ? null : num(kg)) !== now.weightKg || num(reps) !== now.reps
  return (
    <div style={{ ...stack('var(--space-2)'), marginTop: 'var(--space-3)' }} data-log={planned.id}>
      {(last || now || step) && (
        <div>
          {last && <p style={meta}>{C.lastTime(last.weightKg, last.reps, seconds)}</p>}
          {step && <p style={{ ...meta, color: 'var(--ink-2)', fontWeight: 'var(--weight-strong)' }}>{nextLine(step)}</p>}
          {now && <p style={meta}>{C.todayLogged(now.weightKg, now.reps, seconds)}</p>}
        </div>
      )}
      <div className="flex items-end" style={{ gap: 'var(--space-2)' }} role="group" aria-label={C.logLabel(name)}>
        {!seconds && (
          <div style={{ flex: 1, minWidth: 0 }}>
            <Input label={C.logKg} compact suffix={C.logKg} type="number" inputMode="decimal" min={0} step={0.5} value={kg} onChange={(e) => setKg(e.target.value)} />
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <Input label={seconds ? C.logSeconds : C.logReps} compact suffix={seconds ? 's' : 'reps'} type="number" inputMode="numeric" min={0} step={1} value={reps} onChange={(e) => setReps(e.target.value)} />
        </div>
        <Button
          variant="secondary"
          size="sm"
          disabled={!canSave || !dirty || busy !== null}
          loading={busy === 'log:'}
          onClick={() => void act({ action: 'log', exerciseId: planned.id, weightKg: seconds ? null : num(kg), reps: num(reps) })}
          data-log-save
        >
          {dirty ? C.logSave : C.logSaved}
        </Button>
      </div>
    </div>
  )
}

function ActivityBody({ session, prefs, tutorial }: { session: ActivitySession; prefs: TrainingPrefs; tutorial: string | null }) {
  const a = ACTIVITIES[session.activity]
  const clash = activityConflicts(session.activity, prefs.avoid)
  return (
    <div style={stack('var(--space-5)')}>
      <div className="flex flex-wrap" style={{ gap: 'var(--space-2)' }}>
        <Badge tone="accent">{INTENSITY_COPY[session.intensity]}</Badge>
        {session.suggested && <Badge tone="info">{C.suggested}</Badge>}
      </div>
      {clash.length > 0 && !session.suggested && <Note tone="attention">{C.activityLoads(areasPhrase(clash))}</Note>}
      <Tutorial url={tutorial} about={a.name} />
      <section>
        <h3 style={{ ...eyebrow, marginBottom: 'var(--space-2)' }}>{C.pace}</h3>
        <ol style={{ ...stack('var(--space-2)'), ...body, listStyle: 'decimal', paddingLeft: 'var(--space-5)' }}>
          {a.steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      </section>
      <List title={C.tips} items={a.tips} />
      <Safety prefs={prefs} />
    </div>
  )
}

function SessionActions({ session, act, busy, onRemoved }: { session: Session; act: Act; busy: string | null; onRemoved: () => void }) {
  return (
    <section style={{ ...stack('var(--space-3)'), marginTop: 'var(--space-6)', paddingTop: 'var(--space-5)', borderTop: '1px solid var(--edge)' }} data-session-actions>
      <Select
        label={C.moveLabel(sessionTitle(session))}
        compact
        value={session.day}
        onChange={(e) => void act({ action: 'move', sessionId: session.id, day: Number(e.target.value) as Weekday })}
        disabled={busy !== null}
      >
        {WEEKDAYS.map((d) => (
          <option key={d} value={d}>
            {WEEKDAY_LONG[d]}
          </option>
        ))}
      </Select>
      <div className="flex flex-wrap" style={{ gap: 'var(--space-2)' }}>
        {session.type === 'strength' && (
          <Button variant="secondary" size="sm" icon="refresh" loading={busy === `rebuild-day:${session.id}`} disabled={busy !== null} onClick={() => void act({ action: 'rebuild-day', sessionId: session.id })} data-rebuild-day>
            {busy === `rebuild-day:${session.id}` ? C.rebuildingDay : C.rebuildDay}
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          icon="trash"
          disabled={busy !== null}
          onClick={async () => {
            if (await act({ action: 'remove', sessionId: session.id })) onRemoved()
          }}
          data-remove-session
        >
          {C.removeSession}
        </Button>
      </div>
    </section>
  )
}

function List({ title, items, ordered = false }: { title: string; items: string[]; ordered?: boolean }) {
  if (!items.length) return null
  const Tag = ordered ? 'ol' : 'ul'
  return (
    <section>
      <h3 style={{ ...eyebrow, marginBottom: 'var(--space-2)' }}>{title}</h3>
      <Tag style={{ ...stack('var(--space-2)'), ...body, listStyle: ordered ? 'decimal' : 'disc', paddingLeft: 'var(--space-5)' }}>
        {items.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </Tag>
    </section>
  )
}

function Tutorial({ url, about }: { url: string | null; about?: string }) {
  const link = buttonSurface('secondary', 'sm')
  return (
    <div className="flex flex-wrap items-center" style={{ gap: 'var(--space-2)' }}>
      {url ? (
        <a href={url} target="_blank" rel="noopener noreferrer" className={link.className} style={link.style} data-tutorial-link>
          {C.tutorial}
        </a>
      ) : (
        <p style={meta}>{C.tutorialSoon}</p>
      )}
      {about && <AskTrainer about={about} />}
    </div>
  )
}

/** "Ask [Name] about this": the exercise's name rides into the question, while there's a trainer to ask. */
function AskTrainer({ about }: { about: string }) {
  const { settings } = useOfferSettings()
  if (!trainerLive(settings)) return null
  const link = buttonSurface('ghost', 'sm')
  return (
    <Link href={`/myhub/trainer?about=${encodeURIComponent(about)}`} className={link.className} style={link.style} data-ask-trainer>
      {TRAINER_COPY.askAbout(settings.trainer.name)} →
    </Link>
  )
}

function ExerciseDetail({
  id,
  main,
  session,
  prefs,
  tutorial,
  busy,
  onBack,
  onOpen,
  onSwap,
}: {
  id: string
  main: boolean
  session: StrengthSession
  prefs: TrainingPrefs
  tutorial: string | null
  busy: string | null
  onBack: () => void
  onOpen: (id: string) => void
  onSwap: (to: string) => void
}) {
  const ex = exerciseById(id)
  // Opening an exercise starts at its name, not wherever the list was scrolled.
  const top = useRef<HTMLDivElement>(null)
  useEffect(() => {
    top.current?.scrollIntoView({ block: 'start' })
  }, [id])
  if (!ex) return null
  const others = session.exercises.map((p) => p.id).filter((x) => x !== id)
  const alternatives = main ? alternativesFor(id, prefs, others) : []
  const ladder: { label: string; id: string }[] = []
  if (ex.easier && exerciseById(ex.easier)) ladder.push({ label: C.easier, id: ex.easier })
  if (ex.harder && exerciseById(ex.harder)) ladder.push({ label: C.harder, id: ex.harder })

  return (
    <div ref={top} style={stack('var(--space-5)')} data-exercise-detail={id}>
      <div>
        <Button variant="ghost" size="sm" icon="arrow-left" onClick={onBack} data-back>
          {sessionTitle(session)}
        </Button>
      </div>
      <div style={stack('var(--space-2)')}>
        <h3 style={{ ...strong, fontSize: 'var(--text-title)', fontFamily: 'var(--font-display)' }}>{ex.name}</h3>
        <p style={meta}>
          {C.kit}: {ex.kit}
        </p>
        <div className="flex flex-wrap" style={{ gap: 'var(--space-1)' }} aria-label={C.works}>
          {ex.muscles.map((m) => (
            <Badge key={m}>{MUSCLE_COPY[m]}</Badge>
          ))}
        </div>
      </div>
      <Tutorial url={tutorial} about={ex.name} />
      <List title={C.how} items={ex.steps} ordered />
      <List title={C.cues} items={ex.cues} />
      <List title={C.mistakes} items={ex.mistakes} />
      <List title={C.tips} items={ex.tips} />

      {ladder.length > 0 && (
        <section style={stack('var(--space-2)')}>
          {ladder.map((l) => (
            <OptionRow key={l.id} label={exerciseById(l.id)!.name} sub={l.label} navigates onClick={() => onOpen(l.id)} />
          ))}
        </section>
      )}

      {main && (
        <section>
          <h3 style={{ ...eyebrow, marginBottom: 'var(--space-2)' }}>{C.alternatives}</h3>
          {alternatives.length === 0 ? (
            <p style={meta}>{C.noAlternatives}</p>
          ) : (
            <ul style={stack('var(--space-2)')}>
              {alternatives.slice(0, 5).map((alt) => (
                <li key={alt.id} className="flex items-center justify-between" style={{ gap: 'var(--space-3)' }} data-alternative={alt.id}>
                  <div className="min-w-0">
                    <p style={{ ...strong, fontSize: 'var(--text-body-sm)' }}>{alt.name}</p>
                    <p style={meta}>{alt.kit}</p>
                  </div>
                  <Button variant="secondary" size="sm" icon="swap" aria-label={C.swapTo(alt.name)} loading={busy === `swap:${session.id}`} disabled={busy !== null} onClick={() => onSwap(alt.id)}>
                    {C.swap}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      <Safety prefs={prefs} />
    </div>
  )
}


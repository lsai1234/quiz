'use client'

import { CooldownBlock } from './ProgrammeBits'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { Badge, Button, Note, buttonSurface } from '@/components/system'
import { COACHING_COPY as W } from '@/lib/training/coaching-copy'
import { TRAINING_COPY as C } from '@/lib/training/copy'
import { exerciseById } from '@/lib/training/library'
import { bestBefore, isPersonalBest, lastTime, nextStep, todays } from '@/lib/training/progress'
import { lastFelt } from '@/lib/training/edit'
import type { TrainingAction } from '@/lib/training/state'
import type { Felt, StrengthSession, TrainingPlan } from '@/lib/training/types'
import { sessionTitle } from '@/lib/training/view'
import type { PublicTrainer } from '@/lib/trainer/types'
import { body, eyebrow, meta, stack, strong, title } from './styles'

/**
 * Workout mode: one session, one set at a time, full screen. The weight and
 * reps are set before the set and confirmed with one big Done; a rest ring
 * counts down between sets and buzzes when it's over; after the last set,
 * one tap for how it felt, then the next exercise. The screen stays awake,
 * and every tick is queued on the phone when there's no signal (`send`).
 */
type Phase = 'warmup' | 'set' | 'rest' | 'felt' | 'done'

export function WorkoutMode({
  plan,
  session,
  trainer,
  tips,
  videos,
  offline,
  send,
  onClose,
  programmes = false,
}: {
  plan: TrainingPlan
  session: StrengthSession
  trainer: PublicTrainer | null
  /** The trainer's tip on each exercise, by id. */
  tips: Record<string, string>
  /** Uploaded videos by exercise id, played as a silent loop. */
  videos: Record<string, string>
  offline: boolean
  send: (a: TrainingAction) => void
  onClose: () => void
  /** Programmes and goals are on: the cool-down after the last set. */
  programmes?: boolean
}) {
  const today = new Date().toISOString().slice(0, 10)
  const exercises = session.exercises.filter((p) => exerciseById(p.id))
  const firstOpen = Math.max(0, exercises.findIndex((p) => p.doneSets < p.sets))
  const [i, setI] = useState(firstOpen)
  const [setN, setSetN] = useState(() => (exercises[firstOpen]?.doneSets ?? 0) + 1)
  const [phase, setPhase] = useState<Phase>(() => (session.warmup.length && exercises.every((p) => p.doneSets === 0) ? 'warmup' : exercises.length ? 'set' : 'done'))
  const [restUntil, setRestUntil] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [showTip, setShowTip] = useState(false)
  const [setsLogged, setSetsLogged] = useState(0)
  const [bests, setBests] = useState<{ name: string; line: string }[]>([])
  // The first session they ever log: the trainer's note after the first exercise.
  const firstEver = useMemo(() => !Object.values(plan.log ?? {}).some((entries) => entries.some((e) => e.on < today)) && !plan.history.some((h) => h.done > 0), [plan, today])

  const p = exercises[i]
  const ex = p ? exerciseById(p.id) : undefined
  const seconds = ex?.unit === 'seconds'
  const last = p ? lastTime(plan, p.id, today) : null
  const step = p ? nextStep(p, last, lastFelt(plan, p.id, today)) : null
  const startKg = useMemo(() => {
    if (!p) return 0
    const logged = todays(plan, p.id, today)
    if (logged?.weightKg) return logged.weightKg
    if (step?.kind === 'weight') return step.kg
    return last?.weightKg ?? 0
  }, [p, plan, today, step, last])
  const startReps = useMemo(() => (!p ? 0 : step?.kind === 'reps' ? step.reps : step?.kind === 'seconds' ? step.seconds : p.high), [p, step])
  const [kg, setKg] = useState(startKg)
  const [reps, setReps] = useState(startReps)
  const [best, setBest] = useState<{ kg: number; reps: number } | null>(null)
  useEffect(() => {
    setKg(startKg)
    setReps(startReps)
    setBest(null)
    setShowTip(false)
  }, [i, startKg, startReps])

  // The page behind stays put while the workout is up.
  useEffect(() => {
    const was = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = was
    }
  }, [])

  // Keep the screen on while they train.
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }
    nav.wakeLock?.request('screen').then((l) => (lock = l)).catch(() => {})
    return () => void lock?.release().catch(() => {})
  }, [])

  // The rest ring.
  useEffect(() => {
    if (restUntil === null) return
    const t = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(t)
  }, [restUntil])
  const restLeft = restUntil === null ? 0 : Math.max(0, Math.ceil((restUntil - now) / 1000))
  useEffect(() => {
    if (phase === 'rest' && restUntil !== null && restLeft === 0) {
      navigator.vibrate?.([180, 80, 180])
      setRestUntil(null)
      setPhase('set')
    }
  }, [phase, restUntil, restLeft])

  if (!p || !ex) return null
  const name = trainer?.name ?? null

  function doneSet() {
    if (!p || !ex) return
    send({ action: 'sets', sessionId: session.id, exerciseId: p.id, doneSets: setN })
    setSetsLogged((n) => n + 1)
    const w = seconds ? 0 : kg
    const b = !best || w > best.kg || (w === best.kg && reps > best.reps) ? { kg: w, reps } : best
    setBest(b)
    if (setN < p.sets) {
      setSetN(setN + 1)
      setNow(Date.now())
      setRestUntil(Date.now() + p.restSec * 1000)
      setPhase('rest')
      return
    }
    // The last set: today's best set goes in the log, then how it felt.
    send({ action: 'log', exerciseId: p.id, weightKg: seconds || !b.kg ? null : b.kg, reps: b.reps })
    if (isPersonalBest({ weightKg: b.kg || null, reps: b.reps }, bestBefore(plan, p.id, today))) {
      setBests((xs) => [...xs, { name: ex.name, line: seconds ? W.targetSeconds(b.reps) : b.kg ? W.targetWeight(b.kg, b.reps) : W.targetReps(b.reps, b.reps) }])
    }
    setPhase('felt')
  }

  function felt(f: Felt) {
    if (!p) return
    send({ action: 'felt', exerciseId: p.id, felt: f })
    if (i + 1 < exercises.length) {
      setI(i + 1)
      setSetN(exercises[i + 1].doneSets + 1)
      setPhase('set')
    } else {
      send({ action: 'done', sessionId: session.id, done: true })
      setPhase('done')
    }
  }

  const askHref = `/myhub/trainer?about=${encodeURIComponent(ex.name)}&set=${setN}&of=${p.sets}${seconds ? '' : `&kg=${kg}`}&reps=${reps}`
  const video = videos[p.id] ?? null
  const askLink = buttonSurface('ghost', 'sm')

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${W.start}: ${sessionTitle(session)}`}
      data-workout
      data-workout-phase={phase}
      className="my-hub"
      style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'var(--ground-base)', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}
    >
      <div className="mx-auto w-full max-w-lg flex flex-col" style={{ minHeight: '100%', padding: 'var(--space-4)', gap: 'var(--space-4)' }}>
        <header className="flex items-center justify-between" style={{ gap: 'var(--space-3)' }}>
          <div className="min-w-0">
            <p style={eyebrow}>{sessionTitle(session)}</p>
            {phase !== 'warmup' && phase !== 'done' && <p style={meta}>{`${i + 1} / ${exercises.length}`}</p>}
          </div>
          <Button variant="ghost" size="sm" icon="x" onClick={onClose} data-workout-close>
            {W.leave}
          </Button>
        </header>

        {offline && (
          <Note tone="attention" live="polite">
            {W.offline}
          </Note>
        )}

        {phase === 'warmup' && (
          <section style={stack('var(--space-4)')} data-workout-warmup>
            <h2 style={{ ...title, fontSize: 'var(--text-display)' }}>{W.warmupTitle}</h2>
            <p style={body}>{W.warmupLine}</p>
            <ul style={stack('var(--space-2)')}>
              {session.warmup.map((id) => (
                <li key={id} style={strong}>
                  {exerciseById(id)?.name ?? id}
                </li>
              ))}
            </ul>
            <Button variant="primary" size="lg" fullWidth onClick={() => setPhase('set')} data-workout-warmup-done>
              {W.warmupDone}
            </Button>
          </section>
        )}

        {(phase === 'set' || phase === 'rest' || phase === 'felt') && (
          <section style={stack('var(--space-4)')} data-workout-exercise={p.id}>
            <h2 style={{ ...title, fontSize: 'var(--text-display)' }}>{ex.name}</h2>
            {video ? (
              <video src={video} muted loop playsInline autoPlay aria-label={ex.name} style={{ width: '100%', borderRadius: 'var(--radius-card)', background: 'var(--surface-1)' }} />
            ) : (
              <div style={stack('var(--space-1)')}>
                <p style={eyebrow}>{W.howTo}</p>
                <p style={{ ...strong, fontSize: 'var(--text-title)' }}>{ex.steps[0]}</p>
                {ex.cues[0] && <p style={body}>{ex.cues[0]}</p>}
              </div>
            )}
            {name && tips[p.id] && (
              <div>
                <Button variant="ghost" size="sm" icon="chat" onClick={() => setShowTip((v) => !v)} aria-expanded={showTip} data-workout-tip-toggle>
                  {W.tipFrom(name)}
                </Button>
                {showTip && (
                  <p style={{ ...body, marginTop: 'var(--space-2)' }} data-workout-tip>
                    {tips[p.id]}
                  </p>
                )}
              </div>
            )}
          </section>
        )}

        {phase === 'set' && (
          <section style={stack('var(--space-4)')} data-workout-set={setN}>
            <div>
              <p className="hub-figure" style={{ ...title, fontSize: 'var(--text-display)' }} data-workout-target>
                {`${W.setOf(setN, p.sets)} · ${seconds ? W.targetSeconds(reps) : kg ? W.targetWeight(kg, reps) : W.targetReps(p.low, p.high)}`}
              </p>
              {last && <p style={meta}>{C.lastTime(last.weightKg, last.reps, seconds)}</p>}
            </div>
            <div className="grid grid-cols-2" style={{ gap: 'var(--space-3)' }}>
              {!seconds && <Stepper label={W.weight} value={kg} unit="kg" step={kg >= 20 ? 2.5 : 1} min={0} onChange={setKg} />}
              <Stepper label={seconds ? W.seconds : W.reps} value={reps} unit={seconds ? 's' : ''} step={seconds ? 5 : 1} min={1} onChange={setReps} wide={seconds} />
            </div>
            <Button variant="primary" size="lg" fullWidth icon="check" onClick={doneSet} data-workout-done>
              {W.done}
            </Button>
            {name && (
              <Link href={askHref} className={askLink.className} style={askLink.style} data-workout-ask>
                {W.askSet(name)} →
              </Link>
            )}
          </section>
        )}

        {phase === 'rest' && (
          <section className="flex flex-col items-center" style={{ gap: 'var(--space-4)' }} data-workout-rest>
            <RestRing left={restLeft} total={p.restSec} />
            <p style={meta}>{W.restNext(setN)}</p>
            <Button
              variant="secondary"
              onClick={() => {
                setRestUntil(null)
                setPhase('set')
              }}
              data-workout-skip
            >
              {W.restSkip}
            </Button>
          </section>
        )}

        {phase === 'felt' && (
          <section style={stack('var(--space-3)')} data-workout-felt>
            <h3 style={title}>{W.feltTitle}</h3>
            <p style={meta}>{W.feltHint}</p>
            <div className="grid grid-cols-3" style={{ gap: 'var(--space-2)' }}>
              {(['easy', 'right', 'hard'] as Felt[]).map((f) => (
                <Button key={f} variant="secondary" size="lg" onClick={() => felt(f)} data-felt={f}>
                  {W.felt[f]}
                </Button>
              ))}
            </div>
            {firstEver && i === 0 && name && <Note tone="accent">{W.firstNote(name)}</Note>}
            {i + 1 < exercises.length && <p style={meta}>{W.next(exerciseById(exercises[i + 1].id)?.name ?? '')}</p>}
          </section>
        )}

        {phase === 'done' && (
          <section style={stack('var(--space-4)')} data-workout-finished>
            <h2 style={{ ...title, fontSize: 'var(--text-display)' }}>{W.finishTitle}</h2>
            <p style={body}>{W.finishBody(setsLogged)}</p>
            {firstEver ? (
              <Note tone="positive">{W.bestFirst}</Note>
            ) : (
              bests.length > 0 && (
                <ul style={stack('var(--space-2)')} data-workout-bests>
                  {bests.map((b) => (
                    <li key={b.name} className="hub-best">
                      <Badge tone="positive" dot>
                        {W.best(b.name, b.line)}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )
            )}
            {programmes && <CooldownBlock session={session} prefs={plan.prefs} />}
            <Button variant="primary" size="lg" fullWidth onClick={onClose} data-workout-finish>
              {W.finish}
            </Button>
          </section>
        )}
      </div>
    </div>
  )
}

function Stepper({ label, value, unit, step, min, onChange, wide = false }: { label: string; value: number; unit: string; step: number; min: number; onChange: (v: number) => void; wide?: boolean }) {
  const round = (v: number) => Math.round(v * 2) / 2
  return (
    <div className={wide ? 'col-span-2' : undefined} style={{ ...stack('var(--space-2)'), alignItems: 'stretch' }} role="group" aria-label={label}>
      <p style={meta}>{label}</p>
      <div className="flex items-center justify-between" style={{ gap: 'var(--space-2)' }}>
        <Button variant="secondary" size="sm" icon="minus" aria-label={W.less(label)} onClick={() => onChange(Math.max(min, round(value - step)))} />
        <span className="hub-figure" style={{ ...strong, fontSize: 'var(--text-title)', whiteSpace: 'nowrap', textAlign: 'center', flex: 1, minWidth: 0 }} aria-live="polite">
          {`${value}${unit ? ` ${unit}` : ''}`}
        </span>
        <Button variant="secondary" size="sm" icon="plus" aria-label={W.more(label)} onClick={() => onChange(round(value + step))} />
      </div>
    </div>
  )
}

function RestRing({ left, total }: { left: number; total: number }) {
  const r = 70
  const c = 2 * Math.PI * r
  const done = total > 0 ? 1 - left / total : 1
  const clock = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`
  return (
    <div style={{ position: 'relative', width: 180, height: 180 }}>
      <svg width="180" height="180" viewBox="0 0 180 180" aria-hidden>
        <circle cx="90" cy="90" r={r} fill="none" stroke="var(--surface-3)" strokeWidth="10" />
        <circle
          cx="90"
          cy="90"
          r={r}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * done}
          transform="rotate(-90 90 90)"
          style={{ transition: 'stroke-dashoffset 0.25s linear' }}
        />
      </svg>
      <div className="flex flex-col items-center justify-center" style={{ position: 'absolute', inset: 0 }}>
        <p style={meta}>{W.restTitle}</p>
        <p role="timer" aria-live="off" className="hub-figure" style={{ ...title, fontSize: 'var(--text-display)', fontVariantNumeric: 'tabular-nums' }} data-workout-rest-clock>
          {clock}
        </p>
      </div>
    </div>
  )
}

'use client'

import { useMemo, useState } from 'react'
import { Badge, Button, Card, Input, Note, OptionRow, Segmented, Select, buttonSurface } from '@/components/system'
import { Icon } from '@/components/ui/Icon'
import { WEEKDAY_LONG } from '@/lib/training/copy'
import { cooldownFor } from '@/lib/training/cooldown'
import { mondayOf, weekdayOf } from '@/lib/training/generate'
import { GOAL_KINDS, milestones, type Milestone } from '@/lib/training/goals'
import { exerciseById } from '@/lib/training/library'
import { missedSessions, nextFreeDay } from '@/lib/training/missed'
import { programmeStatus, testComparison, type WeekKind } from '@/lib/training/programme'
import { PROGRAMME_COPY as P } from '@/lib/training/programme-copy'
import type { TrainingAction } from '@/lib/training/state'
import type { GoalKind, StrengthSession, TrainingPlan, TrainingPrefs } from '@/lib/training/types'
import { longDay, sessionTitle } from '@/lib/training/view'
import { body, eyebrow, meta, stack, strong } from './styles'

type Act = (a: TrainingAction) => Promise<boolean>

const kg = (n: number | null) => (n == null ? null : `${Number.isInteger(n) ? n : n.toFixed(1)} kg`)
const setLine = (e: { weightKg: number | null; reps: number | null }) => [kg(e.weightKg), e.reps != null ? `${e.weightKg != null ? '× ' : ''}${e.reps}${e.weightKg != null ? '' : ' reps'}` : null].filter(Boolean).join(' ')

const KIND_TONE: Record<WeekKind, string> = {
  foundation: 'var(--surface-3)',
  build: 'var(--accent)',
  lighter: 'var(--attention)',
  test: 'var(--positive)',
}

/* ── Programme ─────────────────────────────────────────────────────────────── */

export function ProgrammeCard({ plan, trainer, act, busy }: { plan: TrainingPlan; trainer: string | null; act: Act; busy: string | null }) {
  const [weeks, setWeeks] = useState<8 | 12>(8)
  const p = plan.programme
  if (p?.endedOn) return null
  const status = p ? programmeStatus(p, plan.weekOf) : null

  if (!p || !status) {
    return (
      <div data-programme="none">
        <Card padding="normal">
          <div style={stack('var(--space-3)')}>
            <div style={stack('var(--space-1)')}>
              <p style={eyebrow}>{P.programmeTitle}</p>
              <p style={body}>{P.programmeLine}</p>
            </div>
            <Segmented<'8' | '12'>
              label={P.programmeTitle}
              columns={2}
              value={String(weeks) as '8' | '12'}
              onChange={(v) => setWeeks(v === '12' ? 12 : 8)}
              options={[
                { value: '8', label: P.programme8, sub: P.programme8Line },
                { value: '12', label: P.programme12, sub: P.programme12Line },
              ]}
            />
            {trainer && <p style={meta}>{P.programmeChecked(trainer)}</p>}
            <div>
              <Button variant="primary" size="sm" loading={busy === 'programme:'} disabled={busy !== null} onClick={() => void act({ action: 'programme', weeks })} data-programme-start>
                {P.programmeStart(weeks)}
              </Button>
            </div>
          </div>
        </Card>
      </div>
    )
  }

  if (status.finished) {
    const rows = testComparison(plan)
    return (
      <div data-programme="finished">
        <Card padding="normal" tone="positive">
          <div style={stack('var(--space-3)')}>
            <p style={eyebrow}>{P.finishedTitle}</p>
            <p style={strong}>{P.compareTitle}</p>
            {rows.length ? (
              <ul style={stack('var(--space-1)')} data-programme-compare>
                {rows.map((r) => (
                  <li key={r.exerciseId} className="flex items-center" style={{ gap: 'var(--space-2)', ...body }}>
                    {r.up && (
                      <span style={{ color: 'var(--positive)', display: 'inline-flex' }}>
                        <Icon name="trending-up" size={14} />
                      </span>
                    )}
                    {P.compareLine(exerciseById(r.exerciseId)?.name ?? r.exerciseId, setLine(r.first), setLine(r.test))}
                  </li>
                ))}
              </ul>
            ) : (
              <p style={meta}>{P.compareNone}</p>
            )}
            <div className="flex flex-wrap" style={{ gap: 'var(--space-2)' }}>
              <Button variant="primary" size="sm" disabled={busy !== null} onClick={() => void act({ action: 'programme', weeks: p.weeks })} data-programme-again>
                {P.finishedNext}
              </Button>
              <Button variant="ghost" size="sm" disabled={busy !== null} onClick={() => void act({ action: 'programme-close' })}>
                {P.finishedClose}
              </Button>
            </div>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div data-programme={status.kind ?? 'none'}>
      <Card padding="normal" tone={status.kind === 'lighter' ? 'attention' : status.kind === 'test' ? 'positive' : undefined}>
        <div style={stack('var(--space-3)')}>
          <div className="flex flex-wrap items-center justify-between" style={{ gap: 'var(--space-2)' }}>
            <p style={eyebrow}>{`${P.programmeTitle} · ${P.programmeWeek(status.week ?? 0, status.weeks)}`}</p>
            {status.kind && <Badge tone={status.kind === 'lighter' ? 'attention' : status.kind === 'test' ? 'positive' : 'accent'}>{P.kind[status.kind]}</Badge>}
          </div>
          {status.kind && <p style={body}>{P.kindLine[status.kind]}</p>}
          {/* The block at a glance; the badge and the line say it in words. */}
          <div aria-hidden className="grid" style={{ gridTemplateColumns: `repeat(${status.weeks}, 1fr)`, gap: 'var(--space-1)' }}>
            {status.strip.map((w) => (
              <span
                key={w.n}
                style={{
                  height: 'var(--space-2)',
                  borderRadius: 'var(--radius-pill)',
                  background: KIND_TONE[w.kind],
                  opacity: w.now ? 1 : w.past ? 0.55 : 0.25,
                  outline: w.now ? '2px solid var(--ink-1)' : undefined,
                  outlineOffset: 1,
                }}
              />
            ))}
          </div>
          <div>
            <Button variant="ghost" size="sm" disabled={busy !== null} onClick={() => void act({ action: 'programme-stop' })} data-programme-stop>
              {P.programmeStop}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}

/* ── Goal ──────────────────────────────────────────────────────────────────── */

function milestoneLabel(m: Milestone, lift: string): string {
  switch (m.kind) {
    case 'lift-at':
      return P.milestone.liftAt(lift, m.value ?? 0)
    case 'pulldown':
      return P.milestone.pulldown
    case 'assisted':
      return P.milestone.assisted
    case 'assisted-8':
      return P.milestone.assisted8
    case 'first-pull-up':
      return P.milestone.firstPullUp
    case 'runs':
      return P.milestone.runs(m.value ?? 1)
    case 'ran-5k':
      return P.milestone.ran5k
    case 'weeks-3':
      return P.milestone.weeks3(m.value ?? 2)
  }
}

export function GoalCard({ plan, act, busy }: { plan: TrainingPlan; act: Act; busy: string | null }) {
  const [choosing, setChoosing] = useState(false)
  const [kind, setKind] = useState<GoalKind>('lift')
  // The loaded lifts in their plan, for a weight goal.
  const lifts = useMemo(() => {
    const ids = new Set<string>()
    for (const s of plan.sessions) if (s.type === 'strength') for (const p of s.exercises) ids.add(p.id)
    return [...ids].map((id) => exerciseById(id)).filter((e) => e && e.unit === 'reps' && !e.equipment.includes('bodyweight')) as NonNullable<ReturnType<typeof exerciseById>>[]
  }, [plan.sessions])
  const [lift, setLift] = useState(lifts[0]?.id ?? '')
  const [target, setTarget] = useState('')
  const [invalid, setInvalid] = useState(false)
  const g = plan.goal

  if (g && !choosing) {
    const list = milestones(plan, g)
    const liftName = exerciseById(g.exerciseId ?? '')?.name ?? ''
    return (
      <div data-goal={g.kind}>
        <Card padding="normal" tone={g.doneOn ? 'positive' : undefined}>
          <div style={stack('var(--space-3)')}>
            <div style={stack('var(--space-1)')}>
              <p style={eyebrow}>{P.goalTitle}</p>
              <p style={strong}>{g.kind === 'lift' ? P.milestone.liftAt(liftName, g.targetKg ?? 0) : P.goalKinds[g.kind]}</p>
              {g.doneOn && <p style={body}>{P.goalDone(longDay(`${g.doneOn}T12:00:00Z`))}</p>}
            </div>
            <ol style={stack('var(--space-2)')} data-milestones>
              {list.map((m) => (
                <li key={m.id} className="flex items-center justify-between" style={{ gap: 'var(--space-2)' }} data-milestone={m.id} data-milestone-done={m.done}>
                  <span className="flex items-center" style={{ gap: 'var(--space-2)', ...body, color: m.done ? 'var(--ink-1)' : 'var(--ink-2)' }}>
                    <span
                      aria-hidden
                      className="inline-flex items-center justify-center"
                      style={{ width: 'var(--space-5)', height: 'var(--space-5)', borderRadius: 'var(--radius-pill)', background: m.done ? 'var(--positive)' : 'var(--surface-3)', color: 'var(--surface-0)' }}
                    >
                      {m.done && <Icon name="check" size={12} />}
                    </span>
                    {milestoneLabel(m, liftName)}
                  </span>
                  {m.done && m.on ? (
                    <span style={meta}>{P.milestoneOn(longDay(`${m.on}T12:00:00Z`))}</span>
                  ) : m.self && !m.done ? (
                    <Button variant="secondary" size="sm" disabled={busy !== null} onClick={() => void act({ action: 'goal-tick', id: m.id })} data-milestone-tick>
                      {P.goalSelfTick}
                    </Button>
                  ) : null}
                </li>
              ))}
            </ol>
            <div>
              <Button variant="ghost" size="sm" onClick={() => setChoosing(true)} data-goal-change>
                {P.goalChange}
              </Button>
            </div>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div data-goal="none">
      <Card padding="normal">
        <div style={stack('var(--space-3)')}>
          <div style={stack('var(--space-1)')}>
            <p style={eyebrow}>{P.goalTitle}</p>
            <p style={body}>{P.goalLine}</p>
          </div>
          <Select label={P.goalTitle} hideLabel value={kind} onChange={(e) => setKind(e.target.value as GoalKind)} data-goal-kind>
            {GOAL_KINDS.filter((k) => k !== 'lift' || lifts.length > 0).map((k) => (
              <option key={k} value={k}>
                {P.goalKinds[k]}
              </option>
            ))}
          </Select>
          {kind === 'lift' && lifts.length > 0 && (
            <div className="grid grid-cols-2" style={{ gap: 'var(--space-2)' }}>
              <Select label={P.goalLift} compact value={lift} onChange={(e) => setLift(e.target.value)} data-goal-lift>
                {lifts.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </Select>
              <Input label={P.goalTarget} compact inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} data-goal-target />
            </div>
          )}
          {invalid && <Note tone="attention">{P.goalInvalid}</Note>}
          <div className="flex flex-wrap" style={{ gap: 'var(--space-2)' }}>
            <Button
              variant="primary"
              size="sm"
              disabled={busy !== null || (kind === 'lift' && !(Number(target) > 0))}
              onClick={async () => {
                setInvalid(false)
                const ok = await act(kind === 'lift' ? { action: 'goal', kind, exerciseId: lift, targetKg: Number(target) } : { action: 'goal', kind })
                if (ok) setChoosing(false)
                else if (kind === 'lift') setInvalid(true)
              }}
              data-goal-set
            >
              {P.goalSet}
            </Button>
            {g && (
              <Button variant="ghost" size="sm" onClick={() => setChoosing(false)}>
                ←
              </Button>
            )}
          </div>
        </div>
      </Card>
    </div>
  )
}

/* ── A missed session ─────────────────────────────────────────────────────── */

export function MissedCard({ plan, act, busy }: { plan: TrainingPlan; act: Act; busy: string | null }) {
  const now = new Date()
  const today = weekdayOf(now)
  const missed = missedSessions(plan, today, mondayOf(now))[0]
  if (!missed) return null
  const free = nextFreeDay(plan, today)
  const title = sessionTitle(missed)
  return (
    <div data-missed={missed.id}>
      <Card padding="normal">
        <div style={stack('var(--space-2)')}>
          <p style={strong}>{P.missedTitle(WEEKDAY_LONG[missed.day])}</p>
          {free === null && <p style={body}>{P.missedNoRoom(title)}</p>}
          <div className="flex flex-wrap" style={{ gap: 'var(--space-2)' }}>
            {free !== null ? (
              <>
                <Button variant="primary" size="sm" disabled={busy !== null} onClick={() => void act({ action: 'missed', sessionId: missed.id, to: free })} data-missed-move>
                  {P.missedMove(title, WEEKDAY_LONG[free])}
                </Button>
                <Button variant="ghost" size="sm" disabled={busy !== null} onClick={() => void act({ action: 'missed', sessionId: missed.id, to: null })} data-missed-drop>
                  {P.missedDrop}
                </Button>
              </>
            ) : (
              <Button variant="secondary" size="sm" disabled={busy !== null} onClick={() => void act({ action: 'missed', sessionId: missed.id, to: null })} data-missed-drop>
                {P.missedOk}
              </Button>
            )}
          </div>
        </div>
      </Card>
    </div>
  )
}

/* ── Warm-up ramp and cool-down ───────────────────────────────────────────── */

export function RampNote({ session, prefs }: { session: StrengthSession; prefs: TrainingPrefs }) {
  const { ramp } = cooldownFor(session, prefs)
  const name = ramp ? exerciseById(ramp)?.name : null
  if (!name) return null
  return (
    <div style={{ marginBottom: 'var(--space-4)' }} data-ramp>
      <Note tone="info">
        <span style={{ fontWeight: 'var(--weight-strong)' }}>{P.rampTitle}. </span>
        {P.rampLine(name)}
      </Note>
    </div>
  )
}

export function CooldownBlock({ session, prefs, onOpen }: { session: StrengthSession; prefs: TrainingPrefs; onOpen?: (id: string) => void }) {
  const { cooldown, addOns } = cooldownFor(session, prefs)
  if (!cooldown.length) return null
  const row = (id: string) => <OptionRow key={id} label={exerciseById(id)?.name ?? id} navigates={Boolean(onOpen)} onClick={() => onOpen?.(id)} />
  return (
    <section style={{ ...stack('var(--space-3)'), marginTop: 'var(--space-5)' }} data-cooldown>
      <div>
        <h3 style={eyebrow}>{P.cooldownTitle}</h3>
        <p style={{ ...meta, marginTop: 'var(--space-1)' }}>{P.cooldownLine}</p>
      </div>
      <div style={stack('var(--space-2)')}>{cooldown.map(row)}</div>
      {addOns.length > 0 && (
        <>
          <div>
            <h3 style={{ ...eyebrow, color: 'var(--ink-2)' }}>{P.addOnsTitle}</h3>
            <p style={{ ...meta, marginTop: 'var(--space-1)' }}>{P.addOnsLine}</p>
          </div>
          <div style={stack('var(--space-2)')} data-addons>
            {addOns.map(row)}
          </div>
        </>
      )}
    </section>
  )
}

'use client'

import { useEffect, useRef, useState } from 'react'
import { Badge, Button, Modal, ModalBody, ModalFooter, ModalHeader, Note, OptionRow, Select, buttonSurface } from '@/components/system'
import { INTENSITY_COPY, MUSCLE_COPY, TRAINING_COPY as C, WEEKDAY_LONG, areasPhrase } from '@/lib/training/copy'
import { activityConflicts, alternativesFor } from '@/lib/training/generate'
import { ACTIVITIES, exerciseById } from '@/lib/training/library'
import type { TrainingAction } from '@/lib/training/state'
import { WEEKDAYS, type ActivitySession, type Session, type StrengthSession, type TrainingPrefs, type Weekday } from '@/lib/training/types'
import { doseLine, sessionSummary, sessionTitle } from '@/lib/training/view'
import { body, eyebrow, meta, stack, strong } from './styles'

type Act = (a: TrainingAction) => Promise<boolean>

/**
 * One session, opened: its warm-up and exercises with sets to tick, or an
 * activity and how to pace it; and everything to change about it. Tapping
 * an exercise opens its detail in the same sheet, with a way back.
 */
export function SessionSheet({
  session,
  prefs,
  tutorials,
  act,
  busy,
  onClose,
}: {
  session: Session
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
          <StrengthBody session={session} prefs={prefs} act={act} busy={busy} onOpen={(id, main) => setDetail({ id, main })} />
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
  prefs,
  act,
  busy,
  onOpen,
}: {
  session: StrengthSession
  prefs: TrainingPrefs
  act: Act
  busy: string | null
  onOpen: (id: string, main: boolean) => void
}) {
  return (
    <div style={stack('var(--space-5)')}>
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
        <ol style={stack('var(--space-4)')}>
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
                        onClick={() => void act({ action: 'sets', sessionId: session.id, exerciseId: p.id, doneSets: on && p.doneSets === n ? n - 1 : n })}
                      >
                        {on ? '✓' : n}
                      </Button>
                    )
                  })}
                  <span style={meta}>{C.setTicks(p.doneSets, p.sets)}</span>
                </div>
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
      <Tutorial url={tutorial} />
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

function Tutorial({ url }: { url: string | null }) {
  const link = buttonSurface('secondary', 'sm')
  if (!url) return <p style={meta}>{C.tutorialSoon}</p>
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className={link.className} style={link.style} data-tutorial-link>
      {C.tutorial}
    </a>
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
      <Tutorial url={tutorial} />
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


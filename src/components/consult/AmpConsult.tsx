'use client'

import { useEffect, useReducer, useRef, useState } from 'react'
import {
  NUDGES,
  firstSceneIn,
  flowReducer,
  initialFlow,
  isAnswered,
  newConsultId,
  sceneDef,
  sectionProgress,
  visibleScenes,
  type FlowState,
} from '@/lib/consult/flow'
import { DURATION } from '@/lib/consult/motion'
import { reactionTo } from '@/lib/consult/reactions'
import { clearConsult, isResumable, isSameSession, loadConsult, saveConsult } from '@/lib/consult/persist'
import type { ConsultAnswers, SceneId, SectionId } from '@/lib/consult/types'
import { Amp, type AmpState } from './Amp'
import { ConsultRoot } from './ConsultRoot'
import { SceneShell } from './SceneShell'
import { SceneStage } from './SceneStage'
import { NextButton, QuietLink } from './controls'
import { SceneRenderer } from './scenes/registry'

/**
 * The Amp Consult, end to end.
 *
 * Holds the flow state (`lib/consult/flow.ts`) and renders the current scene
 * into the shell. Every rule — what's next, what Back does, whether Next is
 * allowed — lives in the reducer; this component only wires it to the screen,
 * keeps it saved (`lib/consult/persist.ts`), and tells Amp how to look.
 */

interface Props {
  /** Called when the visitor backs out of the first scene. */
  onExit?: () => void
  /** Called once the consult has finished collecting (after the circuit check). */
  onComplete?: (state: FlowState) => void
  /** Start from a known state — the workshop and tests use this. Disables saving. */
  initial?: FlowState
}

export function AmpConsult({ onExit, onComplete, initial }: Props) {
  const persist = !initial
  const [state, dispatch] = useReducer(flowReducer, undefined, () => initial ?? initialFlow(newConsultId(), Date.now()))
  /** `checking` until the saved consult has been read; `offer` while the resume prompt is up. */
  const [boot, setBoot] = useState<'checking' | 'offer' | 'ready'>(persist ? 'checking' : 'ready')
  const [offered, setOffered] = useState<FlowState | null>(null)
  const [watching, setWatching] = useState<number | null>(null)
  const watchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)

  // Read the save once, on mount. Same tab → straight back in. Otherwise ask.
  useEffect(() => {
    if (!persist) return
    const saved = loadConsult()
    if (isResumable(saved)) {
      if (isSameSession(saved.consultId)) {
        dispatch({ type: 'restore', state: saved })
        setBoot('ready')
      } else {
        setOffered(saved)
        setBoot('offer')
      }
    } else {
      setBoot('ready')
    }
  }, [persist])

  // Save after every change, once we know we aren't about to overwrite a save
  // the visitor hasn't decided about yet.
  useEffect(() => {
    if (persist && boot === 'ready') saveConsult({ ...state, updatedAt: Date.now() })
  }, [state, boot, persist])

  useEffect(() => () => {
    if (watchTimer.current) clearTimeout(watchTimer.current)
  }, [])

  if (boot === 'checking') return <ConsultRoot>{null}</ConsultRoot>

  if (boot === 'offer' && offered) {
    return (
      <ConsultRoot>
        <ResumePrompt
          saved={offered}
          onResume={() => {
            dispatch({ type: 'restore', state: { ...offered, direction: 'forward' } })
            setBoot('ready')
          }}
          onFresh={() => {
            clearConsult()
            dispatch({ type: 'reset', consultId: newConsultId(), now: Date.now() })
            setBoot('ready')
          }}
        />
      </ConsultRoot>
    )
  }

  const scene = sceneDef(state.sceneId)
  const order = visibleScenes(state.answers)
  const index = order.indexOf(state.sceneId) + 1
  const previous = state.history[state.history.length - 1]
  const reaction = previous ? reactionTo(previous, state.answers) : ''
  const ready = isAnswered(state.sceneId, state.answers)

  const interact = (lean: number) => {
    setWatching(lean)
    if (watchTimer.current) clearTimeout(watchTimer.current)
    watchTimer.current = setTimeout(() => setWatching(null), DURATION.watch)
  }
  const answer = (patch: Partial<ConsultAnswers>) => {
    dispatch({ type: 'answer', patch })
    interact(0)
  }
  const next = () => {
    const after = flowReducer(state, { type: 'next' })
    dispatch({ type: 'next' })
    if (after.phase === 'analysis') onComplete?.(after)
  }
  const back = () => (state.history.length > 0 ? dispatch({ type: 'back' }) : onExit?.())
  const jumpToSection = (section: string) => {
    const target = firstSceneIn(section as SectionId, state.answers)
    if (target) dispatch({ type: 'jump', sceneId: target })
  }
  const editFromReview = (id: SceneId) => dispatch({ type: 'jump', sceneId: id, returnTo: 'review' })

  if (state.phase !== 'scenes') {
    return (
      <ConsultRoot>
        <Finished
          state={state}
          onRestart={() => {
            clearConsult()
            dispatch({ type: 'reset', consultId: newConsultId(), now: Date.now() })
          }}
          onBack={() => dispatch({ type: 'jump', sceneId: 'circuit' })}
        />
      </ConsultRoot>
    )
  }

  const mode = scene.mode ?? 'charge'
  const ampState: AmpState = mode === 'calm' ? 'calm' : watching !== null ? 'watching' : 'idle'
  const nextLabel = state.returnTo ? 'Back to review' : scene.copy.next ?? 'Next'

  return (
    <ConsultRoot mode={mode} comfort={state.answers.comfort}>
      <SceneStage sceneKey={state.sceneId} direction={state.direction} headingRef={headingRef}>
        <SceneShell
          index={index}
          total={order.length}
          sectionLabel={scene.label}
          meter={sectionProgress(state)}
          currentSectionId={scene.section}
          onJump={jumpToSection}
          onBack={state.history.length > 0 || onExit ? back : undefined}
          amp={<Amp state={ampState} lean={watching ?? 0} />}
          reaction={reaction}
          question={scene.copy.question}
          hint={scene.copy.hint}
          headingRef={headingRef}
          action={
            <NextButton ready={ready} nudge={NUDGES[state.sceneId]} resetKey={state.sceneId} onClick={next}>
              {nextLabel}
            </NextButton>
          }
          footer={mode === 'calm' ? undefined : <QuietLink icon="spark">Tell Amp more</QuietLink>}
        >
          <SceneRenderer
            scene={scene}
            answers={state.answers}
            onAnswer={answer}
            comfort={state.answers.comfort}
            order={order}
            onEdit={editFromReview}
            onInteract={interact}
          />
        </SceneShell>
      </SceneStage>
    </ConsultRoot>
  )
}

function ResumePrompt({ saved, onResume, onFresh }: { saved: FlowState; onResume: () => void; onFresh: () => void }) {
  const def = sceneDef(saved.sceneId)
  return (
    <div
      className="mx-auto flex flex-col justify-center"
      style={{ maxWidth: 'var(--amp-column)', minHeight: 'var(--app-height, 100dvh)', padding: 'var(--amp-space-8) var(--amp-gutter)', gap: 'var(--amp-space-4)' }}
    >
      <Amp state="idle" size="md" />
      <h1 className="uppercase" style={{ fontFamily: 'var(--amp-font-display)', fontWeight: 'var(--amp-weight-heavy)', fontSize: 'var(--amp-text-question)', lineHeight: 'var(--amp-leading-question)' }}>
        Pick up where you left off?
      </h1>
      <p style={{ color: 'var(--amp-ink-2)' }}>
        You were on <strong style={{ color: 'var(--amp-ink)' }}>{def.label.toLowerCase()}</strong>. Everything you&apos;d answered is still here.
      </p>
      <NextButton onClick={onResume}>Resume</NextButton>
      <QuietLink onClick={onFresh}>Start fresh</QuietLink>
    </div>
  )
}

/** Stand-in for the analysis and handoff until level 3 builds them. */
function Finished({ state, onRestart, onBack }: { state: FlowState; onRestart: () => void; onBack: () => void }) {
  return (
    <div
      className="mx-auto flex flex-col justify-center"
      style={{ maxWidth: 'var(--amp-column)', minHeight: 'var(--app-height, 100dvh)', padding: 'var(--amp-space-8) var(--amp-gutter)', gap: 'var(--amp-space-4)' }}
    >
      <Amp state="charged" size="md" />
      <p className="uppercase" style={{ fontFamily: 'var(--amp-font-mono)', fontSize: 'var(--amp-text-data)', letterSpacing: 'var(--amp-tracking-data)', color: 'var(--amp-accent)' }}>
        {state.consultId}
      </p>
      <h1 className="uppercase" style={{ fontFamily: 'var(--amp-font-display)', fontWeight: 'var(--amp-weight-heavy)', fontSize: 'var(--amp-text-question)', lineHeight: 'var(--amp-leading-question)' }}>
        Everything&apos;s in
      </h1>
      <p style={{ color: 'var(--amp-ink-2)' }}>
        All your answers are collected. The analysis and charge-up come next in the build.
      </p>
      <NextButton onClick={onRestart}>Start again</NextButton>
      <QuietLink onClick={onBack}>Back to the circuit check</QuietLink>
    </div>
  )
}

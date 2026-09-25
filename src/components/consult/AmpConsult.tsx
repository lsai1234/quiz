'use client'

import { useReducer, useRef } from 'react'
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
import { reactionTo } from '@/lib/consult/reactions'
import type { ConsultAnswers, SceneId, SectionId } from '@/lib/consult/types'
import { ConsultRoot } from './ConsultRoot'
import { SceneShell } from './SceneShell'
import { SceneStage } from './SceneStage'
import { NextButton, QuietLink } from './controls'
import { PlaceholderScene } from './scenes/PlaceholderScene'
import { ReviewScene } from './scenes/ReviewScene'

/**
 * The Amp Consult, end to end.
 *
 * Holds the flow state (`lib/consult/flow.ts`) and renders the current scene
 * into the shell. Every rule — what's next, what Back does, whether Next is
 * allowed — lives in the reducer; this component only wires it to the screen.
 */

interface Props {
  /** Called when the visitor backs out of the first scene. */
  onExit?: () => void
  /** Called once the consult has finished collecting (after the circuit check). */
  onComplete?: (state: FlowState) => void
  /** Start from a known state — the workshop and tests use this. */
  initial?: FlowState
}

export function AmpConsult({ onExit, onComplete, initial }: Props) {
  const [state, dispatch] = useReducer(flowReducer, undefined, () => initial ?? initialFlow(newConsultId(), Date.now()))
  const headingRef = useRef<HTMLHeadingElement>(null)

  const scene = sceneDef(state.sceneId)
  const order = visibleScenes(state.answers)
  const index = order.indexOf(state.sceneId) + 1
  const previous = state.history[state.history.length - 1]
  const reaction = previous ? reactionTo(previous, state.answers) : ''
  const ready = isAnswered(state.sceneId, state.answers)

  const answer = (patch: Partial<ConsultAnswers>) => dispatch({ type: 'answer', patch })
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
        <Finished state={state} onRestart={() => dispatch({ type: 'reset', consultId: newConsultId(), now: Date.now() })} onBack={() => dispatch({ type: 'jump', sceneId: 'circuit' })} />
      </ConsultRoot>
    )
  }

  const nextLabel = state.returnTo ? 'Back to review' : scene.copy.next ?? 'Next'

  return (
    <ConsultRoot mode={scene.mode ?? 'charge'} comfort={state.answers.comfort}>
      <SceneStage sceneKey={state.sceneId} direction={state.direction} headingRef={headingRef}>
        <SceneShell
          index={index}
          total={order.length}
          sectionLabel={scene.label}
          meter={sectionProgress(state)}
          currentSectionId={scene.section}
          onJump={jumpToSection}
          onBack={state.history.length > 0 || onExit ? back : undefined}
          reaction={reaction}
          question={scene.copy.question}
          hint={scene.copy.hint}
          headingRef={headingRef}
          action={
            <NextButton ready={ready} nudge={NUDGES[state.sceneId]} resetKey={state.sceneId} onClick={next}>
              {nextLabel}
            </NextButton>
          }
          footer={scene.mode === 'calm' ? undefined : <QuietLink icon="spark">Tell Amp more</QuietLink>}
        >
          {scene.interaction === 'review' ? (
            <ReviewScene scenes={order} answers={state.answers} onEdit={editFromReview} />
          ) : (
            <PlaceholderScene scene={scene} answers={state.answers} onAnswer={answer} />
          )}
        </SceneShell>
      </SceneStage>
    </ConsultRoot>
  )
}

/** Stand-in for the analysis and handoff until level 3 builds them. */
function Finished({ state, onRestart, onBack }: { state: FlowState; onRestart: () => void; onBack: () => void }) {
  return (
    <div
      className="mx-auto flex flex-col justify-center"
      style={{ maxWidth: 'var(--amp-column)', minHeight: 'var(--app-height, 100dvh)', padding: 'var(--amp-space-8) var(--amp-gutter)', gap: 'var(--amp-space-4)' }}
    >
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

'use client'

import { useEffect, useReducer, useRef, useState } from 'react'
import {
  NUDGES,
  firstSceneIn,
  flowReducer,
  initialFlow,
  isAnswered,
  newConsultId,
  resolveSceneDef,
  sceneDef,
  sectionProgress,
  visibleScenes,
  type FlowState,
} from '@/lib/consult/flow'
import { DURATION } from '@/lib/consult/motion'
import { reactionTo } from '@/lib/consult/reactions'
import { STOP_COPY, circuitOutcome } from '@/lib/consult/circuit'
import { clearConsult, isResumable, isSameSession, loadConsult, saveConsult } from '@/lib/consult/persist'
import type { ConsultAnswers, Route, SceneId, SectionId } from '@/lib/consult/types'
import { Amp, type AmpState } from './Amp'
import { ConsultRoot } from './ConsultRoot'
import { SceneShell } from './SceneShell'
import { SceneStage } from './SceneStage'
import { NextButton, QuietLink, Tile } from './controls'
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

  const scene = resolveSceneDef(state.sceneId, state.answers)
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
  const back = () => (state.history.length > 0 || state.answers.route ? dispatch({ type: 'back' }) : onExit?.())
  const jumpToSection = (section: string) => {
    const target = firstSceneIn(section as SectionId, state.answers)
    if (target) dispatch({ type: 'jump', sceneId: target })
  }
  const editFromReview = (id: SceneId) => dispatch({ type: 'jump', sceneId: id, returnTo: 'review' })

  if (state.phase === 'intro') {
    return (
      <ConsultRoot>
        <SceneStage sceneKey="intro" direction={state.direction} headingRef={headingRef}>
          <RouteChoice headingRef={headingRef} onPick={(route) => dispatch({ type: 'route', route })} onBack={onExit} />
        </SceneStage>
      </ConsultRoot>
    )
  }

  if (state.phase === 'stop') {
    const outcome = circuitOutcome(state.answers)
    return (
      <ConsultRoot mode="calm" comfort={state.answers.comfort}>
        <SceneStage sceneKey="stop" direction={state.direction} headingRef={headingRef}>
          <StopScreen
            reason={outcome.kind === 'stop' ? outcome.reason : 'declined'}
            headingRef={headingRef}
            onChange={() => dispatch({ type: 'jump', sceneId: 'circuit' })}
            onExit={onExit}
          />
        </SceneStage>
      </ConsultRoot>
    )
  }

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
          footer={
            <div className="flex flex-wrap items-center justify-center" style={{ gap: 'var(--amp-space-2)' }}>
              {mode !== 'calm' && <QuietLink icon="spark">Tell Amp more</QuietLink>}
              <QuietLink icon="comfort" aria-pressed={state.answers.comfort} onClick={() => answer({ comfort: !state.answers.comfort, comfortOffered: true })}>
                {state.answers.comfort ? 'Standard size' : 'Bigger text'}
              </QuietLink>
            </div>
          }
        >
          {offerComfort(state.answers, state.sceneId) && (
            <ComfortOffer
              onYes={() => answer({ comfort: true, comfortOffered: true })}
              onNo={() => answer({ comfortOffered: true })}
            />
          )}
          <SceneRenderer
            scene={scene}
            answers={state.answers}
            onAnswer={answer}
            comfort={state.answers.comfort}
            order={order}
            onEdit={editFromReview}
            onInteract={interact}
            onDecline={scene.id === 'circuit' ? () => dispatch({ type: 'decline' }) : undefined}
          />
        </SceneShell>
      </SceneStage>
    </ConsultRoot>
  )
}

/**
 * Stop & signpost (build H3).
 *
 * A warm dead end. The circuit check said this consult shouldn't go on to a
 * stack, so it doesn't: no analysis, no results page, no products. It says
 * why in plain words, points to the person who can help, and lets them go back
 * and change an answer in case a switch was tapped by mistake.
 */
function StopScreen({
  reason,
  headingRef,
  onChange,
  onExit,
}: {
  reason: keyof typeof STOP_COPY
  headingRef: React.Ref<HTMLHeadingElement>
  onChange: () => void
  onExit?: () => void
}) {
  const copy = STOP_COPY[reason]
  return (
    <div
      className="mx-auto flex flex-col"
      style={{
        maxWidth: 'var(--amp-column)',
        minHeight: 'var(--app-height, 100dvh)',
        padding: 'max(var(--amp-space-4), env(safe-area-inset-top)) var(--amp-gutter) max(var(--amp-space-5), env(safe-area-inset-bottom))',
        gap: 'var(--amp-space-4)',
      }}
    >
      <p className="uppercase" style={{ fontFamily: 'var(--amp-font-mono)', fontSize: 'var(--amp-text-data)', letterSpacing: 'var(--amp-tracking-data)', color: 'var(--amp-ink-3)', paddingTop: 'var(--amp-space-3)' }}>
        Circuit check · paused
      </p>
      <div className="flex items-center" style={{ gap: 'var(--amp-space-2)' }}>
        <Amp state="calm" />
      </div>
      <h1
        ref={headingRef}
        tabIndex={-1}
        className="uppercase"
        style={{ fontFamily: 'var(--amp-font-display)', fontWeight: 'var(--amp-weight-heavy)', fontSize: 'var(--amp-text-question)', lineHeight: 'var(--amp-leading-question)', outline: 'none' }}
      >
        {copy.title}
      </h1>
      <div className="flex flex-1 flex-col justify-center">
        <div
          role="status"
          style={{
            padding: 'var(--amp-space-5)',
            borderRadius: 'var(--amp-radius-panel)',
            border: 'var(--amp-hairline) solid var(--amp-caution-line)',
            background: 'var(--amp-caution-fill)',
            fontSize: 'var(--amp-text-lead)',
            lineHeight: 'var(--amp-leading-body)',
          }}
        >
          <p>{copy.body}</p>
          <p style={{ marginTop: 'var(--amp-space-3)' }}>{copy.who}</p>
        </div>
      </div>
      <div className="flex flex-col" style={{ gap: 'var(--amp-space-2)' }}>
        {reason === 'declined' ? (
          <a
            href="/shop"
            className="amp-press flex items-center justify-center"
            style={{ minHeight: 'calc(var(--amp-target) + var(--amp-space-1))', borderRadius: 'var(--amp-radius-tile)', border: 'var(--amp-hairline) solid var(--amp-edge-strong)', fontWeight: 'var(--amp-weight-bold)', color: 'var(--amp-ink)' }}
          >
            Browse the shop
          </a>
        ) : null}
        <QuietLink icon="back" onClick={onChange}>
          {reason === 'declined' ? 'Back to the circuit check' : 'I tapped something by mistake'}
        </QuietLink>
        {onExit && <QuietLink onClick={onExit}>Back to the start</QuietLink>}
      </div>
    </div>
  )
}

/**
 * Comfort mode is offered, once, to people who picked healthy ageing or an
 * older age band (C14) — from the scene after "about you", so it arrives as
 * soon as we know. Anyone can switch it on or off from the footer.
 */
export function offerComfort(a: ConsultAnswers, scene: SceneId): boolean {
  if (a.comfort || a.comfortOffered || scene === 'goals' || scene === 'about' || scene === 'circuit') return false
  return a.goals.includes('ageing') || a.age === '55-64' || a.age === '65-plus'
}

function ComfortOffer({ onYes, onNo }: { onYes: () => void; onNo: () => void }) {
  return (
    <div
      role="region"
      aria-label="Comfort mode"
      className="flex flex-col amp-anim-rise"
      style={{
        gap: 'var(--amp-space-3)',
        marginBottom: 'var(--amp-space-5)',
        padding: 'var(--amp-space-4)',
        borderRadius: 'var(--amp-radius-tile)',
        border: 'var(--amp-hairline) solid var(--amp-accent-line)',
        background: 'var(--amp-accent-fill)',
      }}
    >
      <p style={{ fontSize: 'var(--amp-text-body)' }}>
        Want bigger text and buttons, and no fiddly dragging? Same questions, gentler pace.
      </p>
      <div className="flex flex-wrap" style={{ gap: 'var(--amp-space-2)' }}>
        <Tile kind="toggle" layout="row" icon="comfort" label="Yes, comfort mode" selected={false} onSelect={onYes} />
        <QuietLink onClick={onNo}>No thanks</QuietLink>
      </div>
    </div>
  )
}

/**
 * Speed run or deep charge (build C13). The choice at the start: about a
 * minute with the scenes that matter most, or the full set.
 */
function RouteChoice({ onPick, onBack, headingRef }: { onPick: (route: Route) => void; onBack?: () => void; headingRef: React.Ref<HTMLHeadingElement> }) {
  return (
    <div
      className="mx-auto flex flex-col"
      style={{
        maxWidth: 'var(--amp-column)',
        minHeight: 'var(--app-height, 100dvh)',
        padding: 'max(var(--amp-space-4), env(safe-area-inset-top)) var(--amp-gutter) max(var(--amp-space-5), env(safe-area-inset-bottom))',
        gap: 'var(--amp-space-4)',
      }}
    >
      <div className="flex items-center" style={{ minHeight: 'calc(var(--amp-space-8) + var(--amp-space-1))' }}>
        {onBack && <QuietLink icon="back" onClick={onBack}>Back</QuietLink>}
      </div>
      <div className="flex flex-1 flex-col justify-center" style={{ gap: 'var(--amp-space-4)' }}>
        <Amp state="idle" size="md" />
        <p className="uppercase" style={{ fontFamily: 'var(--amp-font-mono)', fontSize: 'var(--amp-text-data)', letterSpacing: 'var(--amp-tracking-data)', color: 'var(--amp-accent)' }}>
          I&apos;m Amp. Let&apos;s charge you up.
        </p>
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="uppercase"
          style={{ fontFamily: 'var(--amp-font-display)', fontWeight: 'var(--amp-weight-heavy)', fontSize: 'var(--amp-text-question)', lineHeight: 'var(--amp-leading-question)', outline: 'none' }}
        >
          How much time have you got?
        </h1>
        <p style={{ color: 'var(--amp-ink-2)', fontSize: 'var(--amp-text-meta)' }}>
          Nothing gets decided until I&apos;ve got the full picture and you&apos;ve checked it.
        </p>
        <div role="radiogroup" aria-label="Route" className="flex flex-col" style={{ gap: 'var(--amp-space-3)', marginTop: 'var(--amp-space-2)' }}>
          <Tile kind="radio" layout="row" icon="bolt" label="Speed run" sub="About a minute · the essentials" selected={false} onSelect={() => onPick('speed')} />
          <Tile kind="radio" layout="row" icon="battery" label="Deep charge" sub="A few minutes · the full picture" selected={false} onSelect={() => onPick('deep')} />
        </div>
      </div>
    </div>
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

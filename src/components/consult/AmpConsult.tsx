'use client'

import { focus as pinpointFocus } from '@/lib/consult/pinpoint/choose'
import { pinpointReactionLine, pinpointView } from '@/lib/consult/pinpoint/screen'
import { expectedQuestions } from '@/lib/consult/pinpoint/expect'
import { INVITE_COPY, inviteLine } from '@/lib/consult/hunch-copy'
import { comboFor } from '@/lib/consult/combo-reactions'
import { AMP_NEXT_EVENT, rigFor } from '@/lib/consult/amp-rig'
import type { PinpointStage } from '@/lib/consult/pinpoint/types'
import { Reticle } from './pinpoint/Reticle'
import { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import {
  NUDGES,
  backStep,
  hunchLead,
  screenKey,
  teaser,
  firstSceneIn,
  hintFor,
  flowReducer,
  initialFlow,
  isAnswered,
  newConsultId,
  resolveSceneDef,
  sceneDef,
  sectionProgress,
  visibleScenes,
  type FlowState,
  sceneAfter,
} from '@/lib/consult/flow'
import { DURATION, type AmpReaction } from '@/lib/consult/motion'
import { ampReactionTo, reactionTo } from '@/lib/consult/reactions'
import { STOP_COPY, stopReason } from '@/lib/consult/circuit'
import { clearConsult, isResumable, isSameSession, loadConsult, saveConsult } from '@/lib/consult/persist'
import { finishedConsult, reopenAtReview, rememberFinished } from '@/lib/consult/session'
import { markResultsOpen } from '@/lib/consult/results-tab'
import type { ConsultAnswers, SceneId, SectionId } from '@/lib/consult/types'
import { Amp, type AmpState } from './Amp'
import { TrackerSheet } from './TrackerSheet'
import { voiceSupported } from './HoldToTalk'
import { CONSULT_FEATURES } from '@/lib/consult/features'
import { toSpeech, useReadAloud } from './useReadAloud'
import { ConsultRoot } from './ConsultRoot'
import { SceneShell } from './SceneShell'
import { SceneStage } from './SceneStage'
import { Hint, NextButton, QuietLink } from './controls'
import { Plain } from './pinpoint/parts'
import { SceneRenderer, preloadLaterScenes, resolveScene } from './scenes/registry'
import { hunchLine, notesOf, readNotes, usePinpointAi } from './pinpoint/pinpointAi'
import { pickToPatch, type Pick } from '@/lib/consult/ai/understand'
import { Analysis } from './Analysis'
import { useConsultAnalytics } from './useConsultAnalytics'
import { useAiCopy } from './useAiCopy'
import { TellAmpMore } from './TellAmpMore'
import { AmpNoted, TellInline, TellLead } from './SceneTell'
import { useQuizArmState } from '@/lib/experiments/client'
import { consultFunnel } from '@/lib/analytics/consult'
import type { ResultsBundle } from '@/lib/consult/results'
import type { CatalogueProduct } from '@/lib/catalogue/types'

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
  /**
   * Called with "See my stack": the results page's data is already in the
   * store (`applyToResultsPage`), so the caller only has to open it.
   */
  onHandoff?: (bundle: ResultsBundle) => void
  /** Start from a known state — the workshop and tests use this. Disables saving. */
  initial?: FlowState
  /** Where the catalogue comes from. Defaults to the shop's. */
  loadProducts?: () => Promise<CatalogueProduct[]>
  /**
   * "Change my answers" from the results page (H10): open the last finished
   * consult on its review screen instead of starting a new one.
   */
  reopen?: boolean
  /**
   * Force the AI layer on or off, overriding the hub's switch. The founder
   * preview at /quizv2 sets it from whether the server has an OpenAI key.
   */
  ai?: boolean
}

const PINPOINT_SCENES: SceneId[] = ['follow-move', 'follow-rest', 'follow-fuel', 'pinpoint']

export function AmpConsult({ onExit, onComplete, onHandoff, initial, loadProducts, reopen, ai }: Props) {
  const persist = !initial
  const [reopened] = useState(() => (reopen ? finishedConsult() : null))
  const [state, dispatch] = useReducer(flowReducer, undefined, () =>
    initial ?? (reopened ? reopenAtReview(reopened) : initialFlow(newConsultId(), Date.now())),
  )
  /** `checking` until the saved consult has been read; `offer` while the resume prompt is up. */
  const [boot, setBoot] = useState<'checking' | 'offer' | 'ready'>(persist && !reopened ? 'checking' : 'ready')
  const [offered, setOffered] = useState<FlowState | null>(null)
  const [watching, setWatching] = useState<number | null>(null)
  /** "Tell Amp more" is open (V3), and whether Amp is reading what was typed. */
  const [telling, setTelling] = useState(false)
  /** What a typed answer set, said as Amp's line on that scene. */
  const [heard, setHeard] = useState<{ scene: SceneId; text: string } | null>(null)
  /** A typed answer answered this scene: move on after a beat. */
  const [autoNext, setAutoNext] = useState<SceneId | null>(null)
  const [thinking, setThinking] = useState(false)
  /** An upload is being read (U1/U2), and whether the tracker sheet is open. */
  const [reading, setReading] = useState(false)
  const [tracking, setTracking] = useState(false)
  /** Where to say comfort mode just switched itself on: the scene after the age answer. */
  const [comfortNote, setComfortNote] = useState<SceneId | 'pending' | null>(null)
  useEffect(() => {
    setComfortNote((n) => (n === 'pending' ? state.sceneId : null))
    // Only on arrival at a new scene.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.sceneId])
  /** Whether this browser can record, so the link can say "type or talk" (U3). After mount: the server can't know. */
  const [canTalk, setCanTalk] = useState(false)
  useEffect(() => setCanTalk(CONSULT_FEATURES.voice && voiceSupported()), [])
  /** Amp's micro-reaction to the last answer (U6), numbered so a repeat plays again. */
  const [ampReaction, setAmpReaction] = useState<{ name: AmpReaction; id: number; scene: SceneId } | null>(null)
  const watchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)

  // The later scenes' code (Pinpoint, the protein check): fetched once they're
  // under way, after scene one, so it never competes with the first paint and
  // is long in hand before anyone reaches either.
  const underWay = state.history.length > 0 || state.answers.goals.length > 0
  useEffect(() => {
    if (underWay) preloadLaterScenes()
  }, [underWay])

  // Shared-element flights (plan Phase 7.1): an answer flies into its slot as
  // the next scene arrives. The code arrives once they're under way; until it
  // has, and under reduced motion, nothing flies and nothing waits for it.
  const reducedMotion = useReducedMotion()
  const flights = useRef<typeof import('@/lib/consult/flight') | null>(null)
  // The day ring (plan Phase 7.3): its code arrives once they're under way.
  const [ringMod, setRingMod] = useState<typeof import('./DayRing') | null>(null)
  useEffect(() => {
    if (underWay && !ringMod) void import('./DayRing').then(setRingMod)
  }, [underWay, ringMod])
  const pendingFlight = useRef<{ token: import('@/lib/consult/flight').FlightToken; from: import('@/lib/consult/flight').Box } | null>(null)
  useEffect(() => {
    if (underWay && !reducedMotion && !flights.current) void import('@/lib/consult/flight').then((m) => (flights.current = m))
  }, [underWay, reducedMotion])
  /** Before Next: take off from the scene being answered, if its answer has a slot. */
  const takeOff = () => {
    const m = flights.current
    const source = document.querySelector('[data-flight-source]')
    const token = m && !reducedMotion && source ? m.flightToken(state.sceneId, state.answers) : null
    pendingFlight.current = token && source ? { token, from: m!.settledBox(source) } : null
  }
  // After Next, as the new scene arrives: land in its slot (Amp, until the day ring).
  useLayoutEffect(() => {
    const p = pendingFlight.current
    pendingFlight.current = null
    if (!p || !flights.current) return
    const target = document.querySelector(`[data-flight-slot="${p.token.slot}"]`) ?? document.querySelector('[data-flight-slot="amp"]')
    if (target) flights.current.fly(p.token, p.from, target, (target.closest('.amp-consult') as HTMLElement | null) ?? undefined)
  }, [state.sceneId])

  // Read the save once, on mount. Same tab → straight back in. Otherwise ask.
  useEffect(() => {
    if (!persist || reopened) return
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
  }, [persist, reopened])

  // Save after every change, once we know we aren't about to overwrite a save
  // the visitor hasn't decided about yet.
  useEffect(() => {
    if (persist && boot === 'ready') saveConsult({ ...state, updatedAt: Date.now() })
  }, [state, boot, persist])

  // Leaving a scene ends its reaction, so coming back doesn't replay it.
  useEffect(() => setAmpReaction(null), [state.sceneId])

  useEffect(() => () => {
    if (watchTimer.current) clearTimeout(watchTimer.current)
  }, [])

  // The funnel (H12). Not for the workshop or tests that start from a fixed state.
  const { noteInteraction } = useConsultAnalytics(state, persist && boot === 'ready')

  // Amp's words (V1/V2): only when switched on in the hub, and never for a
  // fixed-state run (the workshop, tests).
  const { consultAi: hubAi } = useQuizArmState()
  // The founder preview decides for itself (it's on whenever the server has a
  // key); everywhere else follows the hub's switch.
  const consultAi = ai ?? hubAi
  const { words, unavailable: aiUnavailable } = useAiCopy(state, consultAi && persist)

  // Read aloud (U4): comfort mode reads each question out. A hook, so it's
  // worked out before the early returns below.
  const onScene = boot === 'ready' && state.phase === 'scenes'
  const shown = onScene ? words(resolveSceneDef(state.sceneId, state.answers)).copy : null
  // Pinpoint screens word themselves, one question at a time (plan v5).
  const pView = onScene && PINPOINT_SCENES.includes(state.sceneId) ? pinpointView(state.sceneId as PinpointStage, state.answers) : null
  const pKey = pView ? (pView.kind === 'probe' ? pView.probe.id : pView.kind === 'hunch' ? pView.lead.pattern.id : pView.kind) : ''
  // Pinpoint's AI (plan v5 §7): asked ahead, used only if in hand on arrival.
  const pinpointAi = consultAi && !aiUnavailable
  const comingUp = state.phase === 'scenes' && isAnswered(state.sceneId, state.answers) ? sceneAfter(state.sceneId, state.answers) : null
  usePinpointAi(state.answers, state.sceneId, comingUp, pinpointAi)
  // The notes typed answers left, read together for what they point to, just
  // before the round or the review uses it. Read again when a note changes.
  const notesKey = notesOf(state.answers).join('|')
  const readingNotes = pinpointAi && state.phase === 'scenes' && state.answers.noteHints === null && notesKey !== '' &&
    [state.sceneId, comingUp].some((id) => id === 'pinpoint' || id === 'review')
  useEffect(() => {
    if (!readingNotes) return
    let live = true
    const asked = state.answers
    void readNotes(asked).then((hints) => {
      if (live) dispatch({ type: 'answer', patch: { noteHints: hints ?? [] } })
    })
    return () => {
      live = false
    }
    // Once per set of notes: the answers are read as they were when asked.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readingNotes, notesKey])
  const hunchLock = useRef<{ key: string; line: string | null }>({ key: '', line: null })
  if (pView?.kind === 'hunch' && hunchLock.current.key !== pKey) hunchLock.current = { key: pKey, line: pinpointAi ? hunchLine(pView.lead, state.answers) : null }
  if (pView && pView.kind === 'hunch' && hunchLock.current.line) pView.hint = hunchLock.current.line
  const spoken = pView ? toSpeech(pView.heading, pView.kind === 'probe' ? [pView.text, pView.hint].filter(Boolean).join(' ') : pView.hint) : shown ? toSpeech(shown.question, hintFor(shown, state.answers.comfort)) : ''
  const aloud = useReadAloud(onScene ? `${state.sceneId}:${pKey}` : state.phase, spoken, onScene && state.answers.comfort)

  // The phone's back gesture (plan Phase 6): one browser history entry per
  // screen, so the gesture goes back a screen, or undoes the last Pinpoint
  // answer, instead of leaving the page. Every step back, from the Back
  // button or the gesture, goes through `stepBack`; a Back button press takes
  // its entry off the browser's history too, so the two never drift apart.
  const backing = useRef(false)
  const stepBack = useRef<(exit: boolean) => void>(() => {})
  stepBack.current = (exit) => {
    const step = backStep(state)
    if (!step) return exit ? onExit?.() : undefined
    backing.current = true
    dispatch(step)
  }
  /** Our entries on the browser's history, above the page's own. */
  const entries = useRef(0)
  /** Pops we caused ourselves (a Back button press), to let through. */
  const ownPops = useRef(0)
  const lastKey = useRef<string | null>(null)
  const tracksHistory = persist && boot === 'ready'
  const key = screenKey(state)
  useEffect(() => {
    if (!tracksHistory || state.phase === 'done' || lastKey.current === key) return
    const first = lastKey.current === null
    lastKey.current = key
    const wasBack = backing.current
    backing.current = false
    // Forward a screen: a new entry. Back, or on arrival: make sure there is
    // one to catch the next gesture while there's still somewhere to go back
    // to (a resumed consult starts with none).
    if ((!first && !wasBack) || (entries.current === 0 && backStep(state))) {
      window.history.pushState({ ampConsult: state.consultId }, '')
      entries.current++
    }
    // Only the screen decides; the rest of the state rides along.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracksHistory, key])
  useEffect(() => {
    if (!tracksHistory) return
    const onPop = () => {
      if (ownPops.current > 0) {
        ownPops.current--
        return
      }
      if (entries.current === 0) return
      entries.current--
      stepBack.current(false)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [tracksHistory])

  // What a hunch invite says: the lead, and the questions Pinpoint expects to
  // ask. Worked out once, when the invite opens.
  const invite = useMemo(() => {
    if (state.phase !== 'invite') return null
    const lead = hunchLead(state.answers)
    return lead ? inviteLine(lead.pattern.id, expectedQuestions(state.answers)) : null
  }, [state.phase, state.answers])

  // The beat, then Next: only while still on that scene and still answered.
  useEffect(() => {
    if (!autoNext) return
    if (autoNext !== state.sceneId || state.phase !== 'scenes' || !isAnswered(state.sceneId, state.answers)) {
      setAutoNext(null)
      return
    }
    const timer = setTimeout(() => {
      setAutoNext(null)
      const after = flowReducer(state, { type: 'next' })
      if (after.sceneId !== state.sceneId) takeOff()
      dispatch({ type: 'next' })
      if (after.phase === 'analysis') onComplete?.(after)
    }, DURATION.heard)
    return () => clearTimeout(timer)
    // The scene and its answers are what matter; the rest follows from them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoNext, state.sceneId, state.phase, state.answers])
  // "Got it" belongs to the scene it was said on, once.
  useEffect(() => {
    if (heard && heard.scene !== state.sceneId) setHeard(null)
  }, [heard, state.sceneId])

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

  // Only once the scene is actually showing: words() fixes a scene's wording
  // for the visit, and the invite and the stop sit over a scene without showing it.
  const baseScene = resolveSceneDef(state.sceneId, state.answers)
  const scene = state.phase === 'scenes' ? words(baseScene) : baseScene
  const order = visibleScenes(state.answers)
  // Pinpoint taken up after the core scenes (the invite, or the review's
  // offer) opens on screens that sit earlier in the order: count what is
  // behind them, so the counter carries on from 12/12 rather than jumping back.
  const onPinpoint = PINPOINT_SCENES.includes(state.sceneId)
  const index = onPinpoint ? Math.min(order.length, new Set(state.history.filter((id) => order.includes(id))).size + 1) : order.indexOf(state.sceneId) + 1
  const last = state.history[state.history.length - 1]
  // A Pinpoint screen reached from somewhere other than the scene before it
  // (the invite, the review) has no answer of its own to react to.
  const previous = onPinpoint && last !== order[order.indexOf(state.sceneId) - 1] ? undefined : last
  // Amp's line about the last answer. After the Rest section, the teaser
  // holds back a theory (scripted, never the AI's). Otherwise the AI's (V4)
  // when it has one; then two answers that point the same way, said
  // together; then the single answer.
  const reaction =
    teaser(previous, state.answers)?.line ??
    scene.copy.react ??
    (previous ? comboFor(previous, state.answers)?.line(state.answers) ?? reactionTo(previous, state.answers) : '')
  const ready = isAnswered(state.sceneId, state.answers)

  const interact = (lean: number) => {
    setWatching(lean)
    if (watchTimer.current) clearTimeout(watchTimer.current)
    watchTimer.current = setTimeout(() => setWatching(null), DURATION.watch)
  }
  const answer = (given: Partial<ConsultAnswers>) => {
    let patch = given
    // The age answer decides comfort mode, once: after that it's theirs.
    if (patch.age && !state.answers.comfortOffered && !state.answers.comfort && autoComfort({ ...state.answers, ...patch })) {
      patch = { ...patch, comfort: true, comfortOffered: true }
      consultFunnel.comfort({ on: true, via: 'auto' })
      setComfortNote('pending')
    }
    // Never in calm mode: the circuit check stays still.
    const r = scene.mode === 'calm' ? null : ampReactionTo(state.answers, patch)
    if (r) setAmpReaction((was) => ({ name: r, id: (was?.id ?? 0) + 1, scene: state.sceneId }))
    dispatch({ type: 'answer', patch })
    noteInteraction()
    interact(0)
  }
  const next = () => {
    const after = flowReducer(state, { type: 'next' })
    if (after.sceneId !== state.sceneId) takeOff()
    if (after.sceneId !== state.sceneId || after.phase !== state.phase) window.dispatchEvent(new Event(AMP_NEXT_EVENT))
    dispatch({ type: 'next' })
    if (after.phase === 'analysis') onComplete?.(after)
  }
  const back = () => {
    // Inside the round, Back takes back the last answer first (plan v5);
    // `backStep` decides. The browser's entry for this screen goes with it.
    if (entries.current > 0 && backStep(state)) {
      ownPops.current++
      entries.current--
      window.history.back()
    }
    stepBack.current(true)
  }
  const jumpToSection = (section: string) => {
    const target = firstSceneIn(section as SectionId, state.answers)
    if (target) dispatch({ type: 'jump', sceneId: target })
  }
  const editFromReview = (id: SceneId) => dispatch({ type: 'jump', sceneId: id, returnTo: 'review' })

  /**
   * A typed answer, read by Amp: fill it in, say what was set, and if it
   * answered this question, move on after a beat, the same as a tap would.
   * Comfort mode never moves on by itself; Back undoes it like any answer.
   */
  const applyTyped = (picks: Pick[]) => {
    let after = state.answers
    const writes = resolveScene(scene).writes
    let touched = false
    for (const pick of picks) {
      const patch = pickToPatch(pick, after, state.sceneId)
      if ((Object.keys(patch) as (keyof ConsultAnswers)[]).some((k) => writes.includes(k) || k === 'notes')) touched = true
      after = { ...after, ...patch }
      dispatch({ type: 'pick', pick })
    }
    noteInteraction()
    setTelling(false)
    setThinking(false)
    setHeard({ scene: state.sceneId, text: `Got it: ${picks.map((p) => p.label).join(' · ')}` })
    if (touched && isAnswered(state.sceneId, after) && !state.answers.comfort) setAutoNext(state.sceneId)
  }

  if (state.phase === 'invite' && invite) {
    return (
      <ConsultRoot comfort={state.answers.comfort}>
        <SceneStage sceneKey="invite" direction={state.direction} headingRef={headingRef}>
          <InviteScreen
            line={invite}
            headingRef={headingRef}
            onCheck={() => {
              consultFunnel.upgrade({ from: 'deep', via: 'invite' })
              dispatch({ type: 'invite', choice: 'check' })
            }}
            onBuild={() => dispatch({ type: 'invite', choice: 'build' })}
            onBack={back}
          />
        </SceneStage>
      </ConsultRoot>
    )
  }

  if (state.phase === 'stop') {
    const reason = stopReason(state.answers) ?? 'declined'
    return (
      <ConsultRoot mode="calm" comfort={state.answers.comfort}>
        <SceneStage sceneKey="stop" direction={state.direction} headingRef={headingRef}>
          <StopScreen
            reason={reason}
            headingRef={headingRef}
            onChange={() => dispatch({ type: 'jump', sceneId: reason === 'under-18' ? 'about' : 'circuit' })}
            onExit={onExit}
          />
        </SceneStage>
      </ConsultRoot>
    )
  }

  if (state.phase === 'analysis' || state.phase === 'done') {
    return (
      <ConsultRoot>
        <Analysis
          state={state}
          loadProducts={loadProducts}
          onBack={() => dispatch({ type: 'jump', sceneId: 'review' })}
          onDone={(bundle) => {
            dispatch({ type: 'phase', phase: 'done' })
            rememberFinished(state)
            // A reload on the results page rebuilds them from the saved handoff.
            markResultsOpen(bundle.payload.consult_id)
            consultFunnel.handoff({ route: state.answers.route ?? 'deep', stackSize: bundle.payload.tiers.complete.length })
            onHandoff?.(bundle)
          }}
        />
      </ConsultRoot>
    )
  }

  const mode = scene.mode ?? 'charge'
  // Amp, alive (plan Phase 7.2): live poses while an input moves, and
  // Pinpoint's moods.
  const rig = rigFor(state.sceneId, state.answers, watching !== null)
  const ampState: AmpState = mode === 'calm' ? 'calm' : reading ? 'reading' : thinking ? 'thinking' : watching !== null ? 'watching' : 'idle'
  // Slow wording never hides these: they have fallbacks of their own. Only a
  // server with no AI configured does.
  const aiOn = consultAi && !aiUnavailable
  // The tracker read (U2) fills the week and the sleep window, so it's offered
  // where those are asked — on the long route only; a speed run has no time for uploads.
  const offerTracker = CONSULT_FEATURES.uploads && aiOn && state.answers.route !== 'speed' && state.answers.route !== null && (state.sceneId === 'training' || state.sceneId === 'sleep')
  // "Tell Amp more" lives in the scene now, in its own words (batch 4). Only
  // with the AI layer on: with it off there's nobody to read it (V6).
  const tell = mode !== 'calm' && aiOn ? scene.tell : undefined
  const note = tell ? state.answers.notes[state.sceneId] : undefined
  const tracker = offerTracker ? () => setTracking(true) : undefined
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
          onBack={backStep(state) || onExit ? back : undefined}
          amp={
            pView ? (
              // The reticle closes in round his day ring (option B), which keeps filling in as Pinpoint learns times.
              <Reticle focus={pinpointFocus(state.answers)} locked={pView.kind === 'hunch' || (pView.kind === 'done' && pView.found.length > 0)}>
                <RingSlot ring={ringMod} answers={state.answers}>
                  <Amp state={pView.kind === 'hunch' ? 'hunch' : ampState} lean={watching ?? 0} reaction={ampReaction?.scene !== state.sceneId ? null : ampReaction} rig={rig} />
                </RingSlot>
              </Reticle>
            ) : mode === 'calm' ? (
              <Amp state={ampState} lean={watching ?? 0} reaction={null} />
            ) : (
              <RingSlot ring={ringMod} answers={state.answers}>
                <Amp state={ampState} lean={watching ?? 0} reaction={ampReaction?.scene !== state.sceneId ? null : ampReaction} rig={rig} />
              </RingSlot>
            )
          }
          // Inside the round, only Pinpoint's own lines: the last core answer's reaction belongs to the intro.
          reaction={
            heard?.scene === state.sceneId
              ? heard.text
              : state.sceneId === 'pinpoint'
                ? pinpointReactionLine('pinpoint', state.answers) ?? (pView?.kind === 'intro' ? reaction : undefined)
                : reaction
          }
          align={pView && pView.kind !== 'intro' ? 'start' : 'center'}
          question={pView ? pView.heading : scene.copy.question}
          hint={pView ? pView.hint : hintFor(scene.copy, state.answers.comfort)}
          headingRef={headingRef}
          action={
            // Pinpoint's questions carry their own answers; Next appears once the screen is done.
            pView && !ready ? undefined : (
              <NextButton ready={ready} nudge={NUDGES[state.sceneId]} resetKey={state.sceneId} onClick={next}>
                {pView?.kind === 'done' ? 'Continue' : nextLabel}
              </NextButton>
            )
          }
          footer={
            // Nothing to show, no bar: Pinpoint's questions need the height.
            (state.answers.comfort || aloud.available || (index === 1 && state.answers.route === 'deep' && !state.returnTo)) ? (
              <div className="flex flex-wrap items-center justify-center" style={{ gap: 'var(--amp-space-2)' }}>
                {/* Never advertised: comfort mode switches itself on when it
                    suits (see autoComfort), and this is only the way back. */}
                {state.answers.comfort && (
                  <QuietLink
                    icon="comfort"
                    onClick={() => {
                      consultFunnel.comfort({ on: false, via: 'toggle' })
                      answer({ comfort: false, comfortOffered: true })
                    }}
                  >
                    Standard size
                  </QuietLink>
                )}
                {aloud.available && (
                  <QuietLink icon="speaker" aria-pressed={aloud.on} onClick={aloud.toggle}>
                    {aloud.on ? 'Reading aloud' : 'Read aloud'}
                  </QuietLink>
                )}
                {/* Everyone starts the core scenes (plan Phase 6); the short way is one tap, on scene one. */}
                {index === 1 && state.answers.route === 'deep' && !state.returnTo && (
                  <QuietLink icon="bolt" onClick={() => dispatch({ type: 'route', route: 'speed' })}>
                    Short on time? Do the 1-minute version
                  </QuietLink>
                )}
              </div>
            ) : undefined
          }
        >
          {comfortNote === state.sceneId && (
            <div className="amp-anim-rise" style={{ marginBottom: 'var(--amp-space-4)' }}>
              <Hint>I’ve made everything a little bigger. “Standard size” undoes it.</Hint>
            </div>
          )}
          {note && <AmpNoted note={note} onChange={() => setTelling(true)} />}
          {tell?.lead && !note && <TellLead tell={tell} canTalk={canTalk} onOpen={() => setTelling(true)} tracker={tracker} />}
          <SceneRenderer
            scene={scene}
            answers={state.answers}
            onAnswer={answer}
            comfort={state.answers.comfort}
            order={order}
            onEdit={editFromReview}
            onInteract={interact}
            onDecline={scene.id === 'circuit' ? () => dispatch({ type: 'decline' }) : undefined}
            ai={aiOn}
            onReading={setReading}
            onNext={next}
            onUpgrade={
              scene.id === 'review' && (state.answers.route === 'speed' || state.answers.route === 'deep')
                ? () => {
                    consultFunnel.upgrade({ from: state.answers.route as 'speed' | 'deep', via: 'review' })
                    dispatch({ type: 'upgrade' })
                  }
                : undefined
            }
            onRecheck={scene.id === 'review' ? (pattern) => dispatch({ type: 'recheck', pattern }) : undefined}
          />
          {tell && (!tell.lead || note) && <TellInline tell={tell} canTalk={canTalk} onOpen={() => setTelling(true)} tracker={note ? tracker : undefined} />}
        </SceneShell>
      </SceneStage>
      {tracking && (
        <TrackerSheet
          answers={state.answers}
          onReading={setReading}
          onClose={() => {
            setTracking(false)
            setReading(false)
          }}
          onFill={(patch) => {
            // Straight to the flow, not through the scene's registry filter:
            // one screenshot answers two scenes, and the person confirmed both.
            dispatch({ type: 'answer', patch })
            noteInteraction()
          }}
        />
      )}
      {telling && (
        <TellAmpMore
          scene={scene}
          example={scene.tell?.example}
          onThinking={setThinking}
          onClose={() => {
            setTelling(false)
            setThinking(false)
          }}
          onAdd={(pick) => {
            dispatch({ type: 'pick', pick })
            noteInteraction()
          }}
          onApplied={applyTyped}
        />
      )}
    </ConsultRoot>
  )
}

/**
 * Amp in his day ring (plan Phase 7.3), in the reticle's footprint. Until the
 * ring's code has arrived (after scene one, where there's nothing to plot),
 * an empty track holds its place, so nothing moves when it does.
 */
function RingSlot({ ring, answers, children }: { ring: typeof import('./DayRing') | null; answers: ConsultAnswers; children: React.ReactNode }) {
  if (ring) return <ring.DayRing answers={answers}>{children}</ring.DayRing>
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" data-day-ring="placeholder" style={{ width: 'calc(var(--amp-space-10) + var(--amp-space-2))', height: 'calc(var(--amp-space-10) + var(--amp-space-2))' }}>
      <svg viewBox="0 0 100 100" aria-hidden className="absolute inset-0 h-full w-full">
        <circle cx="50" cy="50" r="44" fill="none" stroke="var(--amp-edge-strong)" strokeWidth="2" />
      </svg>
      {children}
    </span>
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
        minHeight: 'calc(var(--app-height, 100dvh) - var(--amp-chrome-top, 0px))',
        padding: 'max(var(--amp-space-4), env(safe-area-inset-top)) var(--amp-gutter) max(var(--amp-space-5), env(safe-area-inset-bottom))',
        gap: 'var(--amp-space-4)',
      }}
    >
      <p className="uppercase" style={{ fontFamily: 'var(--amp-font-label)', fontSize: 'var(--amp-text-data)', letterSpacing: 'var(--amp-tracking-data)', color: 'var(--amp-ink-3)', paddingTop: 'var(--amp-space-3)' }}>
        {reason === 'under-18' ? 'About you · paused' : 'Circuit check · paused'}
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
          {reason === 'declined' ? 'Back to the circuit check' : reason === 'under-18' ? 'I picked the wrong age' : 'I tapped something by mistake'}
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
/**
 * Comfort mode switches itself on when it suits (C14): 65 and over, or 55 to
 * 64 with healthy ageing as a goal. It isn't offered to anyone else — the
 * type already follows the phone's own text size — and it can always be
 * turned off with "Standard size".
 */
export function autoComfort(a: ConsultAnswers): boolean {
  return a.age === '65-plus' || (a.age === '55-64' && a.goals.includes('ageing'))
}

/**
 * The hunch invite (plan Phase 6): after the core scenes, before the circuit
 * check, when a lead is at least even odds. Amp names the area, says how
 * many questions it expects to need, and offers two plain choices. Building
 * the stack now is a full answer: "Pinpoint it" stays on the review.
 */
function InviteScreen({
  line,
  headingRef,
  onCheck,
  onBuild,
  onBack,
}: {
  line: { heading: string; body: string }
  headingRef: React.Ref<HTMLHeadingElement>
  onCheck: () => void
  onBuild: () => void
  onBack: () => void
}) {
  return (
    <div
      className="mx-auto flex flex-col"
      style={{
        maxWidth: 'var(--amp-column)',
        minHeight: 'calc(var(--app-height, 100dvh) - var(--amp-chrome-top, 0px))',
        padding: 'max(var(--amp-space-4), env(safe-area-inset-top)) var(--amp-gutter) max(var(--amp-space-5), env(safe-area-inset-bottom))',
        gap: 'var(--amp-space-4)',
      }}
    >
      <div className="flex items-center" style={{ minHeight: 'calc(var(--amp-space-8) + var(--amp-space-1))' }}>
        <QuietLink icon="back" onClick={onBack}>
          Back
        </QuietLink>
      </div>
      <div className="flex flex-1 flex-col justify-center" style={{ gap: 'var(--amp-space-4)' }}>
        <Amp state="hunch" size="md" />
        <p className="uppercase" style={{ fontFamily: 'var(--amp-font-label)', fontSize: 'var(--amp-text-data)', letterSpacing: 'var(--amp-tracking-data)', color: 'var(--amp-accent)' }}>
          {INVITE_COPY.kicker}
        </p>
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="uppercase"
          style={{ fontFamily: 'var(--amp-font-display)', fontWeight: 'var(--amp-weight-heavy)', fontSize: 'var(--amp-text-question)', lineHeight: 'var(--amp-leading-question)', outline: 'none' }}
        >
          {line.heading}
        </h1>
        <p style={{ fontSize: 'var(--amp-text-lead)', color: 'var(--amp-ink-2)' }}>{line.body}</p>
      </div>
      <div className="flex flex-col" style={{ gap: 'var(--amp-space-2)' }}>
        <NextButton onClick={onCheck}>{INVITE_COPY.check}</NextButton>
        <Plain onClick={onBuild}>{INVITE_COPY.build}</Plain>
        <p className="text-center" style={{ color: 'var(--amp-ink-2)', fontSize: 'var(--amp-text-meta)' }}>
          {INVITE_COPY.note}
        </p>
      </div>
    </div>
  )
}

function ResumePrompt({ saved, onResume, onFresh }: { saved: FlowState; onResume: () => void; onFresh: () => void }) {
  const def = sceneDef(saved.sceneId)
  return (
    <div
      className="mx-auto flex flex-col justify-center"
      style={{ maxWidth: 'var(--amp-column)', minHeight: 'calc(var(--app-height, 100dvh) - var(--amp-chrome-top, 0px))', padding: 'var(--amp-space-8) var(--amp-gutter)', gap: 'var(--amp-space-4)' }}
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

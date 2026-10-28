/**
 * The consult's flow engine (build S9).
 *
 * Scene order, branching and scripted copy live in `scenes.json`; this file
 * reads them and runs the consult as a reducer over one state object. Nothing
 * here renders — every rule about which scene comes next, what Back does and
 * whether Next is allowed is a pure function, so it can be tested without a
 * browser and reasoned about in one place.
 *
 * Collect, then decide: the flow only gathers answers. No stack is worked out
 * until the review and the circuit check are both done.
 */

import { nextStep, roundDone } from './pinpoint/choose'
import { isIn, leads, probeSteps, type Lead } from './pinpoint/leads'
import { undoInRound, withoutVerdict } from './pinpoint/screen'
import type { PatternId } from './pinpoint/types'
import { journeyOf, type Journey } from './journey'
import SCRIPT from './scenes.json'
import { circuitOutcome } from './circuit'
import { sessionsPerWeek } from './training'
import { pickToPatch, type Pick } from './ai/understand'
import { teaserLine } from './hunch-copy'
import { proteinAnswered } from './protein'
import {
  EMPTY_ANSWERS,
  type ConsultAnswers,
  type Route,
  type SceneId,
  type SectionId,
} from './types'

/* ── The script ─────────────────────────────────────────────────────────── */

/**
 * A branching rule, in JSON. Evaluated against the answers.
 *   { "answer": "route", "equals": "deep" }
 *   { "answer": "goals", "includes": "ageing" }
 *   { "answer": "age", "in": ["55-64", "65-plus"] }
 *   { "all": [...] }  { "any": [...] }  { "not": {...} }
 */
export type Condition =
  | { answer: keyof ConsultAnswers; equals: unknown }
  | { answer: keyof ConsultAnswers; includes: unknown }
  | { answer: keyof ConsultAnswers; in: unknown[] }
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition }
  /** Whose consult this is (batch 5): see journey.ts. */
  | { journey: Journey[] }
  /**
   * A Pinpoint follow-up (plan v5): on the Pinpoint route, when a question in
   * that section is clearly worth asking. Once asked it stays, so position,
   * back, review and resume don't jump.
   */
  | { followUp: FollowStage }

export interface PlaceholderOption {
  label: string
  /** Replace these answer fields. */
  set?: Partial<ConsultAnswers>
  /** Add or remove one value in an array field. */
  toggle?: [keyof ConsultAnswers, string]
}

export interface SceneCopy {
  question: string
  hint?: string
  /** The hint in comfort mode, where drags and wheels become buttons (C14). */
  comfortHint?: string
  next?: string
  /** AI-written option sub-lines, by key (V2). Never set by the script. */
  labels?: Record<string, string>
  /** Amp's AI-written reaction to the answer before this scene (V4). */
  react?: string
}

/** The hint to show: comfort mode's own where the layout differs. */
export function hintFor(copy: SceneCopy, comfort: boolean): string | undefined {
  return (comfort && copy.comfortHint) || copy.hint
}

/**
 * A scene adapted to the person (build C12). The first variant whose `when`
 * holds is merged over the scene: new words, and flags the widget reads —
 * `emphasis` (this scene matters more for them) and `detail` (ask the extra
 * question). The interaction itself never changes.
 */
export interface SceneVariant {
  id: string
  when: Condition
  copy?: Partial<SceneCopy>
  emphasis?: boolean
  detail?: boolean
  tell?: Partial<SceneTell>
}

/**
 * "Tell Amp more", placed in the scene (plan v4 batch 4) rather than as one
 * link at the foot of every screen. Where talking is easier than tapping — a
 * training week that changes, shifts, a cupboard of tubs — it leads the
 * screen; elsewhere it sits under the widget for what doesn't fit.
 */
export interface SceneTell {
  /** Offered first, above the widget, as the better way to answer. */
  lead: boolean
  /** The invitation, in Amp's voice. */
  prompt: string
  /** What someone might say here: the box's placeholder. */
  example: string
}

export interface SceneDef {
  id: SceneId
  section: SectionId
  /** Short name for the data line and the review cards. */
  label: string
  /** Which interactive element renders this scene. */
  interaction: string
  /** Included on the speed-run route. */
  speedRun: boolean
  /** On a speed run, included anyway when this holds (e.g. the body map for healthy ageing). */
  speedRunWhen?: Condition
  /** Shown only when this holds. Absent means always. */
  when?: Condition
  /** `calm` for the circuit check. */
  mode?: 'charge' | 'calm'
  copy: SceneCopy
  /** Absent: no "Tell Amp more" on this scene (goals, about, the circuit check, review). */
  tell?: SceneTell
  variants?: SceneVariant[]
  /** Set on a resolved scene: which variant applied. */
  variant?: string
  emphasis?: boolean
  detail?: boolean
  /** The scripted stand-in used until a scene's widget is built. */
  placeholder?: { multi?: boolean; options: PlaceholderOption[] }
  /**
   * Option keys the AI may write sub-lines for (V2). The widget shows
   * `copy.labels[key]` when present and its own sub-line otherwise.
   */
  aiLabels?: string[]
}

export interface SectionDef {
  id: SectionId
  label: string
}

export const SCRIPT_VERSION: number = SCRIPT.version
export const SECTIONS: SectionDef[] = SCRIPT.sections as SectionDef[]
export const SCENES: SceneDef[] = SCRIPT.scenes as SceneDef[]

const BY_ID = new Map(SCENES.map((s) => [s.id, s]))

export function sceneDef(id: SceneId): SceneDef {
  const def = BY_ID.get(id)
  if (!def) throw new Error(`Unknown consult scene: ${id}`)
  return def
}

/* ── Branching ──────────────────────────────────────────────────────────── */

export function holds(condition: Condition | undefined, answers: ConsultAnswers): boolean {
  if (!condition) return true
  if ('all' in condition) return condition.all.every((c) => holds(c, answers))
  if ('any' in condition) return condition.any.some((c) => holds(c, answers))
  if ('not' in condition) return !holds(condition.not, answers)
  if ('journey' in condition) return condition.journey.includes(journeyOf(answers))
  if ('followUp' in condition) return followUpShown(condition.followUp, answers)
  const value = answers[condition.answer] as unknown
  if ('equals' in condition) return value === condition.equals
  if ('includes' in condition) return Array.isArray(value) && value.includes(condition.includes)
  if ('in' in condition) return condition.in.includes(value)
  return true
}

/** The scenes this person will see, in order, given what they've said so far. */
export function visibleScenes(answers: ConsultAnswers): SceneId[] {
  return SCENES.filter((s) => {
    if (answers.route === 'speed' && !s.speedRun && !(s.speedRunWhen && holds(s.speedRunWhen, answers))) return false
    return holds(s.when, answers)
  }).map((s) => s.id)
}

/**
 * A scene as this person sees it. Every matching variant is merged in, the
 * earlier ones winning: a journey's variant (batch 5) sets the voice and
 * where "Tell Amp" sits, and a goal's variant still adds what it knows (a
 * sleep goal's hint, performance's detail question) where the journey's
 * doesn't say. `variant` names the first match.
 */
export function resolveSceneDef(id: SceneId, answers: ConsultAnswers): SceneDef {
  const def = sceneDef(id)
  const matches = (def.variants ?? []).filter((v) => holds(v.when, answers))
  if (matches.length === 0) return def
  const pick = <K extends 'emphasis' | 'detail'>(k: K) => matches.find((v) => v[k] !== undefined)?.[k] ?? def[k]
  const copy = matches.reduceRight<SceneCopy>((c, v) => ({ ...c, ...v.copy }), def.copy)
  const tell = def.tell && matches.reduceRight<SceneTell>((t, v) => ({ ...t, ...v.tell }), def.tell)
  return { ...def, copy, variant: matches[0].id, emphasis: pick('emphasis'), detail: pick('detail'), tell }
}

/* ── Answered? ──────────────────────────────────────────────────────────── */

/**
 * Scenes a "Tell Amp more" note can answer on its own. Explaining is sometimes
 * the better answer — "shift work, it changes every week" — and making someone
 * tap the widget as well would ignore what they said. Not goals, age or the
 * circuit check: the rules can't do without those.
 */
export const NOTE_ANSWERS: SceneId[] = ['training', 'aim', 'energy', 'sleep', 'daylight', 'caffeine', 'food', 'body', 'changes', 'shelf']

type FollowStage = 'follow-move' | 'follow-rest' | 'follow-fuel'

/** Has this Pinpoint stage been asked anything yet? */
export function stageStarted(stage: FollowStage | 'pinpoint', a: ConsultAnswers): boolean {
  return probeSteps(a.pinpoint).some((s) => s.stage === stage)
}

function followUpShown(stage: FollowStage, a: ConsultAnswers): boolean {
  if (a.route !== 'pinpoint') return false
  return stageStarted(stage, a) || nextStep(a, stage).kind === 'probe'
}

/** Whether a scene has what it needs for Next. Review is always ready. */
export function isAnswered(id: SceneId, a: ConsultAnswers): boolean {
  if (NOTE_ANSWERS.includes(id) && a.notes[id]) return true
  switch (id) {
    case 'follow-move':
    case 'follow-rest':
    case 'follow-fuel':
      return stageStarted(id, a) || nextStep(a, id).kind !== 'probe'
    case 'pinpoint':
      return roundDone(a)
    case 'goals':
      return a.goals.length > 0
    case 'about':
      return a.age !== null && a.sex !== null
    case 'training': {
      if (a.training === null) return false
      // Performance adds the detail question — but only if they train at all.
      const needsDetail = resolveSceneDef('training', a).detail && sessionsPerWeek(a.training) > 0
      return !needsDetail || a.intensity !== null
    }
    case 'energy':
      // "Not sure" is an answer: a shape with no level to read.
      return a.energy !== null || a.energyCurve?.preset === 'unsure'
    case 'sleep':
      return a.sleep !== null && a.sleep.quality !== null
    case 'daylight':
      return a.daylight !== null
    case 'caffeine':
      return a.caffeine !== null
    case 'food':
      return a.plate !== null && a.plate.length > 0
    case 'protein':
      return proteinAnswered(a.protein)
    case 'body':
    case 'changes':
      // "Leave it blank if you're all good": blank is an answer. See BLANK_MEANS.
      return true
    case 'aim':
      return a.aim !== null
    case 'shelf':
      return a.shelf !== null
    case 'review':
      return true
    case 'circuit': {
      if (!a.healthConsent?.accepted || a.circuit === null || !(a.circuit.none || a.circuit.flags.length > 0)) return false
      // With the tailoring opt-in, the symptom picker is part of the answer
      // ("None of these" counts); without it, the symptoms aren't asked.
      if (a.circuit.flags.includes('weight-meds') && a.tailorConsent?.accepted) return a.symptoms !== null
      return true
    }
  }
}

/**
 * Scenes where moving on without touching anything is itself an answer, and
 * what it records. The body map says "leave it blank if you're all good", so
 * Next on an untouched body map records no sore spots rather than nothing.
 */
export const BLANK_MEANS: Partial<Record<SceneId, Partial<ConsultAnswers>>> = {
  body: { body: [] },
  changes: { changes: [] },
}

function fillBlank(id: SceneId, answers: ConsultAnswers): ConsultAnswers {
  const blank = BLANK_MEANS[id]
  if (!blank) return answers
  const untouched = (Object.keys(blank) as (keyof ConsultAnswers)[]).every((k) => answers[k] === null)
  return untouched ? { ...answers, ...blank } : answers
}

/** What Next says when it isn't ready yet. */
export const NUDGES: Record<SceneId, string> = {
  goals: 'Pick at least one goal.',
  about: 'Pick your age and one option below.',
  training: 'Tap the days you train (or No training right now), then how hard they feel.',
  aim: 'Pick the main thing you’re training for.',
  energy: 'Draw your day, or pick the shape most like it.',
  sleep: 'Set your window, then how well you sleep.',
  daylight: 'Move the sun to how often you get outside.',
  caffeine: 'Add your drinks, or tap None.',
  food: 'Tap at least one food.',
  protein: 'Pick the day that fits, count it, or tap I honestly have no idea.',
  body: '',
  changes: '',
  shelf: 'Pick what you take, or Nothing yet.',
  review: '',
  circuit: 'Tick the line above the answers, then None of these, or tick the ones that apply.',
  'follow-move': 'Pick the one that’s more you, or tap Not sure.',
  'follow-rest': 'Pick the one that’s more you, or tap Not sure.',
  'follow-fuel': 'Pick the one that’s more you, or tap Not sure.',
  pinpoint: 'Answer the question on screen, or build your stack now.',
}

/* ── State ──────────────────────────────────────────────────────────────── */

/**
 * scenes   — collecting
 * invite   — after the core scenes, Amp's hunch and the way into Pinpoint
 *            (plan Phase 6); the scene stays the last core scene under it
 * analysis — everything's in, the stack is being worked out
 * stop     — the circuit check ended the consult (a signpost, no products)
 * done     — handed over to the results page
 *
 * There is no route choice any more (Phase 6): everyone starts the core
 * scenes, and the first offers the 1-minute version.
 */
export type Phase = 'scenes' | 'invite' | 'analysis' | 'stop' | 'done'

export interface FlowState {
  consultId: string
  scriptVersion: number
  sceneId: SceneId
  /** Scenes visited, oldest first, so Back retraces the actual path. */
  history: SceneId[]
  answers: ConsultAnswers
  direction: 'forward' | 'back'
  /** Set while editing from the review: Next returns there. */
  returnTo: SceneId | null
  phase: Phase
  /** The hunch invite, once answered: "Check it" or "Build my stack now". It is offered once. */
  invite?: 'checked' | 'skipped' | null
  startedAt: number
  updatedAt: number
}

export type FlowAction =
  | { type: 'answer'; patch: Partial<ConsultAnswers> }
  | { type: 'next' }
  | { type: 'back' }
  /** Jump to a scene already reached (meter, review card). */
  | { type: 'jump'; sceneId: SceneId; returnTo?: SceneId | null }
  | { type: 'restore'; state: FlowState }
  | { type: 'reset'; consultId: string; now: number }
  | { type: 'phase'; phase: Phase }
  /** "Short on time? Do the 1-minute version" on the first scene: the Speed run. */
  | { type: 'route'; route: Route }
  /** The hunch invite's two buttons (plan Phase 6). */
  | { type: 'invite'; choice: 'check' | 'build' }
  /** "I'd rather not answer these" on the circuit check: a stop, with nothing kept. */
  | { type: 'decline' }
  /** A "Tell Amp more" card added (V3), merged into the latest answers. */
  | { type: 'pick'; pick: Pick }
  /** "Want me to pinpoint it?" on a Speed run or Deep charge review: every answer kept (plan v5 §3). */
  | { type: 'upgrade' }
  /** A pinpointed pattern an edit undercut: lift its verdict and reopen the round, then back to the review. */
  | { type: 'recheck'; pattern: PatternId }

export function newConsultId(): string {
  const bytes =
    typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function'
      ? crypto.getRandomValues(new Uint8Array(8))
      : Uint8Array.from({ length: 8 }, () => Math.floor(Math.random() * 256))
  return 'c_' + Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 12)
}

/**
 * A fresh consult, on scene one. Everyone starts on the core scenes (the Deep
 * charge route) unless a route is already known (the workshop, tests).
 */
export function initialFlow(consultId: string, now: number, answers: Partial<ConsultAnswers> = {}): FlowState {
  const merged = { ...EMPTY_ANSWERS, ...answers, route: answers.route ?? 'deep' }
  return {
    consultId,
    scriptVersion: SCRIPT_VERSION,
    sceneId: visibleScenes(merged)[0],
    history: [],
    answers: merged,
    direction: 'forward',
    returnTo: null,
    phase: 'scenes',
    invite: null,
    startedAt: now,
    updatedAt: now,
  }
}

/** The scene after `id` in the visible order, or null at the end. */
export function sceneAfter(id: SceneId, answers: ConsultAnswers): SceneId | null {
  const order = visibleScenes(answers)
  const i = order.indexOf(id)
  if (i === -1) {
    // The current scene was branched away by an edit. Resume at the first
    // visible scene that comes after it in the full script.
    const full = SCENES.map((s) => s.id)
    const at = full.indexOf(id)
    return order.find((s) => full.indexOf(s) > at) ?? null
  }
  return order[i + 1] ?? null
}

/* ── Hunches (plan Phase 6) ─────────────────────────────────────────────── */

/** A lead this likely, from the core answers alone, is worth a teaser and an invite. */
export const INVITE_AT = 0.5

/** The strongest lead the answers so far point at, if it is at least `INVITE_AT`. */
export function hunchLead(a: ConsultAnswers): Lead | null {
  const top = leads(a)
    .filter((l) => isIn(l) && l.p >= INVITE_AT)
    .sort((x, y) => y.p - x.p)[0]
  return top ?? null
}

const CORE_SECTIONS: SectionId[] = ['you', 'move', 'rest', 'fuel', 'body']
const PINPOINT_STAGES: SceneId[] = ['follow-move', 'follow-rest', 'follow-fuel', 'pinpoint']
/** The core scenes: the ones everyone starts on, not Pinpoint's, the circuit check or the review. */
const isCore = (id: SceneId) => CORE_SECTIONS.includes(sceneDef(id).section) && !PINPOINT_STAGES.includes(id)

/**
 * Leaving the last core scene: where the invite goes. Only on the core
 * scenes' own route: a Speed run asked for the short way, and Pinpoint is
 * already Pinpoint. Offered once, and never on the way back to the review.
 */
export function invites(state: FlowState): Lead | null {
  if (state.answers.route !== 'deep' || state.invite || state.returnTo) return null
  if (!isCore(state.sceneId)) return null
  const next = sceneAfter(state.sceneId, state.answers)
  if (next && isCore(next)) return null
  return hunchLead(state.answers)
}

/**
 * The early teaser: on the scene after the Rest section, Amp's reaction holds
 * back a theory about the strongest lead, naming its area and never a cause.
 * Not inside Pinpoint, which says its hunches out loud.
 */
export function teaser(previous: SceneId | undefined, answers: ConsultAnswers): { lead: Lead; line: string } | null {
  if (!previous || answers.route === 'pinpoint') return null
  const rest = visibleScenes(answers).filter((id) => sceneDef(id).section === 'rest' && isCore(id))
  if (rest[rest.length - 1] !== previous) return null
  const lead = hunchLead(answers)
  return lead ? { lead, line: teaserLine(lead.pattern.id) } : null
}

/**
 * Next, once the stops and the invite are behind it: back to the review if
 * editing, the circuit check if it hasn't been done, otherwise the scene after.
 */
function advance(state: FlowState): FlowState {
  if (state.returnTo && state.returnTo !== state.sceneId) {
    return {
      ...state,
      history: [...state.history, state.sceneId],
      sceneId: state.returnTo,
      returnTo: null,
      direction: 'forward',
    }
  }
  let next = sceneAfter(state.sceneId, state.answers)
  // Leaving the core scenes on Pinpoint, a follow-up still to answer behind
  // them comes first (Back from the first follow-up, then Next, lands here).
  if (state.answers.route === 'pinpoint' && isCore(state.sceneId)) {
    const order = visibleScenes(state.answers)
    const here = order.indexOf(state.sceneId)
    const missed = order.slice(0, here).find((id) => PINPOINT_STAGES.includes(id) && !isAnswered(id, state.answers))
    if (missed && !order.slice(here + 1).some(isCore)) next = missed
  }
  // From a Pinpoint screen taken up after the core scenes (the invite, or the
  // review's "Pinpoint it"), the core scenes already answered are behind them:
  // straight on to the next Pinpoint screen, not back through sleep and food.
  // The circuit check is never skipped.
  if (PINPOINT_STAGES.includes(state.sceneId)) {
    while (next && isCore(next) && state.history.includes(next) && isAnswered(next, state.answers)) next = sceneAfter(next, state.answers)
  }
  // Nothing is decided without the circuit check. Its answers are never
  // saved, so a review reopened after a reload goes back through it.
  if (!next && !isAnswered('circuit', state.answers)) {
    return { ...state, history: [...state.history, state.sceneId], sceneId: 'circuit', returnTo: 'review', direction: 'forward' }
  }
  if (!next) return { ...state, phase: 'analysis', direction: 'forward' }
  return { ...state, history: [...state.history, state.sceneId], sceneId: next, direction: 'forward' }
}

/** On to Pinpoint, every answer kept: from the first screen still to answer. */
function upgrade(state: FlowState): FlowState {
  const answers = { ...state.answers, route: 'pinpoint' as const, pinpoint: state.answers.pinpoint ?? { steps: [], stopped: false } }
  // Onwards from the first screen still to answer: the core screens a
  // Speed run skipped, or the follow-ups. What's answered stays, and the
  // walk passes back through the circuit check, its answers in place.
  const target = visibleScenes(answers).find((id) => id !== 'review' && !isAnswered(id, answers)) ?? 'pinpoint'
  return { ...state, answers, phase: 'scenes', history: [...state.history, state.sceneId], sceneId: target, returnTo: null, direction: 'forward' }
}

export function flowReducer(state: FlowState, action: FlowAction): FlowState {
  switch (action.type) {
    case 'answer':
      return { ...state, answers: { ...state.answers, ...action.patch } }

    case 'next': {
      if (state.phase !== 'scenes') return state
      if (!isAnswered(state.sceneId, state.answers)) return state
      state = { ...state, answers: fillBlank(state.sceneId, state.answers) }
      // The stops come first, before any "back to review": an edit made from
      // the review that ought to stop the consult still stops it.
      // The 18+ gate (V5): an under-18 answer ends the consult at "about you",
      // before a single health question.
      if (state.sceneId === 'about' && state.answers.age === 'under-18') {
        return { ...state, phase: 'stop', direction: 'forward', returnTo: null }
      }
      // The circuit check is the only other scene that can end the consult (H3).
      if (state.sceneId === 'circuit' && circuitOutcome(state.answers).kind === 'stop') {
        return { ...state, phase: 'stop', direction: 'forward', returnTo: null }
      }
      // After the core scenes, before the circuit check: Amp's hunch, if it has one.
      if (invites(state)) return { ...state, phase: 'invite', direction: 'forward' }
      return advance(state)
    }

    case 'invite': {
      if (state.phase !== 'invite') return state
      if (action.choice === 'check') return upgrade({ ...state, invite: 'checked' })
      return advance({ ...state, phase: 'scenes', invite: 'skipped' })
    }

    case 'route': {
      // Pinpoint keeps its own answers (plan v5); the other routes have none.
      const pinpoint = action.route === 'pinpoint' ? state.answers.pinpoint ?? { steps: [], stopped: false } : state.answers.pinpoint
      const answers = { ...state.answers, route: action.route, pinpoint }
      return { ...state, answers, phase: 'scenes', sceneId: visibleScenes(answers)[0], direction: 'forward' }
    }

    case 'upgrade':
      return state.answers.route === 'pinpoint' ? state : upgrade(state)

    case 'recheck': {
      if (state.answers.route !== 'pinpoint' || !state.answers.pinpoint) return state
      const answers = { ...state.answers, pinpoint: withoutVerdict(state.answers, action.pattern) }
      return { ...state, answers, phase: 'scenes', history: [...state.history, state.sceneId], sceneId: 'pinpoint', returnTo: 'review', direction: 'back' }
    }

    case 'pick':
      return { ...state, answers: { ...state.answers, ...pickToPatch(action.pick, state.answers, state.sceneId) } }

    case 'decline':
      return {
        ...state,
        answers: { ...state.answers, circuit: null, healthConsent: null, tailorConsent: null, symptoms: null },
        phase: 'stop',
        direction: 'forward',
      }

    case 'back': {
      // The stop, the invite and the charge-up all sit over a scene: Back
      // returns to it (the circuit check, the last core scene, the review).
      if (state.phase === 'stop' || state.phase === 'invite' || state.phase === 'analysis') return { ...state, phase: 'scenes', direction: 'back' }
      const history = [...state.history]
      const visible = visibleScenes(state.answers)
      // Skip anything an edit has since branched away.
      let previous = history.pop()
      while (previous && !visible.includes(previous)) previous = history.pop()
      if (!previous) return state
      const back: FlowState = { ...state, history, sceneId: previous, direction: 'back', returnTo: null }
      // Back past the invite shows it again, both choices open: it was a
      // screen of its own. From "Check it", only before Pinpoint has asked
      // anything, and the route goes back with it.
      const reopen = (s: FlowState) => (invites({ ...s, invite: null }) ? { ...s, invite: null, phase: 'invite' as const } : null)
      if (state.invite === 'skipped' && !isCore(state.sceneId)) return reopen(back) ?? back
      if (state.invite === 'checked' && PINPOINT_STAGES.includes(state.sceneId) && !state.answers.pinpoint?.steps.length) {
        return reopen({ ...back, answers: { ...back.answers, route: 'deep', pinpoint: null } }) ?? back
      }
      return back
    }

    case 'jump': {
      if (!visibleScenes(state.answers).includes(action.sceneId)) return state
      const order = visibleScenes(state.answers)
      const backwards = order.indexOf(action.sceneId) < order.indexOf(state.sceneId)
      return {
        ...state,
        history: [...state.history, state.sceneId],
        sceneId: action.sceneId,
        direction: backwards ? 'back' : 'forward',
        returnTo: action.returnTo ?? null,
        phase: 'scenes',
      }
    }

    case 'restore':
      return action.state

    case 'reset':
      return initialFlow(action.consultId, action.now)

    case 'phase':
      return { ...state, phase: action.phase }
  }
}

/* ── Back, and the phone's back gesture (plan Phase 6) ─────────────────── */

/**
 * What one step back does, whether from the Back button or the browser's
 * back: inside the Pinpoint round, take back the last answer; otherwise back
 * a screen (off the stop, the invite or the charge-up, back to the scene
 * under it). Null on scene one: there the gesture leaves the page.
 */
export function backStep(state: FlowState): FlowAction | null {
  if (state.phase === 'stop' || state.phase === 'invite' || state.phase === 'analysis') return { type: 'back' }
  if (state.phase !== 'scenes') return null
  if (state.sceneId === 'pinpoint') {
    const undone = undoInRound(state.answers)
    if (undone) return { type: 'answer', patch: { pinpoint: undone } }
  }
  const visible = visibleScenes(state.answers)
  return state.history.some((id) => visible.includes(id)) ? { type: 'back' } : null
}

/**
 * The screen as the browser's history sees it: one entry per scene, and one
 * per answer inside the Pinpoint round, where Back undoes an answer.
 */
export function screenKey(state: FlowState): string {
  const round = state.phase === 'scenes' && state.sceneId === 'pinpoint' ? `:${state.answers.pinpoint?.steps.length ?? 0}` : ''
  return `${state.phase}:${state.sceneId}${round}`
}

/* ── Placeholders ───────────────────────────────────────────────────────── */

/** The answer patch a placeholder option makes. */
export function applyPlaceholder(option: PlaceholderOption, answers: ConsultAnswers): Partial<ConsultAnswers> {
  if (option.set) return option.set
  if (option.toggle) {
    const [key, value] = option.toggle
    const current = (answers[key] as unknown as string[] | null) ?? []
    const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value]
    return { [key]: key === 'goals' ? next.slice(0, 3) : next } as Partial<ConsultAnswers>
  }
  return {}
}

export function placeholderSelected(option: PlaceholderOption, answers: ConsultAnswers): boolean {
  if (option.toggle) {
    const [key, value] = option.toggle
    const current = answers[key] as unknown
    return Array.isArray(current) && current.includes(value)
  }
  if (option.set) {
    return Object.entries(option.set).every(
      ([k, v]) => JSON.stringify(answers[k as keyof ConsultAnswers]) === JSON.stringify(v),
    )
  }
  return false
}

/* ── Progress ───────────────────────────────────────────────────────────── */

export interface SectionProgress {
  id: SectionId
  label: string
  fill: number
}

/**
 * How full each section of the battery is. A scene counts once it is behind
 * the visitor (or answered and current), so the meter never runs ahead of
 * where they are.
 */
export function sectionProgress(state: FlowState): SectionProgress[] {
  const order = visibleScenes(state.answers)
  const here = order.indexOf(state.sceneId)
  const finished = state.phase !== 'scenes' && state.phase !== 'invite'
  // A section with nothing to ask on this route (Pinpoint off the Pinpoint
  // route, say) has no cell: counted as full, it lit up ahead of the fill.
  return SECTIONS.filter((section) => order.some((id) => sceneDef(id).section === section.id)).map((section) => {
    const scenes = order.filter((id) => sceneDef(id).section === section.id)
    // Behind them in the order, or already passed: Pinpoint taken up after the
    // core scenes sits earlier in the order than the scenes it follows.
    const done = scenes.filter((id) => finished || order.indexOf(id) < here || (id !== state.sceneId && state.history.includes(id))).length
    return { id: section.id, label: section.label, fill: done / scenes.length }
  })
}

/** The first visible scene in a section — where a meter jump lands. */
export function firstSceneIn(section: SectionId, answers: ConsultAnswers): SceneId | null {
  return visibleScenes(answers).find((id) => sceneDef(id).section === section) ?? null
}

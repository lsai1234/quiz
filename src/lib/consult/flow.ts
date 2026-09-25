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

import SCRIPT from './scenes.json'
import { circuitOutcome } from './circuit'
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
  next?: string
  /** AI-written option sub-lines, by key (V2). Never set by the script. */
  labels?: Record<string, string>
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

/** A scene as this person sees it: its first matching variant merged in. */
export function resolveSceneDef(id: SceneId, answers: ConsultAnswers): SceneDef {
  const def = sceneDef(id)
  const variant = def.variants?.find((v) => holds(v.when, answers))
  if (!variant) return def
  return {
    ...def,
    copy: { ...def.copy, ...variant.copy },
    variant: variant.id,
    emphasis: variant.emphasis ?? def.emphasis,
    detail: variant.detail ?? def.detail,
  }
}

/* ── Answered? ──────────────────────────────────────────────────────────── */

/** Whether a scene has what it needs for Next. Review is always ready. */
export function isAnswered(id: SceneId, a: ConsultAnswers): boolean {
  switch (id) {
    case 'goals':
      return a.goals.length > 0
    case 'about':
      return a.age !== null && a.sex !== null
    case 'training': {
      if (a.week === null || a.week.length !== 7) return false
      // Performance adds the detail question — but only if they train at all.
      const needsDetail = resolveSceneDef('training', a).detail && a.week.some((d) => d !== 'rest')
      return !needsDetail || a.intensity !== null
    }
    case 'energy':
      return a.energy !== null
    case 'sleep':
      return a.sleep !== null && a.sleep.quality !== null
    case 'daylight':
      return a.daylight !== null
    case 'caffeine':
      return a.caffeine !== null
    case 'food':
      return a.plate !== null && a.plate.length > 0
    case 'body':
      // "Leave it blank if you're all good": blank is an answer. See BLANK_MEANS.
      return true
    case 'shelf':
      return a.shelf !== null
    case 'review':
      return true
    case 'circuit':
      return Boolean(a.healthConsent?.accepted) && a.circuit !== null && (a.circuit.none || a.circuit.flags.length > 0)
  }
}

/**
 * Scenes where moving on without touching anything is itself an answer, and
 * what it records. The body map says "leave it blank if you're all good", so
 * Next on an untouched body map records no sore spots rather than nothing.
 */
export const BLANK_MEANS: Partial<Record<SceneId, Partial<ConsultAnswers>>> = {
  body: { body: [] },
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
  energy: 'Fill the battery to where you usually are.',
  sleep: 'Set your window, then how well you sleep.',
  daylight: 'Move the sun to how often you get outside.',
  caffeine: 'Add your drinks, or tap None.',
  food: 'Tap at least one food.',
  body: '',
  shelf: 'Pick what you take, or Nothing yet.',
  review: '',
  circuit: 'Tick the line at the top, then any that apply, or None of these.',
}

/* ── State ──────────────────────────────────────────────────────────────── */

/**
 * intro    — the route choice (speed run or deep charge), before scene one
 * scenes   — collecting
 * analysis — everything's in, the stack is being worked out
 * stop     — the circuit check ended the consult (a signpost, no products)
 * done     — handed over to the results page
 */
export type Phase = 'intro' | 'scenes' | 'analysis' | 'stop' | 'done'

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
  /** The choice on the intro screen. */
  | { type: 'route'; route: Route }
  /** "I'd rather not answer these" on the circuit check: a stop, with nothing kept. */
  | { type: 'decline' }

export function newConsultId(): string {
  const bytes =
    typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function'
      ? crypto.getRandomValues(new Uint8Array(8))
      : Uint8Array.from({ length: 8 }, () => Math.floor(Math.random() * 256))
  return 'c_' + Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 12)
}

/**
 * A fresh consult. It opens on the route choice unless a route is already
 * known (the workshop, tests, a deep link), in which case it opens on scene one.
 */
export function initialFlow(consultId: string, now: number, answers: Partial<ConsultAnswers> = {}): FlowState {
  const merged = { ...EMPTY_ANSWERS, ...answers }
  return {
    consultId,
    scriptVersion: SCRIPT_VERSION,
    sceneId: visibleScenes(merged)[0],
    history: [],
    answers: merged,
    direction: 'forward',
    returnTo: null,
    phase: merged.route ? 'scenes' : 'intro',
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

export function flowReducer(state: FlowState, action: FlowAction): FlowState {
  switch (action.type) {
    case 'answer':
      return { ...state, answers: { ...state.answers, ...action.patch } }

    case 'next': {
      if (state.phase !== 'scenes') return state
      if (!isAnswered(state.sceneId, state.answers)) return state
      state = { ...state, answers: fillBlank(state.sceneId, state.answers) }
      if (state.returnTo && state.returnTo !== state.sceneId) {
        return {
          ...state,
          history: [...state.history, state.sceneId],
          sceneId: state.returnTo,
          returnTo: null,
          direction: 'forward',
        }
      }
      // The circuit check is the only scene that can end the consult (H3).
      if (state.sceneId === 'circuit' && circuitOutcome(state.answers).kind === 'stop') {
        return { ...state, phase: 'stop', direction: 'forward' }
      }
      const next = sceneAfter(state.sceneId, state.answers)
      if (!next) return { ...state, phase: 'analysis', direction: 'forward' }
      return { ...state, history: [...state.history, state.sceneId], sceneId: next, direction: 'forward' }
    }

    case 'route': {
      const answers = { ...state.answers, route: action.route }
      return { ...state, answers, phase: 'scenes', sceneId: visibleScenes(answers)[0], direction: 'forward' }
    }

    case 'decline':
      return {
        ...state,
        answers: { ...state.answers, circuit: null, healthConsent: null },
        phase: 'stop',
        direction: 'forward',
      }

    case 'back': {
      if (state.phase === 'stop') return { ...state, phase: 'scenes', direction: 'back' }
      if (state.phase === 'scenes' && state.history.length === 0 && state.answers.route) {
        // Back from scene one returns to the route choice.
        return { ...state, phase: 'intro', direction: 'back' }
      }
      const history = [...state.history]
      const visible = visibleScenes(state.answers)
      // Skip anything an edit has since branched away.
      let previous = history.pop()
      while (previous && !visible.includes(previous)) previous = history.pop()
      if (!previous) return state
      return { ...state, history, sceneId: previous, direction: 'back', returnTo: null }
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
  const finished = state.phase !== 'scenes' && state.phase !== 'intro'
  return SECTIONS.map((section) => {
    const scenes = order.filter((id) => sceneDef(id).section === section.id)
    if (scenes.length === 0) return { id: section.id, label: section.label, fill: 1 }
    const done = scenes.filter((id) => finished || order.indexOf(id) < here).length
    return { id: section.id, label: section.label, fill: done / scenes.length }
  })
}

/** The first visible scene in a section — where a meter jump lands. */
export function firstSceneIn(section: SectionId, answers: ConsultAnswers): SceneId | null {
  return visibleScenes(answers).find((id) => sceneDef(id).section === section) ?? null
}

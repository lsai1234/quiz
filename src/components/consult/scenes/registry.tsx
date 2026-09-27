'use client'

import { PinpointScene } from '../pinpoint/PinpointScene'
import type { PatternId } from '@/lib/consult/pinpoint/types'
import { AimTiles } from './AimTiles'
import { ChangesPicker } from './ChangesPicker'
import type { ComponentType } from 'react'
import type { SceneDef } from '@/lib/consult/flow'
import type { ConsultAnswers, SceneId } from '@/lib/consult/types'
import { PlaceholderScene } from './PlaceholderScene'
import { ReviewScene } from './ReviewScene'
import { GoalTiles } from './GoalTiles'
import { AgeWheel } from './AgeWheel'
import { TrainingWeek } from './TrainingWeek'
import { ChargeDial } from './ChargeDial'
import { SleepWindow } from './SleepWindow'
import { SunArc } from './SunArc'
import { CupCounter } from './CupCounter'
import { PlatePicker } from './PlatePicker'
import { BodyMap } from './BodyMap'
import { ShelfCheck } from './ShelfCheck'
import { CircuitCheck } from './CircuitCheck'
import { WhatsThis } from '../WhatsThis'
import type { GlossaryKey } from '@/lib/consult/glossary'

/**
 * The scene registry (build C1).
 *
 * Every scene in `scenes.json` names its `interaction`. This maps that name to
 * the component that draws it, and to the answer fields it is allowed to
 * write. One renderer looks the type up; the flow never knows which component
 * is on screen. Adding a scene is a line in `scenes.json` and a line here —
 * no change to the flow code.
 *
 * `writes` is what makes each scene return a *structured* answer: the renderer
 * drops any field a scene was not registered to write, so a widget can't
 * quietly change an answer that belongs to another scene.
 */

export interface SceneProps {
  scene: SceneDef
  answers: ConsultAnswers
  onAnswer: (patch: Partial<ConsultAnswers>) => void
  comfort: boolean
  /** Scenes shown in this run, in order (the review lists them). */
  order: SceneId[]
  /** Jump to a scene to change it, returning here after (the review). */
  onEdit: (scene: SceneId) => void
  /** A touch or drag happening now — Amp leans towards it. -1 left … 1 right. */
  onInteract?: (lean: number) => void
  /** The circuit check only: "I'd rather not answer these". */
  onDecline?: () => void
  /** The AI layer is on and answering: "What's this?" takes follow-up questions (V7). */
  ai?: boolean
  /** An upload is being read (U1): Amp shows it's reading. */
  onReading?: (reading: boolean) => void
  /** Move on to the next scene: a Pinpoint follow-up does, once answered. */
  onNext?: () => void
  /** The review on Speed run or Deep charge: "Want me to pinpoint it?". */
  onUpgrade?: () => void
  /** The review on Pinpoint: recheck a pattern an edit undercut. */
  onRecheck?: (pattern: PatternId) => void
}

export interface SceneEntry {
  component: ComponentType<SceneProps>
  writes: (keyof ConsultAnswers)[]
}

function Review({ order, answers, onEdit, onAnswer, onUpgrade, onRecheck }: SceneProps) {
  return <ReviewScene scenes={order} answers={answers} onEdit={onEdit} onAnswer={onAnswer} onUpgrade={onUpgrade} onRecheck={onRecheck} />
}

/** What each interaction type is drawn with. Unregistered types fall back to the scripted placeholder. */
export const SCENE_REGISTRY: Record<string, SceneEntry> = {
  // Goals also writes the circuit check's weight-loss medication switch, set
  // from the Weight loss card and confirmed, with consent, on the circuit check.
  'goal-tiles': { component: GoalTiles, writes: ['goals', 'circuit'] },
  'age-wheel': { component: AgeWheel, writes: ['age', 'sex'] },
  'training-week': { component: TrainingWeek, writes: ['training', 'intensity'] },
  'aim-tiles': { component: AimTiles, writes: ['aim'] },
  'changes-picker': { component: ChangesPicker, writes: ['changes'] },
  'charge-dial': { component: ChargeDial, writes: ['energy'] },
  'sleep-window': { component: SleepWindow, writes: ['sleep'] },
  'sun-arc': { component: SunArc, writes: ['daylight'] },
  'cup-counter': { component: CupCounter, writes: ['caffeine'] },
  'plate-picker': { component: PlatePicker, writes: ['plate'] },
  'body-map': { component: BodyMap, writes: ['body'] },
  'shelf-check': { component: ShelfCheck, writes: ['shelf'] },
  'circuit-check': { component: CircuitCheck, writes: ['circuit', 'healthConsent', 'tailorConsent', 'symptoms'] },
  // The review writes only Pinpoint's "Not quite?" (plan v5).
  review: { component: Review, writes: ['pinpoint'] },
  pinpoint: { component: PinpointScene, writes: ['pinpoint'] },
}

/** Which answer fields each scene writes while it is still a placeholder. */
const PLACEHOLDER_WRITES: Record<SceneId, (keyof ConsultAnswers)[]> = {
  goals: ['goals'],
  about: ['age', 'sex'],
  training: ['training'],
  aim: ['aim'],
  energy: ['energy'],
  sleep: ['sleep'],
  daylight: ['daylight'],
  caffeine: ['caffeine'],
  food: ['plate'],
  body: ['body'],
  changes: ['changes'],
  shelf: ['shelf'],
  review: [],
  circuit: ['circuit'],
  'follow-move': ['pinpoint'],
  'follow-rest': ['pinpoint'],
  'follow-fuel': ['pinpoint'],
  pinpoint: ['pinpoint'],
}

export function resolveScene(scene: SceneDef): SceneEntry {
  return (
    SCENE_REGISTRY[scene.interaction] ?? {
      component: PlaceholderScene,
      writes: PLACEHOLDER_WRITES[scene.id],
    }
  )
}

/** Keep only the fields a scene is registered to write. */
export function structuredPatch(entry: SceneEntry, patch: Partial<ConsultAnswers>): Partial<ConsultAnswers> {
  const out: Partial<ConsultAnswers> = {}
  for (const key of Object.keys(patch) as (keyof ConsultAnswers)[]) {
    if (entry.writes.includes(key)) (out as Record<string, unknown>)[key] = patch[key]
  }
  return out
}

/**
 * "What's this?" (V7) for scenes whose element doesn't carry its own: the term
 * people ask about on that screen. Goals, training and daylight place theirs
 * inside the element, next to what it explains.
 */
export const SCENE_TERMS: Partial<Record<SceneId, GlossaryKey>> = {
  sleep: 'sleep-quality',
  caffeine: 'energy-drinks',
  food: 'oily-fish',
  body: 'stiff-spots',
  shelf: 'pre-workout',
}

/** The one renderer: scene definition in, the right interactive element out. */
export function SceneRenderer(props: SceneProps) {
  const entry = resolveScene(props.scene)
  const Component = entry.component
  const term = SCENE_TERMS[props.scene.id]
  return (
    <>
      {term && (
        <div className="flex justify-end" style={{ marginBottom: 'var(--amp-space-2)' }}>
          <WhatsThis term={term} questions={props.ai} />
        </div>
      )}
      <Component {...props} onAnswer={(patch) => props.onAnswer(structuredPatch(entry, patch))} />
    </>
  )
}

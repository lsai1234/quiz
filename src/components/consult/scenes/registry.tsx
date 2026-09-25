'use client'

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
}

export interface SceneEntry {
  component: ComponentType<SceneProps>
  writes: (keyof ConsultAnswers)[]
}

function Review({ order, answers, onEdit }: SceneProps) {
  return <ReviewScene scenes={order} answers={answers} onEdit={onEdit} />
}

/** What each interaction type is drawn with. Unregistered types fall back to the scripted placeholder. */
export const SCENE_REGISTRY: Record<string, SceneEntry> = {
  'goal-tiles': { component: GoalTiles, writes: ['goals'] },
  'age-wheel': { component: AgeWheel, writes: ['age', 'sex'] },
  'training-week': { component: TrainingWeek, writes: ['week'] },
  'charge-dial': { component: ChargeDial, writes: ['energy'] },
  'sleep-window': { component: SleepWindow, writes: ['sleep'] },
  'sun-arc': { component: SunArc, writes: ['daylight'] },
  review: { component: Review, writes: [] },
}

/** Which answer fields each scene writes while it is still a placeholder. */
const PLACEHOLDER_WRITES: Record<SceneId, (keyof ConsultAnswers)[]> = {
  goals: ['goals'],
  about: ['age', 'sex'],
  training: ['week'],
  energy: ['energy'],
  sleep: ['sleep'],
  daylight: ['daylight'],
  caffeine: ['caffeine'],
  food: ['plate'],
  body: ['body'],
  shelf: ['shelf'],
  review: [],
  circuit: ['circuit'],
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

/** The one renderer: scene definition in, the right interactive element out. */
export function SceneRenderer(props: SceneProps) {
  const entry = resolveScene(props.scene)
  const Component = entry.component
  return <Component {...props} onAnswer={(patch) => props.onAnswer(structuredPatch(entry, patch))} />
}

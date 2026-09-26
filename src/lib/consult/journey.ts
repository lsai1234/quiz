/**
 * Whose consult is this? (batch 5)
 *
 * A 22-year-old trying to put on muscle and a 70-year-old who wants to keep
 * walking to the shops shouldn't get the same consult with bigger text. The
 * journey, read from the goals and the age as soon as they're known, decides
 * which questions are asked, how they're worded, what Amp offers to hear and
 * where, and what the widgets call things.
 *
 *   builder     performance, under 45: training split, what it's for, protein
 *   ager        55 and over, or healthy ageing first: getting about, staying
 *               sharp, joints; walks and gardening count as activity
 *   weight      weight loss first: moving more, eating less, the medication
 *   everyday    everyone else
 *
 * Read off answers, never stored: change the goals or the age and the
 * journey follows.
 */

import type { ConsultAnswers } from './types'

export type Journey = 'builder' | 'ager' | 'weight' | 'everyday'

export const JOURNEYS: Journey[] = ['builder', 'ager', 'weight', 'everyday']

const OLDER = ['55-64', '65-plus']
const YOUNGER = ['18-24', '25-34', '35-44']

export function journeyOf(a: Pick<ConsultAnswers, 'goals' | 'age'>): Journey {
  const first = a.goals[0]
  if (first === 'weight') return 'weight'
  if ((a.age && OLDER.includes(a.age)) || first === 'ageing') return 'ager'
  // Before the age is known, a performance goal reads as a builder; a 45–54
  // with performance first is still one, but not further down the list.
  if (a.goals.includes('performance') && (a.age === null || YOUNGER.includes(a.age))) return 'builder'
  if (first === 'performance' && a.age === '45-54') return 'builder'
  return 'everyday'
}

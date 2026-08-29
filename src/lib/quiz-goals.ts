import type { Goal } from './types'

/**
 * The goal grids, shared by both quizzes.
 *
 * Extracted from `Act2Quiz` when v2 arrived. The goals screen is the one screen
 * the two quizzes have in common and it has to stay identical between them: it
 * is the top of both funnels, so a difference in wording or ordering there
 * would move the numbers in a way that had nothing to do with the questions
 * underneath.
 */

export const GOALS_DATA: Array<{ id: Goal; label: string; icon: string }> = [
  { id: 'muscle',      label: 'Build muscle',     icon: 'dumbbell' },
  { id: 'cutting',     label: 'Get lean',         icon: 'flame' },
  { id: 'energy',      label: 'More energy',      icon: 'bolt' },
  { id: 'performance', label: 'Peak performance', icon: 'peak' },
  { id: 'recovery',    label: 'Recover faster',   icon: 'refresh' },
  { id: 'health',      label: 'Feel healthier',   icon: 'heart' },
  { id: 'bulking',     label: 'Gain mass',        icon: 'trending-up' },
  { id: 'hydration',   label: 'Stay hydrated',    icon: 'droplet' },
]

export const WELLBEING_DATA: Array<{ id: Goal; label: string; icon: string }> = [
  { id: 'sleep-better',    label: 'Sleep better',        icon: 'moon' },
  { id: 'less-stress',     label: 'Less stress',         icon: 'wave' },
  { id: 'focus',           label: 'Focus & brain fog',   icon: 'crosshair' },
  { id: 'immune',          label: 'Immune support',      icon: 'shield' },
  { id: 'skin-hair-nails', label: 'Skin, hair & nails',  icon: 'sparkle' },
  { id: 'gut-health',      label: 'Gut health',          icon: 'spiral' },
  { id: 'menopause',       label: 'Menopause support',   icon: 'thermometer' },
]

export const GOAL_LABELS: Record<string, string> = {
  ...Object.fromEntries([...GOALS_DATA, ...WELLBEING_DATA].map((g) => [g.id, g.label] as const)),
  health: 'General health',
}

/** The two opening cards. `wellbeing` is listed first, and the second one ADDS
 *  training on top of wellness rather than excluding it. */
export const TRACK_CARDS = [
  {
    id: 'wellbeing' as const,
    icon: 'leaf',
    label: 'Everyday wellness',
    sub: 'Sleep, stress, focus, immunity — how you feel day to day',
  },
  {
    id: 'performance' as const,
    icon: 'dumbbell',
    label: 'Performance + wellness',
    sub: 'Training goals plus the everyday stuff — the full picture',
  },
]

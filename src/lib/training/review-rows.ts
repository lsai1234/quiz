/**
 * The training plan: rows for the review pack (`docs/consult-review-pack.csv`).
 * Two sections: the wording of the screens (readiness check and safety lines
 * first), and the whole exercise and activity library, for the qualified
 * coach to review before the plan is switched on.
 */
import type { ReviewRow } from '@/lib/consult/review-pack'
import {
  ACTIVITY_LABEL,
  AREA_COPY,
  EQUIPMENT_COPY,
  EXPERIENCE_COPY,
  FOCUS_COPY,
  INTENSITY_COPY,
  MUSCLE_COPY,
  SPLIT_COPY,
  TEMPLATE_COPY,
  TRAINING_COPY as C,
  areasPhrase,
} from './copy'
import { ACTIVITIES, EXERCISES } from './library'

export function trainingCopyRows(): ReviewRow[] {
  const at = 'Training plan: /myhub/training'
  const s = 'Training wording'
  const ex = 'Example'
  const rows: ReviewRow[] = [
    // Health-adjacent first: the readiness check and the safety lines.
    [s, `${at}, readiness check`, C.readyTitle, 'Heading, before the first plan'],
    [s, `${at}, readiness check`, C.readyBody, 'Under the heading'],
    ...C.readyQuestions.map((q, i): ReviewRow => [s, `${at}, readiness check`, q, `Question ${i + 1} of 7 (after PAR-Q+), yes or no. Answers never leave the page`]),
    [s, `${at}, readiness check`, C.readyPrivacy, 'Under the questions'],
    [s, `${at}, readiness check`, C.gpTitle, 'Any yes'],
    [s, `${at}, readiness check`, C.gpBody, 'Any yes'],
    [s, `${at}, readiness check`, C.gpNothingSaved, 'Any yes'],
    [s, `${at}, readiness check`, C.gpCleared, 'Button, any yes: their GP has cleared them'],
    [s, `${at}, every session`, C.notMedical, 'On every session and the week'],
    [s, `${at}, every session`, C.workingAround(areasPhrase(['knees', 'lower-back'])), `When they work around an area. ${ex}`],
    [s, `${at}, setup`, C.avoidHint, 'Under "Anything to work around?"'],
    [s, `${at}, an activity`, C.activityLoads(areasPhrase(['knees'])), `An activity they chose that loads an area they work around. ${ex}`],
    [s, `${at}, a session`, C.progressionTip, 'Under the exercises'],
    // The rest of the screens.
    [s, at, C.noAccessTitle, 'No order in the last 90 days, no plan'],
    [s, at, C.noAccessBody, 'No order in the last 90 days, no plan'],
    [s, at, C.offTitle, 'While switched off'],
    [s, at, C.offBody, 'While switched off'],
    [s, at, C.openUntil('3 February'), `One-off order. ${ex}`],
    [s, at, C.openMonthly, 'Monthly plan'],
    [s, `${at}, setup`, C.setupTitle, 'Heading'],
    [s, `${at}, setup`, C.setupBody, 'Under the heading'],
    [s, `${at}, setup`, C.daysHint, 'Training days'],
    [s, `${at}, setup`, C.activitiesHint, 'Activities'],
    [s, `${at}, setup`, C.building, 'While AI builds the week'],
    ...Object.values(FOCUS_COPY).map((f): ReviewRow => [s, `${at}, setup`, `${f.label}: ${f.sub}`, 'Focus option']),
    ...Object.values(SPLIT_COPY).map((f): ReviewRow => [s, `${at}, setup`, `${f.label}: ${f.sub}`, 'Split option']),
    ...Object.values(EQUIPMENT_COPY).map((f): ReviewRow => [s, `${at}, setup`, `${f.label}: ${f.sub}`, 'Kit option']),
    ...Object.values(EXPERIENCE_COPY).map((f): ReviewRow => [s, `${at}, setup`, `${f.label}: ${f.sub}`, 'Experience option']),
    [s, `${at}, setup`, Object.values(AREA_COPY).join(', '), 'Areas to work around'],
    [s, `${at}, the week`, C.intro, 'Under "Your week"'],
    [s, `${at}, the week`, C.builtWithAi, 'When AI built the training sessions'],
    [s, `${at}, the week`, C.builtWithRules, 'When the rules did'],
    [s, `${at}, the week`, C.restBody, 'A day with nothing on'],
    [s, `${at}, the week`, Object.values(TEMPLATE_COPY).join(', '), 'Session names'],
    [s, `${at}, the week`, Object.values(ACTIVITY_LABEL).join(', '), 'Activities they can add'],
    [s, `${at}, the week`, Object.values(INTENSITY_COPY).join(', '), 'How hard an activity is'],
    [s, `${at}, a session`, C.warmupBody, 'Warm-up'],
    [s, `${at}, an exercise`, C.tutorialSoon, 'Until a founder adds a video'],
    [s, `${at}, an exercise`, Object.values(MUSCLE_COPY).join(', '), 'Muscle names'],
    [s, 'My Hub', C.hubCardNew, 'Hub card, before a plan'],
    [s, 'Stack guide', C.guideLink, 'Link, while the plan is on'],
  ]
  return rows
}

export function trainingLibraryRows(): ReviewRow[] {
  const s = 'Training library (coach review)'
  const rows: ReviewRow[] = []
  for (const e of EXERCISES) {
    const where = `Exercise: ${e.name} (${e.id})`
    const context = `Level ${e.level}; kit: ${e.kit}; left out for anyone working around: ${e.loads.length ? areasPhrase(e.loads) : 'nothing'}`
    e.steps.forEach((t, i) => rows.push([s, where, t, `Step ${i + 1}. ${context}`]))
    e.cues.forEach((t) => rows.push([s, where, t, 'Think about']))
    e.mistakes.forEach((t) => rows.push([s, where, t, 'Common mistake']))
    e.tips.forEach((t) => rows.push([s, where, t, 'Tip']))
  }
  for (const a of Object.values(ACTIVITIES)) {
    const where = `Activity: ${a.name}`
    a.steps.forEach((t, i) => rows.push([s, where, t, `How to pace it, step ${i + 1}`]))
    a.tips.forEach((t) => rows.push([s, where, t, 'Tip']))
  }
  return rows
}

import type { BankQuestion } from '../types'

/**
 * The four screens the interview always asks, in this order.
 *
 * They are not subject to planning. Two of them cannot be: the safety screen
 * gates products and has to be answered before anything is recommended, and the
 * age/weight screen scales doses. The other two — goals and already-taking —
 * are the interview's bookends: goals open it because a goal is the most
 * engaging thing to ask a stranger first, and already-taking closes it because
 * it is the least.
 *
 * Their options are v1's, verbatim. Deliberately: if the fixed screens differed
 * between the arms, a difference in the numbers could be coming from either,
 * and the experiment would answer nothing.
 */

export const FIXED_QUESTIONS: BankQuestion[] = [
  {
    id: 'goals',
    topic: 'goals',
    section: 'YOUR GOAL',
    prompt: "What's the main goal?",
    hint: "Pick everything that applies — the first one you tap is the one we'll lead with.",
    select: 'multi',
    fixed: true,
    minPicks: 1,
    discriminates: [],
    summary: 'Which goals the person is here for.',
    // The goal grid is rendered from the track's own list rather than from
    // options here — the two grids (performance, everyday wellness) and the
    // track chooser are one screen with its own layout, same as v1.
    options: [],
  },

  {
    id: 'safety',
    topic: 'safety',
    section: 'ABOUT YOU',
    prompt: 'Anything we should factor in?',
    hint: 'So we only ever suggest things that are right for you.',
    select: 'multi',
    fixed: true,
    discriminates: [],
    summary: 'Safety flags that hard-exclude products.',
    // v1's reassurance, verbatim. This screen asks the most personal question in
    // the quiz and it is the one people are most likely to skip warily, so it
    // says what the answer does — removes products, never adds — before they
    // answer rather than after.
    reassurance:
      'Private, and optional — this only ever removes products, never adds. It isn’t medical advice; check with your GP or midwife if you’re unsure.',
    options: [
      {
        id: 'pregnancy',
        label: 'Pregnant or breastfeeding',
        answers: { safetyFlags: ['pregnancy'] },
      },
      {
        id: 'medication',
        label: 'On prescription medication',
        answers: { safetyFlags: ['medication'] },
      },
      // Real products in the range carry this: krill oil is shellfish, and
      // glucosamine is commonly shellfish-derived. Without the question the
      // flag on those products could never fire.
      {
        id: 'shellfish',
        label: 'Shellfish allergy',
        answers: { safetyFlags: ['shellfish'] },
      },
      {
        id: 'vegan',
        label: 'Plant-based only',
        sub: 'No animal products at all',
        // `vegan` lives in `lifestyle` and is the one tag that is a hard
        // exclusion gate rather than a scoring nudge. v1 asks it on its
        // lifestyle step, which v2 does not have — so it is asked here, with
        // the other hard filters, and is never inferred from anything.
        answers: { lifestyle: ['vegan'] },
      },
      { id: 'none', label: 'None of these', exclusive: true },
    ],
  },

  {
    id: 'personal',
    topic: 'personal',
    section: 'ABOUT YOU',
    prompt: 'A little about you.',
    hint: 'Age and weight scale the doses — the rest is so we can talk to you properly.',
    select: 'form',
    fixed: true,
    discriminates: [],
    summary: 'Name, age band, sex and weight band, for dosing.',
    options: [],
    fields: [
      { key: 'name', kind: 'text', label: 'First name', placeholder: 'Optional', optional: true },
      {
        key: 'ageBracket',
        kind: 'choice',
        label: 'Age',
        options: [
          { id: '16-24', label: 'Under 25' },
          { id: '25-34', label: '25–34' },
          { id: '35-44', label: '35–44' },
          { id: '45+', label: '45+' },
        ],
      },
      {
        key: 'gender',
        kind: 'choice',
        label: 'Sex',
        options: [
          { id: 'male', label: 'Male' },
          { id: 'female', label: 'Female' },
          { id: 'nonbinary', label: 'Non-binary' },
          { id: 'not-specified', label: 'Rather not say' },
        ],
      },
      {
        key: 'weightBand',
        kind: 'choice',
        label: 'Weight',
        optional: true,
        options: [
          { id: 'under-60', label: 'Under 60kg' },
          { id: '60-75', label: '60–75kg' },
          { id: '75-90', label: '75–90kg' },
          { id: '90-105', label: '90–105kg' },
          { id: '105-plus', label: '105kg+' },
        ],
      },
    ],
  },

  {
    id: 'supps',
    topic: 'supps',
    section: 'WHAT YOU HAVE',
    prompt: 'Already taking any of these?',
    hint: "We'll leave out anything you've already got covered.",
    select: 'multi',
    fixed: true,
    discriminates: [],
    summary: 'What they already take, which hard-excludes those products.',
    options: [
      { id: 'protein', label: 'Protein', icon: 'shaker', answers: { currentSupplements: ['protein'] } },
      { id: 'creatine', label: 'Creatine', icon: 'flask', answers: { currentSupplements: ['creatine'] } },
      { id: 'pre-workout', label: 'Pre-workout', icon: 'bolt', answers: { currentSupplements: ['pre-workout'] } },
      { id: 'multivitamin', label: 'Multivitamin', icon: 'capsule', answers: { currentVitamins: ['multivitamin'] } },
      { id: 'vitamin-d', label: 'Vitamin D', icon: 'sun', answers: { currentVitamins: ['vitamin-d'] } },
      { id: 'omega-3', label: 'Omega-3 / Fish oil', icon: 'droplet', answers: { currentVitamins: ['omega-3'] } },
      { id: 'magnesium', label: 'Magnesium', icon: 'hexagon', answers: { currentVitamins: ['magnesium'] } },
      { id: 'collagen', label: 'Collagen', icon: 'sparkle', answers: { currentVitamins: ['collagen'] } },
      { id: 'none', label: 'Starting fresh', icon: 'sparkle', exclusive: true },
    ],
  },
]

/** Ids of the fixed screens, in order. The planner reserves budget for these. */
export const FIXED_IDS = FIXED_QUESTIONS.map((q) => q.id)

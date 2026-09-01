import type { BankQuestion } from '../types'
import { chose, hasGoal, suspected, trains } from './predicates'

/**
 * The training ladder.
 *
 * v1 asks frequency, then style, then a style follow-up — three screens that
 * describe the training without ever asking what is going wrong with it.
 * "Build muscle" gets the same box whether the blocker is recovery, protein
 * intake or a genuine strength plateau, and those want three different stacks.
 *
 * So the first question here is the blocker, and frequency/style follow as one
 * screen rather than two. The net tap count is the same and the first tap is
 * the informative one.
 */

export const TRAINING_QUESTIONS: BankQuestion[] = [
  {
    id: 'training-blocker',
    topic: 'training',
    section: 'YOUR TRAINING',
    prompt: "What's actually holding you back?",
    hint: 'Be honest — this is the one that changes the most.',
    select: 'single',
    summary: 'The real blocker behind a muscle/performance goal.',
    discriminates: ['recovery-debt', 'low-protein', 'plateau', 'under-fuelled', 'joint-load'],
    requires: (s) => hasGoal(s, 'muscle', 'performance', 'bulking', 'recovery'),
    options: [
      {
        id: 'recovery',
        label: 'Recovery between sessions',
        sub: 'Still feeling the last one',
        drivers: { 'recovery-debt': 0.6 },
      },
      {
        id: 'protein',
        label: 'Getting the protein in',
        sub: 'Never quite hit it',
        drivers: { 'low-protein': 0.7 },
      },
      {
        id: 'plateau',
        label: 'Progress has stalled',
        sub: 'Same numbers for months',
        drivers: { 'plateau': 0.65 },
      },
      {
        id: 'appetite',
        label: 'Appetite — I struggle to eat enough',
        drivers: { 'under-fuelled': 0.6, 'low-protein': 0.4 },
      },
    ],
  },

  {
    id: 'recovery-feel',
    topic: 'recovery',
    section: 'RECOVERY',
    prompt: 'How do you feel two days after a hard session?',
    hint: 'This decides whether your box leans on recovery or on output.',
    select: 'single',
    summary: 'Whether the recovery complaint is soreness, fatigue or joints.',
    discriminates: ['recovery-debt', 'joint-load', 'sleep-debt', 'low-protein'],
    requires: (s) => chose(s, 'training-blocker', 'recovery') || suspected(s, 'recovery-debt'),
    options: [
      {
        id: 'sore',
        label: 'Still sore',
        sub: 'The muscles still haven’t let go',
        drivers: { 'recovery-debt': 0.7, 'low-protein': 0.35 },
      },
      {
        id: 'joints',
        label: 'Aches and niggles that linger',
        sub: 'More joints than muscle',
        drivers: { 'joint-load': 0.75 },
        signals: ['joint-issues'],
      },
      {
        id: 'flat',
        label: 'Not sore — just flat',
        sub: 'The energy hasn’t come back',
        drivers: { 'sleep-debt': 0.45, 'recovery-debt': 0.4 },
      },
      {
        id: 'fine',
        label: 'Ready to go again',
        clears: ['recovery-debt'],
      },
    ],
  },

  {
    id: 'training-shape',
    topic: 'training',
    section: 'YOUR TRAINING',
    prompt: 'How often do you train, and what kind?',
    hint: 'Frequency and style together shape the whole stack.',
    select: 'single',
    summary: 'Frequency and dominant style in one screen. Writes trainingFrequency and trainingType.',
    // Deliberately one screen rather than v1's two. The pairs that matter are
    // the ones offered; a five-day cardio athlete and a five-day lifter want
    // different stacks, but "three times a week, a bit of everything" does not
    // need two taps to say.
    discriminates: ['training-load', 'recovery-debt', 'hydration-deficit', 'low-protein'],
    requires: (s) => trains(s),
    options: [
      {
        id: 'lift-often',
        label: 'Weights, 4+ times a week',
        sub: 'Most days of the week',
        drivers: { 'training-load': 0.6, 'low-protein': 0.3 },
        answers: {
          trainingFrequency: '5-6x', trainingType: ['strength'],
          trainingExperience: 'experienced', trainingFocus: 'hypertrophy',
        },
      },
      {
        id: 'lift-few',
        label: 'Weights, 2–3 times a week',
        sub: 'Regular, not extreme',
        answers: {
          trainingFrequency: '3-4x', trainingType: ['strength'],
          trainingExperience: 'intermediate', trainingFocus: 'general',
        },
      },
      {
        id: 'mixed',
        // The gap in the first cut. "Weights and cardio, both" is one of the
        // most common training patterns there is, and it had to be squeezed
        // into either a pure-lifting or a pure-endurance answer.
        label: 'A mix of weights and cardio',
        sub: 'Neither one dominates',
        drivers: { 'training-load': 0.4, 'hydration-deficit': 0.3 },
        answers: {
          trainingFrequency: '3-4x', trainingType: ['mixed'],
          trainingExperience: 'intermediate',
        },
      },
      {
        id: 'cardio',
        label: 'Mostly running, cycling or swimming',
        sub: 'Endurance work',
        drivers: { 'hydration-deficit': 0.5, 'training-load': 0.4 },
        answers: {
          trainingFrequency: '3-4x', trainingType: ['cardio'],
          trainingExperience: 'intermediate',
        },
      },
      {
        id: 'hiit-sport',
        label: 'Classes, HIIT or a sport',
        sub: 'Hard, varied sessions',
        drivers: { 'hydration-deficit': 0.45, 'recovery-debt': 0.3 },
        answers: {
          trainingFrequency: '3-4x', trainingType: ['hiit'],
          trainingExperience: 'intermediate',
        },
      },
      {
        id: 'light',
        label: 'A couple of light sessions a week',
        answers: {
          trainingFrequency: '1-2x', trainingType: ['mixed'],
          trainingExperience: 'new',
        },
      },
    ],
  },

  {
    id: 'sweat',
    topic: 'training',
    section: 'YOUR TRAINING',
    prompt: 'How much do you sweat in a session?',
    hint: 'Electrolytes are only worth the money if you are actually losing them.',
    select: 'single',
    summary: 'Whether hydration/electrolytes belong in the stack at all.',
    discriminates: ['hydration-deficit'],
    requires: (s) => trains(s) || hasGoal(s, 'hydration'),
    options: [
      {
        id: 'soaked',
        label: 'Soaked through, every time',
        drivers: { 'hydration-deficit': 0.8 },
      },
      { id: 'moderate', label: 'A decent amount', drivers: { 'hydration-deficit': 0.4 } },
      { id: 'little', label: 'Barely break a sweat', clears: ['hydration-deficit'] },
    ],
  },

  {
    id: 'plateau-what',
    topic: 'training',
    section: 'YOUR TRAINING',
    prompt: 'What exactly has stalled?',
    hint: 'A stuck bench and a stuck mirror have different causes.',
    select: 'single',
    summary: 'Whether the plateau is strength, size or conditioning.',
    discriminates: ['plateau', 'low-protein', 'recovery-debt'],
    requires: (s) => chose(s, 'training-blocker', 'plateau'),
    options: [
      {
        id: 'strength',
        label: 'The numbers on the bar',
        drivers: { 'plateau': 0.75 },
        answers: { trainingFocus: 'powerlifting' },
      },
      {
        id: 'size',
        label: 'Size — I look the same',
        drivers: { 'plateau': 0.6, 'low-protein': 0.45 },
        answers: { trainingFocus: 'hypertrophy' },
      },
      {
        id: 'both',
        label: 'Both, and I feel run down with it',
        drivers: { 'plateau': 0.6, 'recovery-debt': 0.5 },
        signals: ['run-down'],
      },
    ],
  },
]

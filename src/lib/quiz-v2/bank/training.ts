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
        sub: 'Never quite hitting it',
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
    prompt: 'Two days after a hard session?',
    hint: 'Tells us whether to spend the budget on recovery or on output.',
    select: 'single',
    summary: 'Whether the recovery complaint is soreness, fatigue or joints.',
    discriminates: ['recovery-debt', 'joint-load', 'sleep-debt', 'low-protein'],
    requires: (s) => chose(s, 'training-blocker', 'recovery') || suspected(s, 'recovery-debt'),
    options: [
      {
        id: 'sore',
        label: 'Still sore',
        sub: 'Muscles have not let go',
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
        sub: 'The energy has not come back',
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
    prompt: 'How often, and what kind?',
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
        sub: 'Serious lifting volume',
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
        id: 'cardio',
        label: 'Mostly running or cycling',
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
        label: 'A couple of sessions, nothing heavy',
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
    hint: 'Electrolytes only earn their place if you actually lose them.',
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
      { id: 'little', label: 'Barely break one', clears: ['hydration-deficit'] },
    ],
  },

  {
    id: 'plateau-what',
    topic: 'training',
    section: 'YOUR TRAINING',
    prompt: 'What has stalled, exactly?',
    hint: 'Strength and size stall for different reasons.',
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

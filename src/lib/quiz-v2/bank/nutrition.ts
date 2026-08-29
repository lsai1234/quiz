import type { BankQuestion } from '../types'
import { asked, hasGoal, suspected, trains } from './predicates'

/**
 * Nutrition — the questions that decide whether a gap is real.
 *
 * `how-meals-happen` is v1's diet question, kept almost word for word, because
 * it was one of the good ones: it asks about the shape of the day rather than
 * asking someone to rate their own diet, and it writes the `diet` field the
 * engine already scores. What is new is that it is now *planned* — asked when
 * fuelling is a live suspect, and skipped when the interview has already
 * established that meals are not the problem.
 */

export const NUTRITION_QUESTIONS: BankQuestion[] = [
  {
    id: 'how-meals-happen',
    topic: 'nutrition',
    section: 'NUTRITION',
    prompt: 'How do most of your meals happen?',
    hint: 'No judgement — it just points us at the right gaps.',
    select: 'single',
    summary: 'Diet quality by routine rather than self-rating. Writes the `diet` field.',
    discriminates: ['micronutrient-gap', 'under-fuelled', 'low-protein', 'glycaemic-dip'],
    // Skipped when the afternoon question already settled it — that question
    // asks the same thing from a better angle and writes the same field.
    requires: (s) => !asked(s, 'energy-afternoon') || suspected(s, 'micronutrient-gap'),
    options: [
      {
        id: 'clean',
        label: 'Cooked from scratch',
        sub: 'Mostly home-cooked and planned',
        answers: { diet: 'clean' },
        clears: ['under-fuelled'],
      },
      {
        id: 'mostly-good',
        label: 'Decent but rushed',
        sub: 'Healthy-ish, not much time',
        drivers: { 'micronutrient-gap': 0.3 },
        answers: { diet: 'mostly-good' },
      },
      {
        id: 'inconsistent',
        label: "Grab whatever's easy",
        sub: 'Convenience-led — good days and bad',
        drivers: { 'micronutrient-gap': 0.55, 'glycaemic-dip': 0.3 },
        answers: { diet: 'inconsistent' },
      },
      {
        id: 'poor',
        label: 'All over the place',
        sub: 'No real routine right now',
        drivers: { 'micronutrient-gap': 0.75, 'under-fuelled': 0.45, 'low-protein': 0.4 },
        answers: { diet: 'poor' },
      },
    ],
  },

  {
    id: 'protein-reality',
    topic: 'nutrition',
    section: 'NUTRITION',
    prompt: 'Protein at every meal?',
    hint: 'The single biggest lever if you are training.',
    select: 'single',
    summary: 'Actual protein habit, for anyone whose blocker might be protein.',
    discriminates: ['low-protein'],
    requires: (s) => suspected(s, 'low-protein') || (trains(s) && hasGoal(s, 'muscle', 'bulking')),
    options: [
      {
        id: 'every-meal',
        label: 'Every meal, without thinking about it',
        clears: ['low-protein'],
      },
      {
        id: 'most',
        label: 'Most of them',
        drivers: { 'low-protein': 0.3 },
      },
      {
        id: 'dinner-only',
        label: 'Really only at dinner',
        drivers: { 'low-protein': 0.7 },
      },
      {
        id: 'no-idea',
        label: 'I honestly have no idea',
        drivers: { 'low-protein': 0.5 },
      },
    ],
  },

  {
    id: 'tried-before',
    topic: 'supps',
    section: 'WHAT YOU HAVE TRIED',
    prompt: 'Anything you have tried and given up on?',
    hint: "Tell us what did not work and we will not send it again.",
    select: 'single',
    // The audit's gap #9. Nothing in v1 captures "tried creatine, felt nothing"
    // or "protein wrecked my stomach", and both are high-signal — the second
    // one especially, because it is a tolerance problem the engine can route
    // around rather than a preference.
    summary: 'What they have tried and abandoned, and why. Routes around a known tolerance problem.',
    discriminates: ['gut-disruption', 'low-protein'],
    requires: (s) => trains(s) || hasGoal(s, 'health', 'energy'),
    options: [
      {
        id: 'upset-stomach',
        label: 'Protein shakes — they upset my stomach',
        drivers: { 'gut-disruption': 0.45 },
        // Whey is the usual culprit and the plant equivalent usually is not,
        // so this is a nudge rather than an exclusion.
      },
      {
        id: 'felt-nothing',
        label: 'Bits and pieces — never felt anything',
        sub: 'Nothing stuck',
      },
      {
        id: 'too-much-faff',
        label: 'Gave up on the routine, not the products',
        sub: 'Too many things to remember',
      },
      { id: 'nothing', label: 'Nothing — this is new to me' },
    ],
  },
]

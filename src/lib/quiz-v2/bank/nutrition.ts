import type { BankQuestion } from '../types'
import { asked, hasGoal, live, proteinModuleAllowed, suspected, trains } from './predicates'

/**
 * Nutrition — the questions that decide whether a gap is real.
 *
 * `protein-check` is the one that replaces a question rather than adding one.
 * "Do you get protein at every meal?" asked people to self-report a quantity
 * they have never counted, and its most-picked answer was the honest one — "I
 * honestly have no idea". See `docs/QUIZ_V2_PROTEIN.md`.
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
    id: 'protein-check',
    topic: 'nutrition',
    section: 'A NORMAL DAY',
    prompt: 'What does a normal day of eating look like?',
    // Replaced by `BASIS_LINE` at render time, which says what we already know
    // about their week without saying what it adds up to. This is the fallback
    // for anyone the basis cannot be read for.
    hint: 'Roughly is fine — we only need the shape of it.',
    select: 'protein',
    summary: 'Protein intake, estimated. Presets in one tap, or a counted day.',
    discriminates: ['low-protein', 'under-fuelled'],
    /*
     * The question this replaces asked people to self-report a quantity they
     * have never counted, and its most-picked answer was "I honestly have no
     * idea" — which is the honest one. Same gate as that question had, plus
     * the consent guard, plus a cutting goal (eating less is when protein
     * matters most and is hardest to hit).
     */
    requires: (s) =>
      proteinModuleAllowed(s) &&
      (live(s, 'low-protein') || (trains(s) && hasGoal(s, 'muscle', 'bulking', 'cutting', 'recovery'))),
    options: [
      /*
       * ── The presets. One tap, and the screen for anyone not counting. ────
       *
       * Written as days rather than diets: nobody knows what "moderate protein
       * intake" means about themselves, everybody knows whether they had toast.
       * The grams are the sums the counted path would produce for the same
       * description, so the two doors cannot contradict each other.
       *
       * Their `drivers` only ever reach the engine when there is no weight to
       * build a target from — with one, `projectAnswers` replaces this guess
       * with the measured gap.
       */
      {
        id: 'day-light',
        label: 'Not much until dinner',
        sub: 'Then a proper meal',
        grams: 55,
        drivers: { 'low-protein': 0.6, 'under-fuelled': 0.3 },
      },
      {
        id: 'day-normal',
        label: 'Three normal meals',
        sub: 'Nothing planned around protein',
        grams: 75,
        drivers: { 'low-protein': 0.45 },
      },
      {
        id: 'day-decent',
        label: 'Protein at two meals a day',
        sub: 'Eggs or yoghurt, then meat or fish',
        grams: 105,
        drivers: { 'low-protein': 0.2 },
      },
      {
        id: 'day-high',
        label: 'Protein at every meal',
        sub: 'And I snack on it too',
        grams: 145,
        clears: ['low-protein'],
      },
      /*
       * Door A, in the list rather than behind an escape hatch.
       *
       * It is the most-picked answer to the question this replaces, and hiding
       * the honest answer under a "rather not?" link punishes honesty. No
       * grams, so nothing downstream compares it to a target.
       */
      {
        id: 'no-idea',
        label: 'I honestly have no idea',
        drivers: { 'low-protein': 0.5 },
      },

      /* ── The counted day. Four beats, one screen. ──────────────────────── */
      { id: 'b-none', meal: 'breakfast', label: 'Nothing', grams: 0 },
      { id: 'b-carbs', meal: 'breakfast', label: 'Toast, cereal or fruit', grams: 8 },
      { id: 'b-protein', meal: 'breakfast', label: 'Eggs, yoghurt or similar', grams: 25 },
      { id: 'b-shake', meal: 'breakfast', label: 'A shake', grams: 25 },

      { id: 'l-none', meal: 'lunch', label: 'I skip it', grams: 0 },
      { id: 'l-light', meal: 'lunch', label: 'Sandwich, wrap or salad', grams: 20 },
      { id: 'l-protein', meal: 'lunch', label: 'Chicken, fish or similar', grams: 35 },
      { id: 'l-big', meal: 'lunch', label: 'A big portion', grams: 50 },

      { id: 'd-light', meal: 'dinner', label: 'Light or snacky', grams: 10 },
      { id: 'd-normal', meal: 'dinner', label: 'A normal portion', grams: 25 },
      { id: 'd-protein', meal: 'dinner', label: 'Meat or fish, decent size', grams: 40 },
      { id: 'd-big', meal: 'dinner', label: 'A big portion', grams: 55 },

      { id: 's-none', meal: 'snacks', label: 'None to speak of', grams: 0 },
      { id: 's-light', meal: 'snacks', label: 'Nuts, cheese or yoghurt', grams: 10 },
      { id: 's-one', meal: 'snacks', label: 'A shake or a protein bar', grams: 22 },
      { id: 's-many', meal: 'snacks', label: 'Two or more of those', grams: 40 },
    ],
  },

  {
    id: 'tried-before',
    topic: 'supps',
    section: 'WHAT YOU HAVE TRIED',
    prompt: 'How have supplements gone for you before?',
    hint: 'Tell us what did not work and we will not send it again.',
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

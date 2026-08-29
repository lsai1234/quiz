/**
 * Root cause → product affinity.
 *
 * The other half of the v2 interview: `quiz-v2` works out WHY someone is here,
 * and this decides what that changes. Shaped exactly like `GOAL_AFFINITY` in
 * `goal-map.ts`, read the same way by the same loop in `scoreProduct`, and
 * editable as data for the same reason — the recommendation should be re-tunable
 * without touching scoring code.
 *
 * ── The invariant this file must never break ────────────────────────────────
 * With no drivers present it contributes exactly zero. v1 answers carry no
 * drivers, and neither does anything saved before v2 existed, so v1's output is
 * byte-identical and the persona snapshot suite holds without amendment. That
 * property is what makes running two quizzes against one engine safe, and it is
 * asserted in the tests rather than trusted.
 *
 * ── Why the weights are scaled by confidence ────────────────────────────────
 * A driver at 0.3 is one half-answer; a driver at 0.9 has been asked about
 * twice and confirmed. Multiplying the affinity by the confidence means a
 * passing hint nudges the ranking and a settled finding moves it, which is the
 * behaviour the interview's whole confidence model exists to produce.
 *
 * ── The negative ones ───────────────────────────────────────────────────────
 * Two drivers push products AWAY. Someone whose energy problem IS caffeine, or
 * who is already wired at 11pm, should not be sold a stimulant — that is the
 * clearest case in the whole system of the interview knowing something the goal
 * label could never say. "More energy" alone would have earned them a
 * pre-workout.
 */
import type { SwapGroup } from '@/lib/catalogue/types'
import type { DriverId } from '@/lib/quiz-v2/drivers'

export const DRIVER_AFFINITY: Partial<Record<DriverId, Partial<Record<SwapGroup, number>>>> = {
  // ── Sleep ────────────────────────────────────────────────────────────────
  // Onset is a wind-down problem: theanine/ashwagandha blends are built for it.
  'sleep-onset':        { 'sleep-support': 24, magnesium: 14, adaptogen: 12 },
  // Waking through the night is where magnesium glycinate earns its place.
  'sleep-maintenance':  { magnesium: 22, 'sleep-support': 12, zma: 12 },
  // Hours are fine, rest is not — read as a gap rather than a sleep aid.
  'unrefreshing-sleep': { magnesium: 16, 'vitamin-d': 14, zma: 12, multivitamin: 10 },
  'sleep-debt':         { magnesium: 12, 'vitamin-b': 10, adaptogen: 8 },

  // ── Fuelling and stimulants ──────────────────────────────────────────────
  // Deliberately NOT a pre-workout. Someone crashing off caffeine wants the
  // B vitamins and an adaptogen, and wants the stimulant taken away — see
  // DRIVER_STIM_PENALTY below.
  'caffeine-crash':     { 'vitamin-b': 16, adaptogen: 12 },
  'glycaemic-dip':      { fibre: 12, greens: 10, 'protein-bar': 10 },
  'under-fuelled':      { 'protein-bar': 16, multivitamin: 12, 'protein-whey': 8 },
  'low-protein':        { 'protein-whey': 20, 'protein-plant': 16, 'protein-bar': 14, 'protein-clear': 10 },

  // ── Load ─────────────────────────────────────────────────────────────────
  'stress-load':        { adaptogen: 20, magnesium: 14, 'vitamin-b': 10 },
  'wired-evening':      { 'sleep-support': 18, magnesium: 14, adaptogen: 12 },
  'screen-fatigue':     { 'omega-3': 14, nootropic: 12 },
  'sedentary-slump':    { 'vitamin-d': 12, multivitamin: 10, 'omega-3': 8 },

  // ── Training ─────────────────────────────────────────────────────────────
  'training-load':      { aminos: 14, electrolytes: 12, magnesium: 10, multivitamin: 8 },
  'recovery-debt':      { aminos: 20, 'protein-whey': 12, zma: 12, magnesium: 10 },
  // Purpose-built joint formulas over collagen, for the same reason the
  // lifestyle rule already ranks them that way: glucosamine/MSM/curcumin exist
  // for this and nothing else, whereas collagen is a skin product that helps.
  'joint-load':         { 'joint-support': 26, collagen: 16, 'omega-3': 14 },
  'plateau':            { creatine: 22, 'protein-whey': 12, 'pre-workout-stim-free': 8 },

  // ── Everything else ──────────────────────────────────────────────────────
  'micronutrient-gap':  { multivitamin: 20, 'omega-3': 12, greens: 10, 'vitamin-d': 10 },
  'hydration-deficit':  { electrolytes: 26, aminos: 8 },
  'gut-disruption':     { probiotic: 22, fibre: 16, greens: 10 },
  // No zinc group in the catalogue — the multivitamin carries it, which is why
  // that one is weighted here rather than left to the goal affinity.
  'illness-frequency':  { 'vitamin-c': 18, 'vitamin-d': 16, multivitamin: 14 },
  'hormonal-shift':     { menopause: 24, magnesium: 12, 'omega-3': 10 },
  'sun-exposure-low':   { 'vitamin-d': 26, multivitamin: 8 },
}

/**
 * Drivers that make a stimulant the wrong answer, and by how much.
 *
 * Kept apart from the affinity table because it is not a swap-group preference
 * — it applies to any product carrying stimulants, whatever group it is in, and
 * reuses the penalty mechanism `SCORING.caffeine` and `SCORING.trainingTime`
 * already use rather than inventing a second one.
 */
export const DRIVER_STIM_PENALTY: Partial<Record<DriverId, number>> = {
  'caffeine-crash': -35,
  'wired-evening': -30,
  'sleep-onset': -20,
}

/**
 * What each driver changed, for the recap.
 *
 * Product language, so it belongs with the product decisions rather than with
 * the interview. Completes the sentence the driver's `heard` line starts:
 * "you find it hard to switch off at night" → "so we led with a wind-down
 * blend rather than a stimulant".
 */
export const DRIVER_CHANGED: Record<DriverId, string> = {
  'sleep-onset':        'so we led with a wind-down blend rather than anything stimulating',
  'sleep-maintenance':  'so magnesium glycinate is in, ahead of a general sleep aid',
  'unrefreshing-sleep': 'so we went after the gaps behind it rather than a sleep aid',
  'sleep-debt':         'so the stack supports the sleep you do get, and skips late stimulants',
  'caffeine-crash':     'so we left the pre-workout out and put B vitamins in',
  'glycaemic-dip':      'so there is fibre and a steadier source of fuel in there',
  'under-fuelled':      'so there is something you can actually get down on a busy day',
  'low-protein':        'so protein leads the stack',
  'stress-load':        'so an adaptogen and magnesium are in',
  'wired-evening':      'so nothing in your stack works against the evening',
  'screen-fatigue':     'so omega-3 is in for the long screen days',
  'sedentary-slump':    'so the everyday foundations are covered properly',
  'training-load':      'so recovery and electrolytes are sized for the volume',
  'recovery-debt':      'so recovery is the priority, not more output',
  'joint-load':         'so a joint formula is in ahead of anything else',
  'plateau':            'so creatine is in — the one with the evidence behind it',
  'micronutrient-gap':  'so the everyday multivitamin and omega-3 base is covered',
  'hydration-deficit':  'so electrolytes are in, not optional',
  'gut-disruption':     'so a probiotic and fibre lead',
  'illness-frequency':  'so vitamin D and C are the foundation of the stack',
  'hormonal-shift':     'so a hormonal-support blend is in',
  'sun-exposure-low':   'so vitamin D is in at the front of the stack',
}

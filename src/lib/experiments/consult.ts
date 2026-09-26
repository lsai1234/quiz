/**
 * The Amp Consult's feature flag and A/B split (build H11) — the pure half.
 *
 * What the hero offers a visitor:
 *
 *   quiz-only     the two quiz tracks, no consult. The kill switch.
 *   both          the two tracks and the consult as a third option.
 *   consult-only  the consult alone, where the quiz tracks were.
 *
 * And how the founder chooses it, from the hub, without a deploy:
 *
 *   off     everyone: quiz-only
 *   option  everyone: both — the consult as a third option (the default)
 *   split   `split`% of visitors: consult-only; the rest: quiz-only. A clean
 *           A/B: each visitor sees one front door, and both doors lead to the
 *           same results page, so conversion compares like with like.
 *   all     everyone: consult-only — for after the consult has won.
 *
 * It shares the visitor's bucket with the quiz experiment but reads it from
 * the other end (`BUCKET_COUNT - 1 - bucket`), so a 50/50 consult split and a
 * 50/50 v1/v2 split don't land on the same half of the population. Running
 * both at once is still best avoided: the quiz-v2 arm only matters to visitors
 * shown the quiz.
 *
 * `?consultArm=consult|quiz` pins a visitor to one door, for QA and founder
 * review, whatever the mode — the same trick as `?quizArm=`.
 */

import { BUCKET_COUNT } from './assignment'

export type ConsultMode = 'off' | 'option' | 'split' | 'all'
export type HeroOffer = 'quiz-only' | 'both' | 'consult-only'
export type ConsultArm = 'consult' | 'quiz'

export interface ConsultRollout {
  mode: ConsultMode
  /** Percentage of visitors shown the consult alone in `split` mode. 0–100. */
  split: number
  /**
   * Whether Amp's words come from the AI layer (level 4). Off by default: the
   * consult is complete on its scripted copy, and turning this on is the
   * moment it starts costing money per consult.
   */
  ai: boolean
}

export const DEFAULT_CONSULT_ROLLOUT: ConsultRollout = { mode: 'off', split: 50, ai: false }

/** Cookie pinning the consult arm outright, set from `?consultArm=`. */
export const CONSULT_ARM_COOKIE = 'chrgd_consult_arm'

const clampSplit = (n: number) => Math.max(0, Math.min(100, Math.round(n)))

export function heroOfferFor(bucket: number | null, rollout: ConsultRollout, pinned?: ConsultArm | null): HeroOffer {
  // Off means off, pin or no pin: while the consult is founders-only it is
  // reached at /quizv2 behind the sign-in, never from the public home page.
  if (rollout.mode === 'off') return 'quiz-only'
  if (pinned === 'consult') return 'consult-only'
  if (pinned === 'quiz') return 'quiz-only'
  switch (rollout.mode) {
    case 'option':
      return 'both'
    case 'all':
      return 'consult-only'
    case 'split':
      // No bucket yet (cookies blocked, first request): the known-good quiz.
      if (bucket == null) return 'quiz-only'
      return BUCKET_COUNT - 1 - bucket < clampSplit(rollout.split) ? 'consult-only' : 'quiz-only'
  }
}

/** Which arm a visitor is in, for analytics: did they see the consult alone, or the quiz? */
export function consultArmFor(offer: HeroOffer): ConsultArm | 'both' {
  return offer === 'consult-only' ? 'consult' : offer === 'quiz-only' ? 'quiz' : 'both'
}

/** A stored setting, normalised. Anything unrecognised falls back to the default. */
export function normaliseConsultRollout(raw: unknown): ConsultRollout {
  if (!raw || typeof raw !== 'object') return DEFAULT_CONSULT_ROLLOUT
  const r = raw as Record<string, unknown>
  const mode = r.mode === 'off' || r.mode === 'option' || r.mode === 'split' || r.mode === 'all' ? r.mode : DEFAULT_CONSULT_ROLLOUT.mode
  return {
    mode,
    split: clampSplit(typeof r.split === 'number' ? r.split : DEFAULT_CONSULT_ROLLOUT.split),
    ai: typeof r.ai === 'boolean' ? r.ai : DEFAULT_CONSULT_ROLLOUT.ai,
  }
}

export function parseConsultArm(raw: string | null | undefined): ConsultArm | null {
  return raw === 'consult' || raw === 'quiz' ? raw : null
}

export function isHeroOffer(v: unknown): v is HeroOffer {
  return v === 'quiz-only' || v === 'both' || v === 'consult-only'
}

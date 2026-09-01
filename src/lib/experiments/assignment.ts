/**
 * Which quiz a visitor gets — the pure half.
 *
 * Two quizzes now exist: `v1`, the questionnaire that ships today, and `v2`,
 * the adaptive interview (see `docs/QUIZ_V2_ADAPTIVE.md`). This module owns the
 * decision between them and nothing else: no cookies, no database, no network,
 * so the split can be tested exactly rather than observed.
 *
 * The visitor's side of it is a single integer 0–99 minted once by the
 * middleware and kept in a cookie. The middleware knows nothing about the
 * experiment — it just hands out a stable anonymous number, which is harmless
 * when the experiment is off and means the *decision* can live here, where the
 * settings are known.
 *
 * The default is `off`: everyone gets v1 until a founder says otherwise.
 */

export type QuizArm = 'v1' | 'v2'

/** Cookie holding the visitor's stable bucket (0–99). Minted by the middleware. */
export const BUCKET_COOKIE = 'chrgd_bucket'
/** Cookie pinning an arm outright, set from `?quizArm=`. QA and founder review. */
export const ARM_COOKIE = 'chrgd_arm'
/** How many buckets the population is divided into. */
export const BUCKET_COUNT = 100

export interface QuizExperimentConfig {
  /**
   *   off    — everyone gets v1. The default, and the kill switch.
   *   split  — `split`% of buckets get v2.
   *   all-v2 — everyone gets v2. For after the experiment has been won.
   */
  mode: 'off' | 'split' | 'all-v2'
  /** Percentage of visitors routed to v2 in `split` mode. 0–100. */
  split: number
  /**
   * Whether the v2 arm calls the AI steer at all. Off runs v2 from the
   * deterministic planner alone — which is how "is the AI earning its keep?"
   * gets answered without a code change.
   */
  aiSteer: boolean
  /**
   * How many questions v2 asks, per track, including the fixed screens.
   * Defaults are parity with v1 so the experiment measures the questions
   * rather than the length.
   */
  budget: { performance: number; wellbeing: number }
}

export const DEFAULT_QUIZ_EXPERIMENT: QuizExperimentConfig = {
  mode: 'off',
  split: 50,
  aiSteer: true,
  budget: { performance: 10, wellbeing: 8 },
}

/** The lowest and highest budget the settings screen will accept. Below the
 *  floor the interview cannot ask its fixed screens; above the ceiling it stops
 *  being the same product. */
export const BUDGET_MIN = 6
export const BUDGET_MAX = 14

/**
 * The arm for a visitor.
 *
 * `pinned` is an explicit `?quizArm=` choice and always wins — including over
 * `off`, so a founder can review v2 without switching it on for customers.
 * A missing bucket (cookies blocked, first request in flight) falls to v1: the
 * known-good quiz is always the safe default.
 */
export function armFor(
  bucket: number | null,
  config: QuizExperimentConfig,
  pinned?: QuizArm | null,
): QuizArm {
  if (pinned === 'v1' || pinned === 'v2') return pinned
  if (config.mode === 'off') return 'v1'
  if (config.mode === 'all-v2') return 'v2'
  if (bucket == null) return 'v1'
  return bucket < clampSplit(config.split) ? 'v2' : 'v1'
}

/**
 * The arm this visitor's RUN can actually use.
 *
 * `armFor` answers "which arm is this person in"; this answers "which quiz can
 * serve the journey they have started", and they are not the same question.
 *
 * CHRGD LQD is the case. The drinks route has its own two questions, its own
 * copy and a catalogue filtered to drinks, and v2 has none of it — worse, v2
 * finishes by handing the engine a freshly projected `QuizAnswers`, which
 * OVERWROTE the `drinksMode` the hero had set. A visitor assigned to v2 who
 * tapped the LQD card was quietly given a stack of tubs and capsules instead of
 * the drinks they asked for. Nothing failed, so nothing said so.
 *
 * Falling back to v1 is right rather than expedient: the experiment is about
 * the adaptive question set, and a drinks visitor is not in it.
 */
export function armForRun(arm: QuizArm, run: { drinksMode?: boolean | null }): QuizArm {
  return run.drinksMode ? 'v1' : arm
}

const clampSplit = (n: number): number => Math.max(0, Math.min(100, Math.round(n)))

const clampBudget = (n: unknown, fallback: number): number => {
  const v = typeof n === 'number' && Number.isFinite(n) ? Math.round(n) : fallback
  return Math.max(BUDGET_MIN, Math.min(BUDGET_MAX, v))
}

/** A stored settings blob, normalised. Anything unrecognised falls back to the
 *  default rather than throwing — a bad settings row must not break the quiz. */
export function normaliseExperiment(raw: unknown): QuizExperimentConfig {
  if (!raw || typeof raw !== 'object') return DEFAULT_QUIZ_EXPERIMENT
  const r = raw as Record<string, unknown>
  const mode =
    r.mode === 'split' || r.mode === 'all-v2' || r.mode === 'off'
      ? r.mode
      : DEFAULT_QUIZ_EXPERIMENT.mode
  const budget = (r.budget ?? {}) as Record<string, unknown>
  return {
    mode,
    split: clampSplit(typeof r.split === 'number' ? r.split : DEFAULT_QUIZ_EXPERIMENT.split),
    aiSteer: typeof r.aiSteer === 'boolean' ? r.aiSteer : DEFAULT_QUIZ_EXPERIMENT.aiSteer,
    budget: {
      performance: clampBudget(budget.performance, DEFAULT_QUIZ_EXPERIMENT.budget.performance),
      wellbeing: clampBudget(budget.wellbeing, DEFAULT_QUIZ_EXPERIMENT.budget.wellbeing),
    },
  }
}

/** A bucket cookie value, or null if it isn't one of ours. */
export function parseBucket(raw: string | null | undefined): number | null {
  if (!raw) return null
  if (!/^\d{1,3}$/.test(raw)) return null
  const n = Number(raw)
  return n >= 0 && n < BUCKET_COUNT ? n : null
}

/** A `?quizArm=` value, or null if it isn't one. */
export function parseArm(raw: string | null | undefined): QuizArm | null {
  return raw === 'v1' || raw === 'v2' ? raw : null
}

/** A fresh bucket. Uniform over [0, BUCKET_COUNT). */
export function mintBucket(): number {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const a = new Uint32Array(1)
    crypto.getRandomValues(a)
    // Rejection-free is not worth it at this scale: the modulo bias over 2^32
    // against 100 buckets is around one part in 43 million.
    return a[0] % BUCKET_COUNT
  }
  return Math.floor(Math.random() * BUCKET_COUNT)
}

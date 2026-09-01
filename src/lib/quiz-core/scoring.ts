/**
 * The scoring weights (data, not magic numbers).
 *
 * Every lever the engine used to hard-code as a literal `score += N` now lives
 * here as a named, editable value. `factory.ts`'s `scoreProduct` reads these, so
 * the recommendation can be re-tuned WITHOUT touching scoring code — the thing
 * the audit flagged as the engine's biggest maintainability risk.
 *
 * The values are the engine's original ones: extracting them into config is
 * behaviour-preserving (the persona snapshot suite proves it). Tune from here.
 */
export const SCORING = {
  /** Base: recommendationPriority × this. Set low to demote priority to a near
   *  tie-breaker (e.g. once the supplier feed pins everything to 5). */
  priorityBase: 10,
  /**
   * Top 25 roster boost. Applied as `topProductBase − (rank − 1) × topProductStep`
   * to products the founders put on the roster, so the #1 pick outranks the #25
   * one while every roster product still beats an unlisted equivalent.
   *
   * Deliberately smaller than `goalOverlap`: the roster is a preference between
   * products that could BOTH serve the user, never a reason to recommend
   * something that doesn't fit them. Products off the roster are not penalised —
   * with an empty roster (the default) scoring is exactly as it was.
   */
  topProductBase: 12,
  topProductStep: 0.4,

  /** Per goal the product shares with the user. */
  goalOverlap: 15,
  /** No goal overlap AND not a foundational supplement → penalty. */
  noGoalFloor: -30,

  /** Archetype → slot boosts. */
  archetype: {
    muscleProteinOrPerformance: 20,
    fatLossEnergyOrHealth: 15,
    healthTriad: 15,      // health slot / sleep / recovery
    wellbeingSleepOrHealth: 15,
  },

  /** Wellbeing follow-up refinements (sleep step). */
  wellbeing: {
    switchOffSleepSupport: 15,
    wakeMagnesium: 15,
    sleepFinePenalty: -20,
  },

  /** Lifestyle context. */
  lifestyle: {
    runDownImmune: 10,
    deskVitaminD: 8,
    shiftSleep: 8,
    jointCollagen: 22,
    jointOmega: 15,
    /** Purpose-built joint formulas, for the same `joint-issues` flag. Ranked
     *  above collagen: glucosamine/MSM/curcumin products exist for this and
     *  nothing else, whereas collagen is a skin product that also helps. */
    jointSupport: 26,
  },

  /** sleep-better → magnesium, but only when no sleep follow-up was answered. */
  sleepBetterMagnesium: 12,

  /** Deprioritise training slots the goals don't call for. */
  deprioritise: {
    performanceNonMuscle: -60,
    proteinNonMuscle: -50,
  },

  /** Mass gainer vs bulking. */
  mass: { bulkingBonus: 25, nonBulkingPenalty: -20 },

  /** Budget sensitivity: cheaper tiers penalise >£30 products. */
  budgetOverThreshold: -15,
  budgetThresholdPrice: 30,

  /**
   * The protein check's measured verdict (quiz v2).
   *
   * `overTarget` is large and finite on purpose. Large, because the screen told
   * the reader in as many words that we would leave protein out of their box,
   * and a promise the engine only half-keeps is worse than one never made —
   * `pickBest` drops a slot whose best score is below zero, which is exactly
   * the behaviour wanted. Finite rather than `-Infinity`, because the hard
   * gates above remove a product from the swap list too, and refusing to *sell*
   * someone protein is right where refusing to *show* it would be patronising.
   */
  protein: { overTarget: -200 },

  /**
   * How often the product needs replacing.
   *
   * A box where something lands every month reads as a subscription; a box of
   * six-month tubs reads as a standing order somebody forgot to cancel, and it
   * is the shape most likely to be cancelled after the second silent month. So
   * between two products that could each fill the same place, the one that runs
   * out about monthly is preferred.
   *
   * `tieMargin` is how much worse-fitting a monthly product is allowed to be
   * and still win. Deliberately smaller than a single `goalOverlap` (15): two
   * products within six points of each other are two answers to the same
   * question, and past that the fit is what separates them.
   *
   * NOT a score term. `preferMonthlySibling` in `stack-blueprint/factory.ts`
   * carries the argument for why — the short version is that cadence tracks
   * price, so a blanket bonus demotes the cheap foundational vitamins and puts
   * money on the bill for nothing.
   */
  cadence: { tieMargin: 6 },

  /** Diet quality. */
  diet: {
    cleanProtein: -20,
    poorMultivitamin: 12,
    poorOmega: 8,
    inconsistentMultivitamin: 6,
  },

  /** Training focus (strength sub-question) + sport type. */
  focus: {
    hypertrophyPerformance: 20,
    hypertrophyProtein: 10,
    powerliftingPerformance: 25,
    powerliftingCollagen: 10,
    generalPerformance: -8,
    sportEnergy: 10,
    sportHydration: 12,
  },

  /** Gender + age. */
  gender: { femaleMultivitamin: 8 },
  age: {
    over45VitaminD: 12, over45Collagen: 12, over45Omega: 8,
    midVitaminD: 6, midOmega: 5,
  },

  /** Stimulant timing + caffeine tolerance (stim products only). */
  trainingTime: { eveningWantsSleep: -40, eveningLowCaffeine: -20 },
  caffeine: { low: -15, medium: -5 },

  /** Training experience → stack complexity. */
  experience: {
    newProtein: 8, newPerformance: 5, newEnergyPenalty: -10,
    expPerformance: 10, expRecovery: 8, expHydration: 5,
  },
}

/** Swap groups with broad evidence for any active person — exempt from the
 *  no-goal-overlap floor. */
export const FOUNDATIONAL_SWAP_GROUPS = ['omega-3', 'vitamin-d', 'multivitamin', 'vitamin-c', 'magnesium'] as const

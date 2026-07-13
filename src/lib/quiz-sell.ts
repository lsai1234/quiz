/**
 * Selling-as-you-answer. Each pick in the quiz earns a short, benefit-led
 * reaction so the quiz is doing the selling work while the customer fills it in
 * — never a blocking interruption, just a chip that acknowledges the answer and
 * lands the value.
 *
 * In CHRGD LQD (drinks mode) every cue is about DRINKS and CONVENIENCE — the
 * whole run should feel like a brand experience about ready-made drinks. The
 * normal quiz gets the stack-benefit version of the same idea.
 *
 * Copy is claim-safe (mirrors the product `shortReason` voice): benefits and
 * convenience, no medical promises.
 */
import type { QuizAnswers } from '@/lib/types'
import type { StepId } from '@/lib/quiz-flow'

export interface SellingCue {
  /** Stable key — the cue only re-shows when this changes. */
  id: string
  /** QuizIcon name. */
  icon: string
  /** The one-line, benefit-led reaction. */
  text: string
}

// ── Drinks mode: convenience-first, every answer maps to a ready-made drink ──
const LQD_GOAL_CUE: Partial<Record<string, { icon: string; text: string }>> = {
  muscle: { icon: 'shaker', text: 'A ready-made protein shake — 20g+, no scooping, no clumps.' },
  energy: { icon: 'bolt', text: 'A pre-workout you just crack open — cold, fizzy, ready.' },
  performance: { icon: 'bolt', text: 'Creatine as a 10-second shot — no powder to stir.' },
  hydration: { icon: 'droplet', text: 'Electrolytes you sip, not sachets you stir.' },
  recovery: { icon: 'heart', text: 'Post-session recovery, already poured.' },
  health: { icon: 'leaf', text: 'Your whole multivitamin in one daily bottle — no pills.' },
  cutting: { icon: 'droplet', text: 'Light, low-cal drinks that keep the routine easy.' },
  bulking: { icon: 'shaker', text: 'Extra calories the easy way — drink them, done.' },
  'sleep-better': { icon: 'moon', text: 'A wind-down night drink instead of another tablet.' },
  'less-stress': { icon: 'leaf', text: 'A calm-in-a-bottle moment, ready when you are.' },
  focus: { icon: 'bolt', text: 'Focus you drink — nothing to remember to take.' },
  immune: { icon: 'shield', text: 'A daily immunity shot — one swig and you’re covered.' },
  'skin-hair-nails': { icon: 'sparkle', text: 'Collagen you drink — no capsules, no fuss.' },
  'gut-health': { icon: 'leaf', text: 'Greens you’ll actually drink, not powder you choke down.' },
  menopause: { icon: 'leaf', text: 'Daily support in a bottle — one less thing to manage.' },
}

const LQD_STEP_CUE: Partial<Record<StepId, { icon: string; text: string }>> = {
  drinksPerDay: { icon: 'droplet', text: 'However fast you drink them, your month’s covered — no daily admin.' },
  frequency: { icon: 'droplet', text: 'More sessions, more drinks in the fridge — grab one and go.' },
  diet: { icon: 'leaf', text: 'The gaps in your week, smoothed out — a drink a day and you’re sorted.' },
  caffeine: { icon: 'bolt', text: 'Stim or stim-free, it’s a drink either way — all ritual, your call on the jitters.' },
  supps: { icon: 'grid', text: 'Swap the shelf of tubs and pill bottles for one box of drinks.' },
  trainingTime: { icon: 'clock', text: 'We’ll time the caffeine to your training — the rest you sip whenever.' },
  lifestyle: { icon: 'droplet', text: 'Real life is busy — that’s the whole point of grab-and-go drinks.' },
  budget: { icon: 'bundle3', text: 'One box of drinks, delivered monthly. Pause or cancel anytime.' },
}

// ── Normal mode: the stack-benefit version of the same reactions ──
const STACK_GOAL_CUE: Partial<Record<string, { icon: string; text: string }>> = {
  muscle: { icon: 'shaker', text: 'Protein + creatine do the heavy lifting here.' },
  energy: { icon: 'bolt', text: 'A pre-workout dialled to how you handle caffeine.' },
  performance: { icon: 'bolt', text: 'Creatine — the most-researched performance staple.' },
  hydration: { icon: 'droplet', text: 'Electrolytes to train harder and recover faster.' },
  recovery: { icon: 'heart', text: 'Recovery support so you bounce back quicker.' },
  health: { icon: 'leaf', text: 'The everyday essentials most diets miss.' },
  'sleep-better': { icon: 'moon', text: 'Wind-down support for deeper, easier nights.' },
  'less-stress': { icon: 'leaf', text: 'Calm-focused support for the busy days.' },
  focus: { icon: 'bolt', text: 'Sharper focus without the crash.' },
  immune: { icon: 'shield', text: 'Daily immune support, all year round.' },
  'skin-hair-nails': { icon: 'sparkle', text: 'Collagen and the essentials for skin, hair & nails.' },
  'gut-health': { icon: 'leaf', text: 'Greens and gut support for the foundations.' },
  menopause: { icon: 'leaf', text: 'Targeted daily support for this stage.' },
}

const STACK_STEP_CUE: Partial<Record<StepId, { icon: string; text: string }>> = {
  frequency: { icon: 'bolt', text: 'Your frequency shapes the whole stack.' },
  diet: { icon: 'leaf', text: 'We fill the gaps your diet leaves — nothing wasted.' },
  caffeine: { icon: 'bolt', text: 'We match the pre-workout to your caffeine tolerance.' },
  supps: { icon: 'grid', text: 'We skip what you’ve got — you only pay for the gaps.' },
  trainingTime: { icon: 'clock', text: 'Timing decides whether stimulants make the cut.' },
  lifestyle: { icon: 'leaf', text: 'The little details sharpen every pick.' },
  budget: { icon: 'bundle3', text: 'Subscribe & save — better rate the bigger the bundle.' },
}

/** The most recently chosen value for the step, used to key goal/diet cues. */
function latestGoal(answers: QuizAnswers): string | undefined {
  return answers.goals[answers.goals.length - 1]
}

/**
 * The selling cue for the current answer state, or null if the step has nothing
 * to say yet (e.g. a required field still blank). `id` changes when the newest
 * relevant answer changes so callers can show it once per pick.
 */
export function sellingCueFor(
  stepId: StepId,
  answers: QuizAnswers,
  drinksMode = false,
): SellingCue | null {
  const goalCue = drinksMode ? LQD_GOAL_CUE : STACK_GOAL_CUE
  const stepCue = drinksMode ? LQD_STEP_CUE : STACK_STEP_CUE

  // Goals: react to the goal they just added.
  if (stepId === 'goals') {
    const g = latestGoal(answers)
    const c = g ? goalCue[g] : undefined
    if (g && c) return { id: `goals:${g}:${drinksMode ? 'l' : 's'}`, ...c }
    return null
  }

  const c = stepCue[stepId]
  if (!c) return null
  // Key by the step's chosen value where there is one, so re-picks re-show.
  const val =
    stepId === 'drinksPerDay' ? answers.drinksPerDay :
    stepId === 'frequency' ? answers.trainingFrequency :
    stepId === 'diet' ? answers.diet :
    stepId === 'caffeine' ? answers.caffeineLevel :
    stepId === 'trainingTime' ? answers.trainingTime :
    stepId === 'budget' ? answers.budget :
    stepId
  if (val == null) return null
  return { id: `${stepId}:${String(val)}:${drinksMode ? 'l' : 's'}`, ...c }
}

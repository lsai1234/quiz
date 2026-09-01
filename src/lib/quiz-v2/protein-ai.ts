import { MEALS, type Meal } from './protein'

/**
 * "Just tell us what you eat" — the protein check's fourth door.
 *
 * The presets are one tap and coarse; the counted day is four taps and better.
 * This is one sentence typed in the member's own words, read into the SAME four
 * meals, and it is the door most likely to be accurate, because nobody has to
 * decide whether their lunch is "a big portion".
 *
 * ── The model never produces a number ───────────────────────────────────────
 * This is the whole safety design and it is worth being blunt about. The model
 * is a CLASSIFIER: for each of the four meals it picks one of the options the
 * question bank already declares, by id. The grams then come off the bank, the
 * same table the counted day uses, and the comparison, the verdict and every
 * word the reader sees are the pre-written ones in `protein.ts`.
 *
 * So the worst a wrong, confused or adversarial model answer can do is put the
 * member on the wrong rung of a four-rung ladder they can see and correct — the
 * result lands on the editable summary, never straight into a verdict. It
 * cannot invent a gram figure, cannot write a sentence, cannot reach a
 * different question, and cannot make a claim about anybody's diet. That is the
 * only version of "AI in the protein calculator" that a supplement brand can
 * safely ship, and `docs/QUIZ_V2_PROTEIN.md` §1.7 is why.
 *
 * ── Pure ────────────────────────────────────────────────────────────────────
 * Prompt, schema and validator only, with no network — same split as `ai.ts`.
 * The route handler owns the call; a deterministic reader below owns the case
 * where there is no key, which is every local run and the whole e2e suite.
 */

/** As much as anybody types about a normal day, and a cap on what we send on. */
export const MAX_DAY_TEXT = 400

export interface ProteinDayRequest {
  /** What the member typed. Their own words — the one place in the quiz we send any. */
  text: string
  /**
   * The options the model may choose between, by meal. Sent from the client so
   * the bank stays the single place option ids are declared, and so a bank edit
   * cannot leave the prompt describing a menu that no longer exists.
   */
  options: Array<{ id: string; meal: Meal; label: string }>
}

/** One option id per meal. Anything else the caller drops. */
export type ProteinDayResult = Partial<Record<Meal, string>>

// ─── Prompt ───────────────────────────────────────────────────────────────────

export const PROTEIN_DAY_SYSTEM_PROMPT = `You are reading a short description of what somebody normally eats in a day, for a UK supplement shop's protein estimator.

For each of the four meals — breakfast, lunch, dinner, snacks — choose the ONE option id from the list given that best matches what they described.

Rules:
- Choose ONLY from the ids given for that meal. Never invent an id, and never put an id under a different meal than the one it is listed under.
- Judge by the PROTEIN in what they described, since that is what the options are graded by. "Toast and jam" and "a bowl of cereal" are the same answer.
- If they did not mention a meal at all, choose the option that means they skip it or have nothing — not the middle one. Say nothing rather than guess when no option fits.
- Read UK English food terms: tea can mean the evening meal, a bap or a butty is a sandwich, crisps are not a protein snack.
- Portions: only pick a "big portion" option when they actually said it was big, or described an amount that plainly is.
- You are classifying text. Never comment on the diet, never give advice, never mention health, weight or nutrition targets, and never write anything except the four ids.`

export function buildProteinDayPrompt(req: ProteinDayRequest): string {
  const byMeal = MEALS.map((meal) => {
    const options = req.options.filter((o) => o.meal === meal)
    return `${meal}:\n${options.map((o) => `- ${o.id}: ${o.label}`).join('\n')}`
  }).join('\n\n')

  return `THEY WROTE
"""
${req.text.slice(0, MAX_DAY_TEXT)}
"""

CHOOSE ONE ID PER MEAL
${byMeal}`
}

export const PROTEIN_DAY_JSON_SCHEMA = {
  type: 'object',
  properties: {
    breakfast: { type: ['string', 'null'] },
    lunch: { type: ['string', 'null'] },
    dinner: { type: ['string', 'null'] },
    snacks: { type: ['string', 'null'] },
  },
  required: ['breakfast', 'lunch', 'dinner', 'snacks'],
  additionalProperties: false,
} as const

// ─── Validation ───────────────────────────────────────────────────────────────

/**
 * Model output → picks we are willing to act on.
 *
 * Every id is checked against the options for THAT MEAL, so a hallucinated id, a
 * real id filed under the wrong meal, and a prompt-injection attempt all land in
 * the same place: dropped. A meal with no usable answer is simply left
 * unanswered, and the screen asks for it in the ordinary way.
 *
 * Returns null when nothing at all survived, which the caller treats exactly
 * like a timeout.
 */
export function parseProteinDayResult(
  raw: unknown,
  options: ReadonlyArray<{ id: string; meal: Meal }>,
): ProteinDayResult | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>

  const out: ProteinDayResult = {}
  for (const meal of MEALS) {
    const id = r[meal]
    if (typeof id !== 'string') continue
    if (!options.some((o) => o.id === id && o.meal === meal)) continue
    out[meal] = id
  }
  return Object.keys(out).length > 0 ? out : null
}

// ─── The reader that needs no key ─────────────────────────────────────────────

/**
 * The same job, done with a word list.
 *
 * Not a fallback bolted on for tests: it is what runs on every local machine and
 * in the whole e2e suite, because this repo's rule is that every journey works
 * with no API keys at all (see the README). It is worse than the model at
 * unusual sentences and identical to it on the ordinary ones — "eggs on toast,
 * chicken salad, curry, couple of protein bars" is not a hard parse.
 *
 * Scored rather than first-match: a lunch of "chicken sandwich" mentions both a
 * sandwich and chicken, and the higher-protein reading is the wrong one to take
 * by accident, so specificity wins and ties fall to the lower option. Erring low
 * errs against our own interest, which is the rule every rounding decision in
 * this module follows.
 */
interface Cue { id: string; words: string[]; weight?: number }

/**
 * Cues per meal, keyed by the bank's option ids.
 *
 * Kept here rather than in the bank because they are an implementation of the
 * reader, not a property of the option — and because a missing entry has to
 * degrade to "we could not read that meal", never to a guess.
 */
const CUES: Record<Meal, Cue[]> = {
  breakfast: [
    { id: 'b-none', words: ['skip breakfast', 'no breakfast', 'nothing for breakfast', 'nothing until', 'nothing till', 'just coffee', 'black coffee', 'only coffee', 'coffee only', 'coffee and nothing', "don't eat breakfast", 'dont eat breakfast', 'never eat breakfast'], weight: 3 },
    { id: 'b-shake', words: ['shake for breakfast', 'protein shake', 'shake in the morning', 'smoothie'], weight: 3 },
    { id: 'b-protein', words: ['eggs', 'omelette', 'scrambled', 'yoghurt', 'yogurt', 'greek', 'bacon', 'sausage', 'fry up', 'fry-up', 'kippers', 'cottage cheese'], weight: 2 },
    { id: 'b-carbs', words: ['toast', 'cereal', 'porridge', 'oats', 'granola', 'croissant', 'banana', 'fruit', 'crumpet', 'bagel', 'weetabix'], weight: 1 },
  ],
  lunch: [
    { id: 'l-none', words: ['skip lunch', 'no lunch', 'nothing at lunch', "don't eat lunch", 'dont eat lunch', 'work through lunch'], weight: 3 },
    { id: 'l-big', words: ['big lunch', 'large lunch', 'huge lunch', 'massive lunch', 'double portion'], weight: 3 },
    { id: 'l-protein', words: ['chicken', 'salmon', 'tuna', 'fish', 'steak', 'beef', 'turkey', 'prawns', 'tofu', 'meal prep', 'rice and'], weight: 2 },
    { id: 'l-light', words: ['sandwich', 'wrap', 'salad', 'soup', 'baguette', 'panini', 'sarnie', 'butty', 'bap', 'roll', 'meal deal', 'pasta salad'], weight: 1 },
  ],
  dinner: [
    { id: 'd-big', words: ['big dinner', 'large dinner', 'huge dinner', 'massive dinner', 'big meal at night', 'proper big'], weight: 3 },
    { id: 'd-protein', words: ['chicken', 'salmon', 'steak', 'beef', 'mince', 'fish', 'lamb', 'pork', 'curry', 'roast', 'chilli', 'bolognese', 'stir fry', 'stir-fry'], weight: 2 },
    { id: 'd-light', words: ['light dinner', 'snacky', 'beans on toast', 'toast for dinner', 'soup', 'just picky', 'picky bits', 'cereal for dinner', 'small dinner'], weight: 3 },
    { id: 'd-normal', words: ['pasta', 'pizza', 'rice', 'potatoes', 'normal dinner', 'usual dinner', 'whatever we cook', 'home cooked', 'home-cooked'], weight: 1 },
  ],
  snacks: [
    { id: 's-none', words: ['no snacks', "don't snack", 'dont snack', 'nothing in between', 'never snack', 'no snacking'], weight: 3 },
    { id: 's-many', words: ['two shakes', 'two protein bars', 'couple of shakes', 'couple of protein bars', 'few protein bars', 'shake and a bar', 'bar and a shake'], weight: 4 },
    { id: 's-one', words: ['protein bar', 'protein shake', 'shake', 'protein snack'], weight: 3 },
    { id: 's-light', words: ['nuts', 'cheese', 'yoghurt', 'yogurt', 'crisps', 'chocolate', 'biscuit', 'fruit', 'apple', 'banana', 'almonds', 'peanut'], weight: 1 },
  ],
}

/**
 * Words that say which meal a clause is about.
 *
 * Without these the reader scans the whole sentence for every meal, and
 * "chicken salad for lunch, pasta for dinner" reads the chicken into dinner too
 * — inflating the estimate, which is the one direction this module must not err
 * in.
 */
const MEAL_MARKERS: Array<{ meal: Meal; words: string[] }> = [
  { meal: 'breakfast', words: ['breakfast', 'first thing', 'when i wake', 'in the morning', 'morning'] },
  { meal: 'lunch', words: ['lunchtime', 'lunch', 'at midday', 'midday', 'at noon'] },
  { meal: 'dinner', words: ['evening meal', 'dinner', 'supper', 'for tea', 'at night', 'in the evening'] },
  {
    meal: 'snacks',
    // "Afternoon" earns its place here rather than under lunch: somebody writing
    // "a protein bar in the afternoon" is describing a snack, and it is the
    // commonest way anybody names one.
    words: ['in between', 'between meals', 'snacking', 'snacks', 'snack', 'afternoon', 'mid-morning', 'elevenses', 'through the day', 'throughout the day', 'during the day', 'on the go'],
  },
]

/**
 * Every marker as one list, longest word first.
 *
 * Flat and length-ordered rather than meal-by-meal, because the meals' words
 * overlap and the longer one is always the more specific: breakfast's "morning"
 * contains snacks' "mid-morning", and checking breakfast first filed "greek
 * yoghurt mid-morning" as breakfast — which then displaced the real breakfast
 * clause and cascaded through every meal after it. One four-meal day read as a
 * single 25g one.
 */
const MARKERS_BY_LENGTH: Array<{ word: string; meal: Meal }> = MEAL_MARKERS
  .flatMap(({ meal, words }) => words.map((word) => ({ word, meal })))
  .sort((a, b) => b.word.length - a.word.length)

/**
 * The text belonging to each meal.
 *
 * ── Clauses, marked then positional ─────────────────────────────────────────
 * People answer "what does a normal day look like?" as a list in order, and
 * they name some of the meals and not others. Both halves have to work.
 *
 * So the sentence is split on commas — commas only, because "eggs and bacon" is
 * one thing and splitting it would strand the bacon in somebody else's lunch —
 * and each clause is assigned in two passes. A clause that names a meal goes to
 * that meal. Every clause left over goes to the next meal nobody has claimed,
 * in meal order.
 *
 * The positional pass is what an earlier version was missing, and it failed
 * badly rather than gracefully: in "eggs and bacon, tuna wrap, salmon and veg,
 * greek yoghurt mid-morning" the single stray "mid-morning" was enough to claim
 * one clause and silently discard the other three, because the whole-text
 * fallback only applied when NO meal was named anywhere. One word turned a
 * complete day into a 10g one.
 *
 * Clauses past the last free meal are dropped rather than folded into a
 * neighbour. Dropping errs low, and low is the direction to err.
 */
function segmentByMeal(haystack: string): Partial<Record<Meal, string>> {
  const clauses = haystack.split(',').map((c) => ` ${c.trim()} `).filter((c) => c.trim())
  const out: Partial<Record<Meal, string>> = {}

  const named = clauses.map((clause) => MARKERS_BY_LENGTH.find((m) => clause.includes(m.word))?.meal ?? null)

  named.forEach((meal, i) => {
    if (meal) out[meal] = `${out[meal] ?? ''}${clauses[i]}`
  })

  // Whatever is left, in the order a day happens.
  let next = 0
  for (let i = 0; i < clauses.length; i++) {
    if (named[i]) continue
    while (next < MEALS.length && out[MEALS[next]] !== undefined) next++
    if (next >= MEALS.length) break
    out[MEALS[next]] = clauses[i]
    next++
  }

  return out
}

/**
 * Read a typed day without a model.
 *
 * Returns only the meals it is confident about. A meal it cannot read is left
 * out, and the screen asks for that one in the ordinary way — which is a much
 * better outcome than a middle option chosen to avoid a blank.
 */
export function readProteinDay(
  text: string,
  options: ReadonlyArray<{ id: string; meal: Meal }>,
): ProteinDayResult | null {
  // Commas survive normalisation: they are the clause boundary `segmentByMeal`
  // needs, and a cue phrase that spans one was never one phrase anyway.
  const haystack = ` ${text.toLowerCase().replace(/[^a-z0-9'\-, ]+/g, ' ').replace(/\s+/g, ' ')} `
  if (haystack.trim().length === 0) return null

  const segments = segmentByMeal(haystack)
  const allowed = new Set(options.map((o) => `${o.meal}:${o.id}`))
  const out: ProteinDayResult = {}

  for (const meal of MEALS) {
    // A meal with no clause of its own stays unanswered, and the screen asks
    // for it in the ordinary way. A middle option picked to avoid a blank is a
    // number nobody said.
    const scope = segments[meal]
    if (!scope) continue

    let bestId: string | null = null
    let bestWeight = 0
    for (const cue of CUES[meal]) {
      if (!allowed.has(`${meal}:${cue.id}`)) continue
      const weight = cue.weight ?? 1
      // Strictly greater, so the list order breaks a tie and the earlier —
      // lower-protein — reading wins.
      if (weight > bestWeight && cue.words.some((w) => scope.includes(w))) {
        bestWeight = weight
        bestId = cue.id
      }
    }
    if (bestId) out[meal] = bestId
  }

  return Object.keys(out).length > 0 ? out : null
}

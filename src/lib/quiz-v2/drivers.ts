/**
 * Root causes — the vocabulary the adaptive interview is actually for.
 *
 * v1 asks people to self-diagnose: they pick "more energy" and we map the label
 * onto products. Two people pick it for opposite reasons and get the same box.
 * A driver is the reason underneath the label — the thing that, if you knew it,
 * would change what you sent.
 *
 * ── Why it is a closed enum ─────────────────────────────────────────────────
 * Because everything downstream keys off it. `quiz-core/driver-map.ts` turns
 * drivers into product affinity, the recap turns them into sentences, and the
 * planner uses them to decide what is still worth asking. An open string set
 * would let a bank question introduce a driver nothing consumes — a question
 * that costs the user a tap and changes nothing. A test asserts every driver
 * here is both producible by some bank option and consumed by the map.
 *
 * ── Confidence, not booleans ────────────────────────────────────────────────
 * Drivers accumulate weight rather than flipping on. "I sleep under six hours"
 * is stronger evidence of sleep debt than "six to seven", and the planner needs
 * to tell a suspected driver (worth confirming) from a confirmed one (stop
 * asking). Weights are 0–1 and sum, capped at 1.
 */

export const DRIVER_IDS = [
  // Sleep — four different problems that all get called "bad sleep"
  'sleep-onset',
  'sleep-maintenance',
  'unrefreshing-sleep',
  'sleep-debt',
  // Fuelling and stimulants
  'caffeine-crash',
  'glycaemic-dip',
  'under-fuelled',
  'low-protein',
  // Load on the nervous system
  'stress-load',
  'wired-evening',
  'screen-fatigue',
  'sedentary-slump',
  // Training
  'training-load',
  'recovery-debt',
  'joint-load',
  'plateau',
  // Everything else that changes a stack
  'micronutrient-gap',
  'hydration-deficit',
  'gut-disruption',
  'illness-frequency',
  'hormonal-shift',
  'sun-exposure-low',
] as const

export type DriverId = (typeof DRIVER_IDS)[number]

const DRIVER_SET: Set<string> = new Set(DRIVER_IDS)

export const isDriverId = (v: unknown): v is DriverId =>
  typeof v === 'string' && DRIVER_SET.has(v)

/** Accumulated confidence per driver. Absent = never suggested. */
export type DriverWeights = Partial<Record<DriverId, number>>

/** At or above this, the interview stops asking about a driver: it is settled. */
export const CONFIRMED = 0.6
/** Below this a driver is noise — never shown in the recap, never scored. */
export const NOTED = 0.25

export interface DriverMeta {
  /** Two or three words. Used in the recap's left column. */
  label: string
  /**
   * What we heard, said back in the user's terms. Written to complete the
   * sentence "…so" — the map supplies the other half. Never clinical: these are
   * lifestyle observations, not findings, and the whole quiz depends on staying
   * on the right side of that line.
   */
  heard: string
}

export const DRIVERS: Record<DriverId, DriverMeta> = {
  'sleep-onset':        { label: 'Winding down',        heard: 'you find it hard to switch off at night' },
  'sleep-maintenance':  { label: 'Broken nights',       heard: 'you wake up through the night' },
  'unrefreshing-sleep': { label: 'Unrefreshing sleep',  heard: 'you get the hours in and still wake tired' },
  'sleep-debt':         { label: 'Short nights',        heard: 'you are running on less sleep than you need' },
  'caffeine-crash':     { label: 'Caffeine pattern',    heard: 'your day is built around coffee, and it comes back on you' },
  'glycaemic-dip':      { label: 'Post-meal dip',       heard: 'your energy falls away after you eat' },
  'under-fuelled':      { label: 'Skipped meals',       heard: 'meals get missed when the day gets busy' },
  'low-protein':        { label: 'Protein intake',      heard: 'getting enough protein in is the hard part' },
  'stress-load':        { label: 'Pressure',            heard: 'you are carrying a lot at the moment' },
  'wired-evening':      { label: 'Wired evenings',      heard: 'you are still wired when you should be winding down' },
  'screen-fatigue':     { label: 'Screen hours',        heard: 'you spend most of the day looking at a screen' },
  'sedentary-slump':    { label: 'Sitting still',       heard: 'you are sitting for most of the day' },
  'training-load':      { label: 'Training load',       heard: 'you are training hard and often' },
  'recovery-debt':      { label: 'Recovery',            heard: 'you are not bouncing back between sessions' },
  'joint-load':         { label: 'Joints',              heard: 'the aches and niggles hang around' },
  'plateau':            { label: 'Plateau',             heard: 'progress has flattened out' },
  'micronutrient-gap':  { label: 'Everyday gaps',       heard: 'your diet leaves some everyday gaps' },
  'hydration-deficit':  { label: 'Hydration',           heard: 'you sweat a lot and rarely replace it' },
  'gut-disruption':     { label: 'Digestion',           heard: 'your digestion has been unsettled' },
  'illness-frequency':  { label: 'Run down often',      heard: 'you pick things up more often than you would like' },
  'hormonal-shift':     { label: 'Hormonal change',     heard: 'your body is going through a hormonal change' },
  'sun-exposure-low':   { label: 'Daylight',            heard: 'you get very little daylight' },
}

/** Add evidence for a driver, capped at 1. Pure — returns a new object. */
export function addDriver(
  weights: DriverWeights,
  id: DriverId,
  amount: number,
): DriverWeights {
  return { ...weights, [id]: Math.min(1, (weights[id] ?? 0) + amount) }
}

/** Merge a whole option's worth of evidence. */
export function addDrivers(weights: DriverWeights, add: DriverWeights): DriverWeights {
  let out = weights
  for (const [id, amount] of Object.entries(add)) {
    if (isDriverId(id) && typeof amount === 'number') out = addDriver(out, id, amount)
  }
  return out
}

/** Drivers at or above `NOTED`, strongest first. What the recap talks about,
 *  and what the engine scores. */
export function rankedDrivers(weights: DriverWeights): Array<{ id: DriverId; weight: number }> {
  return (Object.entries(weights) as Array<[DriverId, number]>)
    .filter(([id, w]) => isDriverId(id) && w >= NOTED)
    .sort((a, b) => b[1] - a[1])
    .map(([id, weight]) => ({ id, weight }))
}

/**
 * What a category photograph has to be, and how to tell someone it is not.
 *
 * Pure and isomorphic on purpose: the settings screen checks a file before it
 * uploads it, the API route re-checks what arrives, and both read the same
 * numbers from here. A limit written twice is a limit that disagrees with itself
 * the first time one of them is changed.
 */

/** 8MB, on the file the founder picks — not on the derivative that is stored. */
export const ART_MAX_BYTES = 8 * 1024 * 1024

export const ART_MIMES = ['image/jpeg', 'image/png', 'image/webp']

/** 3:4 portrait, to ±2%. */
export const ART_RATIO = 3 / 4
export const RATIO_TOLERANCE = 0.02

/** What is stored and what the renderer draws. */
export const DERIVATIVE = { width: 1080, height: 1440 }

/**
 * The smallest source worth keeping: the size of the derivative itself.
 *
 * The rule is "storing this must not mean upscaling it", and the derivative is
 * 1080 × 1440 — so that, exactly, is the floor. It used to be 1200 × 1600, which
 * is a different and stricter rule than the one written beside it: a 1086 × 1448
 * photograph is a hair *larger* than what gets stored, downsamples rather than
 * upscales, and was still refused. Any real upscale — 900 × 1200, 1079 × 1439 —
 * fails exactly as it did.
 *
 * Derived rather than typed out, so the floor cannot drift away from the thing
 * it is the floor for.
 */
export const SOURCE_MIN = { width: DERIVATIVE.width, height: DERIVATIVE.height }

/**
 * What the card actually shows.
 *
 * The art window is 1080 × 1210 — roughly 8:9 — so `cover` from a 3:4 source
 * crops the bottom fifth away. The preview shows this crop rather than the whole
 * image, because a subject composed for the full frame and lost below the fold
 * is the single most likely way this goes wrong.
 */
export const CARD_WINDOW = { width: 1080, height: 1210 }

/** The share of the frame the outlined score is ghosted over. */
export const LEFT_THIRD = 1 / 3

/**
 * Above this mean luminance, the outlined numeral stops reading.
 *
 * Measured rather than picked: the score is drawn at 34% white, so it needs the
 * ground under it to stay well below mid grey. 96 of 255 is where the outline
 * starts competing rather than sitting on top.
 */
export const LEFT_THIRD_MAX_LUMA = 96

export interface SourceFile {
  width: number
  height: number
  type: string
  size: number
}

/**
 * Whether a file can be used, and if not, what was wrong with the one supplied.
 *
 * The message names what was received. "Needs to be 3:4" is a rule; "this is
 * 1000 × 1000 (1:1) — needs to be 3:4 portrait" is something the founder can act
 * on without opening the image again.
 */
export function validateSource(file: SourceFile): string | null {
  if (!ART_MIMES.includes(file.type)) {
    const got = file.type || 'an unrecognised type'
    return `${got} is not accepted. Use a JPG, PNG or WebP.`
  }

  if (file.size > ART_MAX_BYTES) {
    return `That file is ${mb(file.size)}MB. The limit is ${mb(ART_MAX_BYTES)}MB.`
  }

  // Shape before size, and the order is load-bearing. A 1000 × 1000 fails both,
  // and reporting the size first sends someone off to produce a 1600 × 1600 that
  // gets rejected all over again. Shape is the thing they have to go back to the
  // image for; size is the thing they can only fix by reshooting anyway.
  const ratio = file.width / file.height
  const drift = Math.abs(ratio - ART_RATIO) / ART_RATIO
  if (drift > RATIO_TOLERANCE) {
    return `That image is ${file.width} × ${file.height} (${describeRatio(ratio)}). It needs to be 3:4 portrait, within 2%.`
  }

  if (file.width < SOURCE_MIN.width || file.height < SOURCE_MIN.height) {
    return `That image is ${file.width} × ${file.height}. It needs to be at least ${SOURCE_MIN.width} × ${SOURCE_MIN.height}.`
  }

  return null
}

/** The warning for a bright left third. Never blocks — it is a judgement call. */
export function leftThirdWarning(meanLuminance: number): string | null {
  if (meanLuminance <= LEFT_THIRD_MAX_LUMA) return null
  return `The left third of this image is bright (${Math.round(meanLuminance)} of 255). The charge index is outlined over it and will start to disappear — a darker left edge reads better.`
}

function mb(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1)
}

/** "1:1", "16:9" — near enough to be recognisable, not exact arithmetic. */
export function describeRatio(ratio: number): string {
  const known: Array<[string, number]> = [
    ['1:1', 1], ['3:4', 0.75], ['4:3', 4 / 3], ['2:3', 2 / 3], ['3:2', 1.5],
    ['9:16', 0.5625], ['16:9', 16 / 9], ['4:5', 0.8], ['5:4', 1.25],
  ]
  let best = known[0]
  for (const candidate of known) {
    if (Math.abs(candidate[1] - ratio) < Math.abs(best[1] - ratio)) best = candidate
  }
  return Math.abs(best[1] - ratio) / ratio < 0.04 ? best[0] : `${ratio.toFixed(2)}:1`
}

/**
 * Removing the white ground from a supplier product photo.
 *
 * Supplement photography is shot as a cut-out on white and delivered as JPEG
 * with no alpha. On a dark storefront that white becomes a hard rectangle butted
 * against a near-black card — the highest-contrast edge in the UI, twice per
 * row, and the eye goes to the rectangles rather than the products. Worse, no
 * two suppliers use the same white, so padding them onto ours leaves a visible
 * seam and a ragged edge.
 *
 * So the white comes off at ingest and the product is composited onto the card's
 * own surface, where it floats. This is the single change that separates a dark
 * storefront that looks designed from one that looks assembled.
 *
 * ── Why a flood fill from the border, not a colour threshold ────────────────
 * "Remove every pixel brighter than X" eats white packaging: the Scitec tub has
 * a white label, the NOW Foods bottle is white, and a threshold takes holes out
 * of both. A flood fill can only remove background that is CONNECTED to the edge
 * of the frame, so an interior white label is unreachable however white it is.
 *
 * ── Why it can still be wrong, and what happens then ────────────────────────
 * A product photographed against white with no shadow separating it — a white
 * tub on white — has a background continuous with the product, and the fill will
 * walk straight into it. That case is detected rather than shipped: if the fill
 * removes more than `MAX_REMOVED` of the frame, or reaches the middle of it,
 * `shouldKey` returns false and the caller falls back to compositing onto a
 * light tile. A product that keeps its white plate is a worse card; a product
 * with its middle eaten out is a broken one.
 */

/** How far from pure white still counts as background, per channel (0-255). */
export const TOLERANCE = 26

/**
 * Past this fraction of the frame there is essentially nothing left, so the
 * photo was blank or the fill consumed everything.
 *
 * This started at 0.55, which was wrong and was caught by running the real
 * pipeline over realistic shots rather than over hand-drawn fixtures: an
 * ordinary cut-out is 55-75% background — a tall bottle centred in a square
 * frame is more — so a 55% ceiling rejected every good cut and the whole
 * feature silently fell back to the light tile. `touchesCentre` is the guard
 * that actually catches an escaped fill; this one is only a backstop for an
 * empty frame.
 */
export const MAX_REMOVED = 0.92

/** Below this, there was no white ground worth removing. */
export const MIN_REMOVED = 0.02

/**
 * Half-width of the centre box the fill must not reach, as a fraction of the
 * frame. A product occupies the middle; background does not.
 */
const CENTRE = 0.18

export interface KeyResult {
  /** One byte per pixel: 0 where the background was, 255 where the product is. */
  alpha: Uint8Array
  /** Fraction of the frame the fill removed. */
  removed: number
  /** True when the fill reached the centre box — it has escaped into the product. */
  touchesCentre: boolean
}

/**
 * Flood-fill the near-white background inward from every edge pixel.
 *
 * Iterative rather than recursive: a 640×640 frame is 409,600 pixels and a
 * recursive fill blows the stack on the first mostly-white image.
 */
export function keyBackground(
  data: Uint8Array | Buffer,
  width: number,
  height: number,
  channels: number,
  tolerance = TOLERANCE,
): KeyResult {
  const total = width * height
  const alpha = new Uint8Array(total).fill(255)
  const seen = new Uint8Array(total)
  const stack: number[] = []

  const isBackground = (i: number): boolean => {
    const p = i * channels
    // An already-transparent pixel is background by definition — it is the
    // padding a `contain` resize added, or a PNG that arrived with alpha.
    if (channels === 4 && data[p + 3] < 16) return true
    return (
      data[p] >= 255 - tolerance &&
      data[p + 1] >= 255 - tolerance &&
      data[p + 2] >= 255 - tolerance
    )
  }

  const push = (i: number) => {
    if (seen[i]) return
    seen[i] = 1
    if (!isBackground(i)) return
    alpha[i] = 0
    stack.push(i)
  }

  for (let x = 0; x < width; x++) {
    push(x)
    push((height - 1) * width + x)
  }
  for (let y = 0; y < height; y++) {
    push(y * width)
    push(y * width + width - 1)
  }

  while (stack.length > 0) {
    const i = stack.pop() as number
    const x = i % width
    const y = (i - x) / width
    if (x > 0) push(i - 1)
    if (x < width - 1) push(i + 1)
    if (y > 0) push(i - width)
    if (y < height - 1) push(i + width)
  }

  let removed = 0
  for (let i = 0; i < total; i++) if (alpha[i] === 0) removed++

  const x0 = Math.floor(width * (0.5 - CENTRE))
  const x1 = Math.ceil(width * (0.5 + CENTRE))
  const y0 = Math.floor(height * (0.5 - CENTRE))
  const y1 = Math.ceil(height * (0.5 + CENTRE))
  let touchesCentre = false
  for (let y = y0; y < y1 && !touchesCentre; y++) {
    for (let x = x0; x < x1; x++) {
      if (alpha[y * width + x] === 0) { touchesCentre = true; break }
    }
  }

  return { alpha, removed: removed / total, touchesCentre }
}

/**
 * Is this a keying we are willing to ship?
 *
 * Three ways to say no, and all three are better answered with the light-tile
 * fallback than with a damaged photograph.
 */
export function shouldKey(result: KeyResult): boolean {
  if (result.touchesCentre) return false
  if (result.removed > MAX_REMOVED) return false
  if (result.removed < MIN_REMOVED) return false
  return true
}

/**
 * Soften the cut edge.
 *
 * A hard binary alpha leaves the jaggies of the original JPEG's compression
 * along every curve, which is exactly the tell that an image has been machine
 * cut. One pass of a 3×3 box blur over the mask alone — not the colour — puts a
 * one-pixel ramp on the boundary and the edge reads as photographed rather than
 * as traced.
 */
export function featherMask(alpha: Uint8Array, width: number, height: number): Uint8Array {
  const out = new Uint8Array(alpha.length)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0
      let n = 0
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy
        if (yy < 0 || yy >= height) continue
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx
          if (xx < 0 || xx >= width) continue
          sum += alpha[yy * width + xx]
          n++
        }
      }
      out[y * width + x] = Math.round(sum / n)
    }
  }
  return out
}

/**
 * What an uploaded photograph has to be, and how to tell someone it is not.
 *
 * Pure and isomorphic on purpose: the editor checks a file before it uploads it,
 * the API route re-checks what arrives, and both read the same numbers from
 * here. A limit written twice is a limit that disagrees with itself the first
 * time one of them changes. Same arrangement as `share-card/art-upload`.
 *
 * ── Why the rules are looser than the share card's ──────────────────────────
 * A share card is a fixed 3:4 canvas with type composed over it, so its uploads
 * are held to that shape exactly. A bundle photograph is drawn into two boxes of
 * different shapes — a 128px card block and a 16:9 hero — both `object-fit:
 * cover`, so any reasonably large landscape or square picture works. Refusing a
 * good photograph over a ratio nothing depends on would be a rule for its own
 * sake.
 *
 * What IS enforced: a real image type, a size the database column can hold, and
 * enough pixels that the hero is not an upscale.
 */

/** 8MB, on the file the founder picks — not on the derivative that is stored. */
export const UPLOAD_MAX_BYTES = 8 * 1024 * 1024

export const UPLOAD_MIMES = ['image/jpeg', 'image/png', 'image/webp']

/**
 * The long edge of what gets stored.
 *
 * 1600 is twice the widest box the picture is drawn into on a phone at 2×, which
 * is the point past which more pixels are bytes nobody sees. The bytes live in a
 * database column, so this is the number that keeps the row sane: a 1600px JPEG
 * at quality 0.85 is a couple of hundred kilobytes.
 */
export const DERIVATIVE_MAX_EDGE = 1600

/** Below this on the long edge, the hero would be an upscale. */
export const SOURCE_MIN_EDGE = 800

export interface SourceFile {
  width: number
  height: number
  type: string
  size: number
}

/**
 * Whether a file can be used, and if not, what was wrong with the one supplied.
 *
 * The message names what was received: "that image is 640 × 480" is something a
 * founder can act on; "invalid image" is not.
 */
export function validateUpload(file: SourceFile): string | null {
  if (!UPLOAD_MIMES.includes(file.type)) {
    const got = file.type || 'an unrecognised type'
    return `${got} is not accepted. Use a JPG, PNG or WebP.`
  }
  if (file.size > UPLOAD_MAX_BYTES) {
    return `That file is ${mb(file.size)}MB. The limit is ${mb(UPLOAD_MAX_BYTES)}MB.`
  }
  const longEdge = Math.max(file.width, file.height)
  if (longEdge < SOURCE_MIN_EDGE) {
    return `That image is ${file.width} × ${file.height}. Its longest edge needs to be at least ${SOURCE_MIN_EDGE}px.`
  }
  return null
}

/** The stored size for a source, keeping its shape and capping the long edge. */
export function derivativeSize(width: number, height: number): { width: number; height: number } {
  const longEdge = Math.max(width, height)
  if (longEdge <= DERIVATIVE_MAX_EDGE) return { width, height }
  const scale = DERIVATIVE_MAX_EDGE / longEdge
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}

function mb(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1)
}

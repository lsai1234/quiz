/**
 * A brake on guessing at codes.
 *
 * A founder code is 40 bits, single-use and dead in 24 hours, so it is not
 * guessable in any practical sense. What this stops is the cheap version of the
 * attack: pointing a script at the code box and working through `FH-FREE-…`
 * until something takes. Without a limit that costs nothing but bandwidth.
 *
 * Same shape and the same honest caveat as the limiter on the hub's front door:
 * per-instance and in-memory, so on serverless the effective limit is this
 * number times however many instances are warm. It is a brake, not a lock. The
 * real one belongs at the edge.
 *
 * Keyed by IP alone — unlike a login there is no second identifier to pair it
 * with, and a code is not attached to an account anyone could be locked out of.
 */

/** Rejected code attempts allowed per IP before the box stops answering. */
const MAX_ATTEMPTS = 20
const WINDOW_MS = 10 * 60 * 1000
const MAX_KEYS = 5_000

interface Bucket {
  failures: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()

function current(key: string, now: number): Bucket | undefined {
  const bucket = buckets.get(key)
  if (!bucket) return undefined
  if (now > bucket.resetAt) {
    buckets.delete(key)
    return undefined
  }
  return bucket
}

export function codeAttemptAllowed(ip: string | null, now = Date.now()): boolean {
  const bucket = current(ip ?? 'unknown', now)
  return !bucket || bucket.failures < MAX_ATTEMPTS
}

/** Record a code that did not work. Successes are not counted — a founder
 *  redeeming their own code should never be a step towards a lockout. */
export function recordCodeMiss(ip: string | null, now = Date.now()): void {
  const key = ip ?? 'unknown'
  const bucket = current(key, now)
  if (bucket) {
    bucket.failures += 1
    // Sliding, so a script that keeps guessing keeps the door shut.
    bucket.resetAt = now + WINDOW_MS
    return
  }
  if (buckets.size >= MAX_KEYS) {
    const oldest = [...buckets.entries()].sort((a, b) => a[1].resetAt - b[1].resetAt)[0]
    if (oldest) buckets.delete(oldest[0])
  }
  buckets.set(key, { failures: 1, resetAt: now + WINDOW_MS })
}

/** Test seam — the counters are process-global and would leak between tests. */
export function __resetCodeGuessLimit(): void {
  buckets.clear()
}

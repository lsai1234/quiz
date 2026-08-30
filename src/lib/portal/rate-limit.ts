/**
 * A brake on password guessing at the Founders Hub door.
 *
 * The console behind this login can read every member's plan and, until the
 * safety flags were kept out of it, their health answers too. It had no limit at
 * all: an attacker could try passwords as fast as the network allowed, against
 * accounts whose addresses are listed on the sign-in screen.
 *
 * ── What this is, and is not ────────────────────────────────────────────────
 * Per-instance and in-memory, the same shape and the same honest caveat as the
 * limiter on `/api/errors`. On serverless each running instance keeps its own
 * counter, so the effective limit across a scaled-out deployment is this number
 * times however many instances happen to be warm. That makes it a brake, not a
 * lock — it turns "unlimited guesses" into "a few guesses per instance per
 * window", which defeats an online dictionary attack without pretending to be
 * infrastructure it is not.
 *
 * A real limit belongs at the edge (Vercel's WAF, Cloudflare) and should be
 * added there. This is what the application itself can honestly enforce.
 *
 * Keyed by IP AND email so one attacker cannot lock a founder out by hammering
 * their address from elsewhere: exhausting the attempts for `founder@…` from
 * one IP leaves the real founder, on a different IP, able to sign in.
 */

/** Failures allowed per key before the door closes. */
const MAX_ATTEMPTS = 8
/** How long the door stays closed, and the window failures are counted over. */
const WINDOW_MS = 15 * 60 * 1000
/** Stop the map growing without bound on a long-lived instance. */
const MAX_KEYS = 5_000

interface Bucket {
  failures: number
  /** When this bucket resets. Extended on each failure, so guessing prolongs it. */
  resetAt: number
}

const buckets = new Map<string, Bucket>()

function keyFor(ip: string | null, email: string): string {
  return `${ip ?? 'unknown'}|${email.trim().toLowerCase()}`
}

function currentBucket(key: string, now: number): Bucket | undefined {
  const bucket = buckets.get(key)
  if (!bucket) return undefined
  if (now > bucket.resetAt) {
    buckets.delete(key)
    return undefined
  }
  return bucket
}

/**
 * Whether this attempt may proceed, and how long to wait if not.
 *
 * Checked BEFORE the password is verified, so a locked-out caller never reaches
 * the comparison at all.
 */
export function loginAllowed(
  ip: string | null,
  email: string,
  now = Date.now(),
): { allowed: true } | { allowed: false; retryAfterSeconds: number } {
  const bucket = currentBucket(keyFor(ip, email), now)
  if (!bucket || bucket.failures < MAX_ATTEMPTS) return { allowed: true }
  return {
    allowed: false,
    retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
  }
}

/** Record a failed attempt. */
export function recordFailure(ip: string | null, email: string, now = Date.now()): void {
  const key = keyFor(ip, email)
  const bucket = currentBucket(key, now)

  if (bucket) {
    bucket.failures += 1
    // Sliding rather than fixed: an attacker who keeps guessing keeps the door
    // shut, instead of getting a fresh allowance the moment the window ends.
    bucket.resetAt = now + WINDOW_MS
    return
  }

  // Evicting the oldest entry rather than clearing the map: a flush would hand
  // every locked-out attacker a clean slate at once.
  if (buckets.size >= MAX_KEYS) {
    const oldest = [...buckets.entries()].sort((a, b) => a[1].resetAt - b[1].resetAt)[0]
    if (oldest) buckets.delete(oldest[0])
  }
  buckets.set(key, { failures: 1, resetAt: now + WINDOW_MS })
}

/** Clear the record after a successful sign-in. */
export function recordSuccess(ip: string | null, email: string): void {
  buckets.delete(keyFor(ip, email))
}

/** Test seam — the counters are process-global and would otherwise leak between tests. */
export function __resetRateLimit(): void {
  buckets.clear()
}

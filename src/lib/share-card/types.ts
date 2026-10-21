import type { StackLevel } from '@/lib/types'

/**
 * What a share card is made of — a frozen snapshot, taken once, at the moment
 * someone presses Share.
 *
 * ── Why a snapshot and not a live lookup ────────────────────────────────────
 * The obvious design is to store a stack id and re-derive the card at render
 * time. It is wrong here for a reason that only shows up months later: a card is
 * a public URL that may sit in someone's story highlights for a year, and
 * everything it would re-derive from moves underneath it. Products get swapped
 * and discontinued, the catalogue is re-priced, `NEXT_PUBLIC_DATA_SOURCE` flips
 * between mock and real, the AI reason text is regenerated. A card that
 * re-derives shows a stack its owner never shared, and there is no way to detect
 * that it has happened.
 *
 * So the payload carries everything the renderer needs and the renderer reads
 * nothing else. The one exception is deliberate and lives outside this type: the
 * competition's closing date is read from live campaign config at render time,
 * because a promotion that keeps advertising itself after it has closed is a
 * compliance problem rather than a stale card. See `docs/SHARE_CARD_BLUEPRINT.md`
 * §3.7.
 *
 * ── What is deliberately absent ─────────────────────────────────────────────
 * Price, email, age, gender, and every safety-screen answer. The safety step is
 * a health disclosure — pregnancy, breastfeeding, medication — and it does not
 * travel to a public asset under any flag. `firstName` is the only personal
 * field and it is opt-in, default off (see `buildSharePayload`).
 *
 * ── Versioning ──────────────────────────────────────────────────────────────
 * `v` is how the renderer keeps faith with cards shared before a redesign. Bump
 * it when the *meaning* of a field changes, never for an additive optional one,
 * and keep the old branch renderable rather than migrating stored rows: the
 * whole point of a snapshot is that nobody rewrites it after the fact.
 */
export const SHARE_PAYLOAD_VERSION = 1

/** One product on the card: what it is, and how much of it. */
export interface ShareLineupEntry {
  /**
   * The product type: "Whey Protein", "Vitamin C". Cards stored before
   * Phase 1 hold the slot's title here ("Immune Support"); see `category()` in
   * format.ts for how those print.
   */
  slot: string
  /** The product as the customer chose it. */
  product: string
  /**
   * Retired. Always '' on a card built now; older stored cards hold a slot
   * reason. No format prints it: a reason says what a product does, which is a
   * claim. Kept because stored cards and the decoder carry the field.
   */
  reason: string
  /**
   * The serving line — "30 G / DAY", "1 SCOOP".
   *
   * Taken from the catalogue's own active-ingredient data, and absent when the
   * catalogue has none. Never inferred: a dose invented for a layout is a claim
   * about how much of something a person should take, printed on a public card.
   */
  dose?: string
}

/** One coverage bar: a goal of the user's, and how well the stack serves it. */
export interface ShareCoverageEntry {
  /** Short axis label — "Muscle", "Sleep". */
  label: string
  /** 0–100. Scaled from `stackStatScore` so the renderer draws a meter and does
   *  no arithmetic of its own. */
  score: number
  /**
   * Whether any product in the stack actually targets this goal.
   *
   * This is not `score > 0`, and the difference is the whole reason the field
   * exists. `stackStatScore` gives every product a small non-zero baseline on
   * every axis, so a goal that nothing in the stack addresses still scores
   * around 31 — a bar a third full, captioned with a goal the customer asked for
   * and did not get. On a public card that reads as a claim.
   *
   * So the renderer draws untargeted axes as faint context rather than as fill,
   * which is the idiom the product deck already uses (`StatBar.targeted`).
   */
  targeted: boolean
}

/** A focus area with the glyph that scans for it. */
export interface ShareFocusArea {
  label: string
  /** A `QuizIcon` glyph name. */
  glyph: string
}

export interface ShareCardPayload {
  v: typeof SHARE_PAYLOAD_VERSION
  /**
   * The stack's name — the card's headline and the reason it gets
   * screenshotted. The engine's `stackName` on a card built now; older stored
   * cards may hold the AI identity's name, and keep it.
   */
  stackName: string
  /**
   * Retired, with `focusAreas` and `fitScore`: all three came from the AI
   * identity, which is no longer generated. A card built now holds '', [] and
   * null; older stored cards may hold values, and no format prints them. Kept
   * because stored cards and the decoder carry the fields.
   */
  archetype: string
  focusAreas: ShareFocusArea[]
  fitScore: number | null
  /**
   * Every product in the stack, in display order. The payload carries the whole
   * lineup and each format decides how many rows it has room for, because the
   * cap differs per format (six on the story card, four on the square and the
   * competition variant) and a payload that pre-truncated could not serve both.
   */
  lineup: ShareLineupEntry[]
  coverage: ShareCoverageEntry[]
  level: StackLevel
  /**
   * Which of the six card images this stack gets, frozen at share time.
   *
   * Derived rather than stored would be fine today and wrong the moment the art
   * set is re-shot or re-keyed: a card that has been posted keeps its picture.
   * See `art.ts`.
   */
  artKey?: string
  /**
   * The hero product's image, when the catalogue has one.
   *
   * Every mock product currently carries `imageUrl: null` — there is no product
   * photography in the system yet — so the card falls back to the house renders
   * in `share-card/art/`. This field is what makes real photography a data
   * change rather than a code change on the day it lands.
   */
  heroImage?: string
  /** Opt-in only. Absent unless the sharer explicitly asked for it. */
  firstName?: string
  /** Partner or entry code, shown as a chip and carried in the link. */
  code?: string
  createdAt: string
}

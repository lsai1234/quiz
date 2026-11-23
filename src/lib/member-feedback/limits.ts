/**
 * The feedback page's limits, shared by the page and the server
 * (`member-feedback/store`). In their own file so the page can read them
 * without pulling the store, and the database, into the browser.
 */

/** Long enough for a proper paragraph or three; short enough to read in the inbox. */
export const FEEDBACK_MAX = 2000
export const FEEDBACK_MIN = 3
/** Messages one member can send in a day. Enough for anyone with things to say, not enough to flood the inbox. */
export const FEEDBACK_PER_DAY = 5

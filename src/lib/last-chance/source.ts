/**
 * The line attribute a last-chance purchase carries.
 *
 * Contains "quiz" on purpose: `/api/cart` reads the channel from it, and this
 * is a sale the quiz made — it belongs in the quiz funnel, not the shop's.
 */
export const LAST_CHANCE_SOURCE = 'quiz-last-chance'

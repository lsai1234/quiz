/**
 * The line attribute a last-chance purchase carries.
 *
 * Contains "quiz" on purpose: `/api/cart` reads the channel from it, and this
 * is a sale the quiz made — it belongs in the quiz funnel, not the shop's.
 */
export const LAST_CHANCE_SOURCE = 'quiz-last-chance'


/**
 * Set in this browser once an order bought on the deal is confirmed, so the
 * card is not offered again: it is a one-time deal, and that has to be true of
 * the person who has had it.
 */
export const LAST_CHANCE_USED_KEY = 'chrgd:last-chance-used'

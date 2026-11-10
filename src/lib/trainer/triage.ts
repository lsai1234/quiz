/**
 * Sorting a question (Founders Hub only). Pure, safe in the browser.
 *
 * Words that suggest pain or an injury: the inbox offers the ready reply that
 * points them to a GP or physio. A plain word match, no AI; the trainer still
 * reads every question and decides.
 */
const PAIN = /\b(pain|painful|hurts?|hurting|injur(y|ies|ed)|sprain(ed)?|strain(ed)?|twinge|swollen|swelling|tweak(ed)?|pulled|numb|tingl(e|ing)|sharp)\b/i

export function mentionsPain(text: string): boolean {
  return PAIN.test(text)
}

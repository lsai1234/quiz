/**
 * The stack identity — pure half.
 *
 * Same split as `ai-stack.ts`, `ai-questions.ts` and `quiz-v2/ai.ts`: the copy
 * handling lives here with no network in sight, so it can be tested without
 * OpenAI and without pulling `next/server` into a unit test.
 *
 * ── What is not sent ────────────────────────────────────────────────────────
 * The customer's name. The prompt used to carry it next to their sex, age band
 * and goals — a directly identifying bundle going to a third-country processor,
 * and where the goal is menopause a health inference too, for a personal touch
 * that does not need the model's help. The model writes a placeholder and the
 * name is substituted here instead, on our own server.
 */

// Built per call rather than shared: a /g regex carries `lastIndex` between
// uses, so a module-level constant would make the second call on the same
// string behave differently from the first.
const namePlaceholder = () => /\{\{\s*NAME\s*\}\}/g

/**
 * Put the customer's first name back into copy the model wrote around
 * `{{NAME}}`.
 *
 * Defensive on both sides, because the model can always ignore the instruction:
 * with no name the placeholder is stripped along with any comma or dash left
 * dangling in front of the sentence, so the worst case is a slightly less
 * personal line rather than a visible template artefact on the reveal screen.
 */
export function personalise(text: string, firstName: string | null): string {
  if (firstName) return text.replace(namePlaceholder(), firstName)
  return text
    .replace(namePlaceholder(), '')
    .replace(/^\s*[,—-]\s*/, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/**
 * The instruction that asks for the placeholder, or nothing when we have no
 * name to substitute. Kept next to `personalise` so the token in the prompt and
 * the token being replaced cannot drift apart.
 */
export function nameInstruction(firstName: string | null): string {
  return firstName
    ? 'Start by addressing the reader directly, using the literal placeholder {{NAME}} where their name goes — write it exactly as {{NAME}}, do not invent or guess a name. '
    : ''
}

/**
 * AI description rewrite — the optional second pass over supplier copy.
 * ────────────────────────────────────────────────────────────────────
 * `cleanDescription` fixes the *markup*. It cannot fix the *voice*: what is left
 * is still PowerBody's storefront copy, written for their site — "Welcome to the
 * world of intense workouts and an active lifestyle!", a wall of technical
 * specs, and occasionally a health claim we are not allowed to repeat.
 *
 * This rewrites it into short, factual copy in our voice. Three guardrails, in
 * order of how much they matter:
 *
 *   1. **Claim safety is a hard gate, not a prompt instruction.** The model is
 *      told to avoid health claims, and then the output is *checked* with the
 *      same lint the rest of the shop copy uses (`shop/claim-safety`). Copy that
 *      trips it is thrown away and the cleaned supplier text kept instead. A
 *      prompt is a request; the lint is the rule.
 *   2. **Grounded, never invented.** The model may only restate what the source
 *      already says. It has no way to look a product up, so anything it adds is
 *      fabricated — and a made-up serving size on a supplement is worse than
 *      clumsy copy.
 *   3. **It always degrades to the cleaned text.** No key, a timeout, a refusal,
 *      an empty answer, a claim flag — every failure returns the cleaned
 *      supplier description. This can never leave a product with no copy.
 */
import OpenAI from 'openai'
import { cleanDescription } from './description'
import { claimFlags, type ClaimFlag } from '@/lib/shop/claim-safety'

export interface RewriteInput {
  title: string
  category: string
  description: string
}

export interface RewriteResult {
  text: string
  /** `ai` when the rewrite was used, `cleaned` when we fell back to the source. */
  source: 'ai' | 'cleaned'
  /** Why we fell back, when we did — for the script's report. */
  reason?: 'no-api-key' | 'no-source-text' | 'api-error' | 'empty-answer' | 'claim-flagged' | 'too-long'
  /** Claim-lint hits on the AI answer. Non-empty only with `reason: 'claim-flagged'`. */
  flags?: ClaimFlag[]
}

/** Long enough for a few sentences, short enough that a runaway answer is caught. */
const MAX_CHARS = 600

const SYSTEM = `You rewrite supplement product descriptions for a UK online supplement shop.

Rewrite the supplied description into 2-4 short, plain sentences of UK English.

WHAT TO WRITE
- Describe what the product IS: format (powder, capsules, RTD, accessory), size or
  serving count, the main ingredients, and how it is taken.
- Keep concrete facts from the source: capacity, weight, servings, dosages, flavour,
  material, dishwasher/vegan/BPA-free style attributes.
- Plain and calm. No exclamation marks, no second-person hype, no "welcome to the
  world of", no brand slogans.

WHAT NOT TO WRITE
- No health, medical or performance claims of ANY kind. Do not say a product
  treats, prevents, cures, boosts, speeds up, guarantees or is proven to do
  anything. Do not mention benefits at all - only what the product is.
- Never invent a fact. If the source does not give a number, do not state one.
  Fewer details is always better than a wrong detail.
- No headings, bullets, markdown or HTML. Sentences only.

Reply with the rewritten description as plain text and nothing else.`

function getClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY
  return apiKey ? new OpenAI({ apiKey }) : null
}

/**
 * Rewrite one product's description, falling back to the cleaned source text on
 * any failure. Always returns usable copy.
 */
export async function rewriteDescription(input: RewriteInput): Promise<RewriteResult> {
  const cleaned = cleanDescription(input.description)

  // Nothing to rewrite. Asking the model to describe a product from its title
  // alone is exactly the invention guardrail 2 exists to prevent.
  if (!cleaned) return { text: '', source: 'cleaned', reason: 'no-source-text' }

  const client = getClient()
  if (!client) return { text: cleaned, source: 'cleaned', reason: 'no-api-key' }

  let answer: string
  try {
    const completion = await client.chat.completions.create(
      {
        model: 'gpt-4.1-mini',
        messages: [
          { role: 'system', content: SYSTEM },
          {
            role: 'user',
            content: `Product: ${input.title}\nCategory: ${input.category}\n\nDescription:\n${cleaned}`,
          },
        ],
        max_tokens: 300,
        temperature: 0.3,
      },
      { timeout: 20000 },
    )
    answer = (completion.choices[0]?.message?.content ?? '').trim()
  } catch {
    return { text: cleaned, source: 'cleaned', reason: 'api-error' }
  }

  // Run the answer through the same cleaner: the model occasionally returns a
  // stray markdown bullet, and this keeps the plain-text invariant true no
  // matter what comes back.
  const text = cleanDescription(answer)

  if (!text) return { text: cleaned, source: 'cleaned', reason: 'empty-answer' }
  if (text.length > MAX_CHARS) return { text: cleaned, source: 'cleaned', reason: 'too-long' }

  const flags = claimFlags(text)
  if (flags.length > 0) return { text: cleaned, source: 'cleaned', reason: 'claim-flagged', flags }

  return { text, source: 'ai' }
}

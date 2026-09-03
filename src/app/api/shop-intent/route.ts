import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { getResolvedCatalogue } from '@/lib/catalogue/resolve'
import {
  buildIntentPrompt,
  parseIntentResult,
  SHOP_INTENT_SYSTEM_PROMPT,
  EMPTY_PATCH,
} from '@/lib/shop/intent-ai'

/**
 * Read a shopper's sentence into shop filters, when the synonym table could not.
 *
 * Deliberately unremarkable: with no `OPENAI_API_KEY` it returns an empty patch
 * and the shop carries on exactly as it did before this route existed. The shop
 * NEVER waits on it — see `ShopShell`, which renders local results first and
 * only folds this in if it arrives with something.
 *
 * Whatever the model says is validated against the live catalogue in
 * `parseIntentResult` before it leaves here, so the worst a bad completion can
 * do is nothing.
 */

// Constructed lazily: the OpenAI SDK throws at construction with no key, which
// would break page-data collection at build time.
function getClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY
  return apiKey ? new OpenAI({ apiKey }) : null
}

/** A sentence, not an essay. Anything longer is not a shop query. */
const MAX_QUERY = 200

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const query = typeof body?.query === 'string' ? body.query.trim().slice(0, MAX_QUERY) : ''

  const client = getClient()
  if (!query || !client) return NextResponse.json({ patch: EMPTY_PATCH })

  try {
    const { products } = await getResolvedCatalogue()
    if (products.length === 0) return NextResponse.json({ patch: EMPTY_PATCH })

    const completion = await client.chat.completions.create({
      // The same small, fast, JSON-reliable model the quiz personalisation uses.
      model: 'gpt-4.1-mini',
      messages: [
        { role: 'system', content: SHOP_INTENT_SYSTEM_PROMPT },
        { role: 'user', content: buildIntentPrompt(query, products) },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 300,
      temperature: 0.2,
    })

    const raw = completion.choices[0]?.message?.content ?? ''
    return NextResponse.json({ patch: parseIntentResult(raw, products) })
  } catch (error) {
    // A search that works without this must not break because of it.
    console.error('[shop-intent]', error)
    return NextResponse.json({ patch: EMPTY_PATCH })
  }
}

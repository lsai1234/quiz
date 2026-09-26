import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { COPY_MODEL, COPY_SYSTEM_PROMPT, COPY_TARGET_MS, buildCopyPrompt, copySchema, validateSceneCopy } from '@/lib/consult/ai/copy'
import { recordAi } from '@/lib/consult/ai/audit'
import { resolveSceneDef } from '@/lib/consult/flow'
import { EMPTY_ANSWERS } from '@/lib/consult/types'
import { isPortalAuthed } from '@/lib/portal/guard'

/**
 * POST /api/consult/health — "is the AI actually working?", for founders.
 *
 * Makes one real call of each kind the consult depends on, with made-up
 * answers (no customer data), and reports what came back: whether a key is
 * set, whether OpenAI accepted it, how long the wording took against the
 * plan's 1.5s target, and the words it wrote. The error text is OpenAI's own
 * ("Incorrect API key", "model not found"), which is the point: it says what
 * to fix.
 */

export const dynamic = 'force-dynamic'

interface Check {
  ok: boolean
  ms: number
  detail: string
}

async function timed(run: () => Promise<string>): Promise<Check> {
  const t0 = Date.now()
  try {
    const detail = await run()
    return { ok: true, ms: Date.now() - t0, detail }
  } catch (err) {
    const e = err as { status?: number; message?: string }
    return { ok: false, ms: Date.now() - t0, detail: `${e.status ? `${e.status} ` : ''}${e.message ?? 'failed'}`.slice(0, 200) }
  }
}

export async function POST() {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'founders only' }, { status: 401 })
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return NextResponse.json({ configured: false })

  const client = new OpenAI({ apiKey })
  const answers = { ...EMPTY_ANSWERS, route: 'deep' as const, goals: ['performance' as const, 'sleep' as const], age: '35-44' as const }
  const scene = resolveSceneDef('training', answers)

  const wording = await timed(async () => {
    const completion = await client.chat.completions.create(
      {
        model: COPY_MODEL,
        messages: [
          { role: 'system', content: COPY_SYSTEM_PROMPT },
          { role: 'user', content: buildCopyPrompt(scene, answers, 'about') },
        ],
        response_format: { type: 'json_schema', json_schema: { name: 'amp_scene_copy', strict: true, schema: copySchema(scene, true) } },
        max_tokens: 300,
        temperature: 0.6,
      },
      { timeout: 15_000, maxRetries: 0 },
    )
    const raw = completion.choices[0]?.message?.content?.trim()
    const copy = raw ? validateSceneCopy(JSON.parse(raw), scene) : null
    if (!copy) throw new Error('The reply failed the scene’s checks, so the scripted words would be used')
    return `“${copy.react ? `${copy.react} ` : ''}${copy.question}”`
  })

  const moderation = await timed(async () => {
    await client.moderations.create({ model: 'omni-moderation-latest', input: 'I work nights three times a week' }, { timeout: 10_000, maxRetries: 0 })
    return 'Moderation answered'
  })

  void recordAi({ at: Date.now(), route: 'health', model: COPY_MODEL, ms: wording.ms, outcome: wording.ok ? 'ok' : 'error' })
  return NextResponse.json({ configured: true, model: COPY_MODEL, targetMs: COPY_TARGET_MS, wording, moderation })
}

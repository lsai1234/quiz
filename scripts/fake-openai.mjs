#!/usr/bin/env node
/**
 * A stand-in for OpenAI, for trying the Amp Consult's AI features end to end
 * where the real API can't be reached (a sandbox, CI, a train).
 *
 *   node scripts/fake-openai.mjs            # listens on :4010
 *   OPENAI_API_KEY=fake OPENAI_BASE_URL=http://localhost:4010/v1 npm run dev
 *
 * The OpenAI SDK sends every request to OPENAI_BASE_URL, so the app runs its
 * real routes, prompts, schemas and validation against this. Each reply fills
 * the schema the request asked for, after a delay like the real thing's, so
 * the loading states show too. Nothing here is used by the app itself.
 *
 * FAKE_OPENAI_DELAY_MS sets the delay (default 900). FAKE_OPENAI_FAIL=voice
 * (or copy, understand, scan) makes that kind of call fail, to try fallbacks.
 */

import http from 'node:http'

const PORT = Number(process.env.FAKE_OPENAI_PORT ?? 4010)
const DELAY = Number(process.env.FAKE_OPENAI_DELAY_MS ?? 900)
const FAIL = new Set((process.env.FAKE_OPENAI_FAIL ?? '').split(',').filter(Boolean))

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let n = 0

function completion(content) {
  return {
    id: `chatcmpl-fake-${++n}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: 'fake',
    choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify(content) } }],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  }
}

/** Amp's words for a scene, shaped by the scene's own schema. */
function sceneCopy(schema, prompt) {
  const scene = /^Screen: ([^(\n]+?) \(/m.exec(prompt)?.[1]?.toLowerCase() ?? 'this'
  const out = {
    question: `Amp (AI) on ${scene}: your call?`.slice(0, 48),
    hint: 'Written for you by Amp’s AI. Same thing to do on screen.',
  }
  if (schema.properties.react) out.react = 'Nice one. Noted.'
  if (schema.properties.labels) {
    out.labels = Object.fromEntries(schema.properties.labels.required.map((k) => [k, `AI: ${k} for you`.slice(0, 40)]))
  }
  return out
}

/** "Tell Amp more": pick answers out of whatever was typed. */
function picks(text) {
  const t = text.toLowerCase()
  const out = []
  const coffees = /(\d+|two|three|four) coffees?/.exec(t)
  if (coffees) out.push({ kind: 'coffee', value: String({ two: 2, three: 3, four: 4 }[coffees[1]] ?? coffees[1]), label: `${coffees[1]} coffees a day` })
  if (/night/.test(t)) out.push({ kind: 'note', value: 'night shifts', label: 'Works night shifts' })
  if (/fish/.test(t)) out.push({ kind: 'food', value: 'oily-fish', label: 'Eats oily fish' })
  if (/knee/.test(t)) out.push({ kind: 'sore', value: 'knees', label: 'Sore knees' })
  if (!out.length) out.push({ kind: 'note', value: text.slice(0, 40), label: text.slice(0, 40) })
  return { picks: out }
}

async function readBody(req) {
  const chunks = []
  for await (const c of req) chunks.push(c)
  return Buffer.concat(chunks)
}

const server = http.createServer(async (req, res) => {
  const send = (status, body) => {
    res.writeHead(status, { 'content-type': 'application/json' })
    res.end(JSON.stringify(body))
  }
  const fail = (what) => send(500, { error: { message: `fake-openai: ${what} set to fail`, type: 'server_error' } })
  try {
    const raw = await readBody(req)
    await sleep(DELAY)

    if (req.url.endsWith('/moderations')) return send(200, { id: 'modr-fake', model: 'fake', results: [{ flagged: false, categories: {}, category_scores: {} }] })

    if (req.url.endsWith('/audio/transcriptions')) {
      if (FAIL.has('voice')) return fail('voice')
      return send(200, { text: 'I work nights three times a week and have two coffees' })
    }

    if (req.url.endsWith('/chat/completions')) {
      const body = JSON.parse(raw.toString('utf8'))
      const name = body.response_format?.json_schema?.name
      const schema = body.response_format?.json_schema?.schema
      const prompt = body.messages?.map((m) => (typeof m.content === 'string' ? m.content : '')).join('\n') ?? ''
      switch (name) {
        case 'amp_scene_copy':
          if (FAIL.has('copy')) return fail('copy')
          return send(200, completion(sceneCopy(schema, prompt)))
        case 'amp_picks': {
          if (FAIL.has('understand')) return fail('understand')
          const typed = /"""([\s\S]*)"""/.exec(body.messages.at(-1).content ?? '')?.[1] ?? ''
          return send(200, completion(picks(typed)))
        }
        case 'amp_explain':
          return send(200, completion({ found: true, answer: 'From the approved text: it’s about how you feel on a normal day.' }))
        case 'amp_shelf':
          if (FAIL.has('scan')) return fail('scan')
          return send(200, completion({ items: ['creatine', 'omega-3', 'vitamin-d'] }))
        case 'amp_tracker':
          if (FAIL.has('scan')) return fail('scan')
          return send(200, completion({ bedtime: '23:15', waketime: '06:45', quality: 'ok', week: ['gym', 'rest', 'cardio', 'rest', 'gym', 'sport', 'rest'] }))
        default:
          return send(400, { error: { message: `fake-openai: no reply for schema ${name}` } })
      }
    }
    send(404, { error: { message: `fake-openai: ${req.method} ${req.url} not faked` } })
  } catch (err) {
    send(500, { error: { message: String(err) } })
  }
})

server.listen(PORT, () => console.log(`fake OpenAI on http://localhost:${PORT}/v1 (delay ${DELAY}ms${FAIL.size ? `, failing ${[...FAIL]}` : ''})`))

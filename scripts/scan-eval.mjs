#!/usr/bin/env node
/**
 * The upload read's acceptance check (builds U1, U2): "reads 90% of 30 real
 * photos correctly".
 *
 *   node scripts/scan-eval.mjs <folder> [--url http://localhost:3000]
 *
 * The folder holds the photos and an `expected.json` saying what each one
 * shows — the same values the consult uses:
 *
 *   {
 *     "shelf-01.jpg":   { "kind": "shelf", "items": ["creatine", "protein"] },
 *     "whoop-week.png": { "kind": "tracker", "app": "whoop",
 *                         "bed": "23:15", "wake": "06:45", "week": ["gym", "rest", …] }
 *   }
 *
 * Each photo is shrunk the way the browser does (1024px, JPEG 0.82), posted to
 * a running app's /api/consult/scan, and marked right only when the read is
 * exactly what's expected: every item and no extras for a shelf; bedtime and
 * wake within 15 minutes and the same week for a tracker (a field left out of
 * expected.json isn't checked). Exits non-zero below 90%.
 */

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const [dir, ...rest] = process.argv.slice(2)
if (!dir) {
  console.error('Usage: node scripts/scan-eval.mjs <folder> [--url http://localhost:3000]')
  process.exit(2)
}
const at = rest.indexOf('--url')
const url = at >= 0 && rest[at + 1] ? rest[at + 1] : 'http://localhost:3000'
const TARGET = 0.9

const expected = JSON.parse(await readFile(path.join(dir, 'expected.json'), 'utf8'))
const minutes = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}
const near = (a, b) => a !== null && Math.min(Math.abs(a - b), 1440 - Math.abs(a - b)) <= 15

async function shrink(file) {
  const buf = await sharp(file).rotate().resize(1024, 1024, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer()
  return `data:image/jpeg;base64,${buf.toString('base64')}`
}

function judge(want, got) {
  if (want.kind === 'shelf') {
    const items = got.items ?? []
    const missing = want.items.filter((i) => !items.includes(i))
    const extra = items.filter((i) => !want.items.includes(i))
    return { ok: missing.length === 0 && extra.length === 0, detail: [missing.length && `missing ${missing}`, extra.length && `extra ${extra}`].filter(Boolean).join('; ') }
  }
  const r = got.read ?? {}
  const wrong = []
  if (want.bed && !near(r.bed ?? null, minutes(want.bed))) wrong.push(`bed ${r.bed}`)
  if (want.wake && !near(r.wake ?? null, minutes(want.wake))) wrong.push(`wake ${r.wake}`)
  if (want.week && JSON.stringify(r.week) !== JSON.stringify(want.week)) wrong.push(`week ${JSON.stringify(r.week)}`)
  if (want.quality && r.quality !== want.quality) wrong.push(`quality ${r.quality}`)
  return { ok: wrong.length === 0, detail: wrong.join('; ') }
}

let right = 0
const files = Object.keys(expected)
for (const name of files) {
  const want = expected[name]
  let got
  try {
    const res = await fetch(`${url}/api/consult/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: want.kind, app: want.app, image: await shrink(path.join(dir, name)) }),
    })
    got = await res.json()
  } catch (err) {
    got = { error: String(err) }
  }
  if (got.unavailable) {
    console.error('The app has no OPENAI_API_KEY: nothing to evaluate.')
    process.exit(2)
  }
  const { ok, detail } = got.fallback || got.error ? { ok: false, detail: got.error ?? 'fallback' } : judge(want, got)
  if (ok) right++
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? `  (${detail})` : ''}`)
  // Stay under the route's 10-a-minute limit.
  await new Promise((r) => setTimeout(r, 6500))
}

const score = files.length ? right / files.length : 0
console.log(`\n${right}/${files.length} read correctly (${Math.round(score * 100)}%). Target ${TARGET * 100}%${files.length < 30 ? `, over at least 30 photos — only ${files.length} here` : ''}.`)
process.exit(score >= TARGET && files.length >= 30 ? 0 : 1)

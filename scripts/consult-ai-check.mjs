#!/usr/bin/env node
/**
 * Every AI feature of the Amp Consult, end to end, in a real browser.
 *
 * Drives /quizv2 as a founder: the Founder preview and its live AI test, AI
 * wording on the first scene, "Tell Amp more" typed (filled in, then on to the
 * next screen), "What's this?" follow-ups, a finished consult, Pinpoint's
 * worded questions, hunch line and "Tell me about a bad day", and the hub's
 * AI log. Voice, the tracker read and the shelf scan are switched off for now
 * (features.ts); the run checks they aren't offered. Prints what each one did; exits non-zero on
 * the first failure.
 *
 * Against the fake OpenAI (no key, no cost, works offline):
 *   node scripts/fake-openai.mjs &
 *   OPENAI_API_KEY=fake OPENAI_BASE_URL=http://localhost:4010/v1 \
 *   FOUNDER_1_EMAIL=founder@e2e.test FOUNDER_1_PASSWORD=e2e-founder-pw \
 *     npx next dev --port 3500 &
 *   npm run check:consult-ai
 *
 * Or against a real deployment with a real key, as a founder:
 *   npm run check:consult-ai -- --url https://… --email you@… --password …
 */

import { chromium } from 'playwright-core'
import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import sharp from 'sharp'

const args = process.argv.slice(2)
const arg = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback)
const BASE = arg('--url', 'http://localhost:3500')
const EMAIL = arg('--email', 'founder@e2e.test')
const PASSWORD = arg('--password', 'e2e-founder-pw')
const dir = mkdtempSync(path.join(tmpdir(), 'consult-ai-'))
const PHOTO = path.join(dir, 'photo.jpg')
await sharp({ create: { width: 600, height: 400, channels: 3, background: { r: 40, g: 60, b: 90 } } }).jpeg().toFile(PHOTO)
const executablePath = [process.env.CHROME_PATH, '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => p && existsSync(p))
const b = await chromium.launch({ ...(executablePath ? { executablePath } : {}), args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] })
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, permissions: ['microphone'] })
const p = await ctx.newPage()
const errs = []
p.on('pageerror', (e) => errs.push(e.message))
p.on('console', (m) => { if (m.type() === 'error' && !/favicon|Download the React DevTools/.test(m.text())) errs.push(m.text().slice(0, 200)) })
await p.addInitScript(() => {
  window.__spoken = []
  const s = window.speechSynthesis
  Object.defineProperty(window, 'speechSynthesis', { value: { speak: (u) => window.__spoken.push(u.text), cancel: () => {}, getVoices: () => s.getVoices() } })
})
const log = (...a) => console.log('•', ...a)
const shot = (n) => p.screenshot({ path: path.join(dir, `${n}.png`) })
const h1 = () => p.locator('h1').first().textContent()
const next = () => p.getByRole('button', { name: /^(Next|Looks right|Continue|Back to review)$/ }).click({ timeout: 5000 })

// 0. Signed out: the login, nothing else.
await p.goto(BASE + '/quizv2')
log('signed out shows login:', await p.getByLabel(/email/i).isVisible())

// 1. Founder login.
const res = await p.request.post(BASE + '/api/portal/login', { data: { email: EMAIL, password: PASSWORD } })
log('founder login status:', res.status())
await p.goto(BASE + '/quizv2', { waitUntil: 'networkidle' })

// 2. Founder preview panel + live AI test.
await p.getByRole('button', { name: 'What’s on' }).click()
log('panel says AI:', (await p.getByRole('dialog', { name: 'Founder preview' }).innerText()).split('\n').find((l) => /AI layer/.test(l)))
await p.getByRole('button', { name: /Test the AI now/ }).click()
await p.getByText(/Amp’s words \(/).waitFor({ timeout: 20000 })
log('AI test:', await p.getByText(/Amp’s words \(/).locator('xpath=..').innerText())
await shot('01-panel')
await p.getByRole('button', { name: 'Close' }).click()

// 3. First scene AI-worded (asked for during the route choice).
await p.waitForTimeout(2500)
await p.getByRole('radio', { name: /^Deep charge/ }).click()
await p.waitForTimeout(500)
log('goals heading:', await h1(), '| a label:', await p.getByText(/^AI: performance/).count())
await shot('02-goals-ai')

// 4. Goals and about: no "Tell Amp" on either.
await p.getByRole('button', { name: /^Performance/ }).click()
log('tell on goals:', await p.getByRole('button', { name: /Tell Amp/ }).count())
await next() // goals → about
log('about heading (AI-worded + reaction):', await h1(), '|', await p.locator('p').filter({ hasText: /Nice one/ }).count() ? 'reaction shown' : 'no reaction')
await p.getByRole('option', { name: '35–44' }).click()
await p.getByRole('radio', { name: 'Male', exact: true }).click()
await next()

// 5. Training leads with "Tell Amp": typed, filled in, and on to the next screen.
const lead = p.getByRole('button', { name: /Tell Amp/ }).first()
await p.waitForTimeout(800)
log('on:', await h1(), '| training lead card:', await lead.count(), '|', (await p.locator('[data-scene] button').first().textContent())?.slice(0, 80))
await shot('03-training-lead')
await lead.click()
await p.getByRole('textbox').fill('gym monday and thursday, football tuesdays')
const before = await h1()
await p.getByRole('button', { name: 'Send to Amp' }).click()
await p.getByText(/^Got it: /).waitFor({ timeout: 15000 })
log('typed, filled in:', await p.getByText(/^Got it: /).textContent())
await shot('04-tell-more')
// It moves on by itself only if that answered the whole question; the
// builder's week also asks how hard sessions feel, which the words didn't say.
const moved = await p.waitForFunction((was) => document.querySelector('h1')?.textContent !== was, before, { timeout: 4000 }).then(() => true, () => false)
if (moved) log('moved on by itself to:', await h1())
else {
  log('stayed, still to answer:', await p.getByRole('radiogroup', { name: /How hard/ }).count() ? 'how hard sessions feel' : 'something on screen')
  if (await p.getByRole('radio', { name: 'Steady' }).count()) await p.getByRole('radio', { name: 'Steady' }).click()
  await next()
}

// 6. Switched off for now (features.ts): voice, the tracker read, the shelf scan.
log('voice offered:', await p.getByRole('button', { name: /Hold to talk|Talk/ }).count(), '| tracker offered:', await p.getByRole('button', { name: 'Fill from my tracker' }).count())

// Through to the circuit check, as a 35-year-old; "What's this?" on sleep on the way.
for (let i = 0; i < 16; i++) {
  if (await p.getByRole('radio', { name: 'None of these' }).count()) break
  const whats = p.getByRole('button', { name: /What’s how you sleep/ })
  if (await whats.count()) {
    await whats.click()
    await p.getByRole('textbox').fill('does a nap count?')
    await p.getByRole('button', { name: 'Ask' }).click()
    await p.getByText(/From the approved text/).waitFor({ timeout: 15000 })
    log('what’s this follow-up answered')
    await shot('06-whats-this')
    await p.keyboard.press('Escape')
  }
  if (await p.getByRole('radio', { name: 'Steady' }).count()) await p.getByRole('radio', { name: 'Steady' }).click()
  if (await p.getByRole('radio', { name: /^Build muscle/ }).count()) await p.getByRole('radio', { name: /^Build muscle/ }).click()
  if (await p.getByRole('slider', { name: 'Afternoon energy' }).count()) await p.getByRole('slider', { name: 'Afternoon energy' }).press('End')
  if (await p.getByRole('radio', { name: 'OK', exact: true }).count()) await p.getByRole('radio', { name: 'OK', exact: true }).click()
  if (await p.getByRole('button', { name: 'None', exact: true }).count()) await p.getByRole('button', { name: 'None', exact: true }).click()
  if (await p.getByRole('radio', { name: /^3–5 days/ }).count()) await p.getByRole('radio', { name: /^3–5 days/ }).click()
  if (await p.getByRole('slider', { name: 'Daylight' }).count()) await p.getByRole('slider', { name: 'Daylight' }).press('End')
  if (await p.getByRole('button', { name: /^Eggs/ }).count()) await p.getByRole('button', { name: /^Eggs/ }).click()
  if (await p.getByRole('button', { name: 'Nothing yet' }).count()) {
    log('shelf scan offered:', await p.getByRole('button', { name: 'Scan my shelf instead' }).count())
    await p.getByRole('button', { name: 'Nothing yet' }).click()
  }
  await next().catch(() => {})
  await p.waitForTimeout(500)
}

// finish: circuit (the answer, then the consent under it) → review → analysis → handoff
await p.getByRole('radio', { name: 'None of these' }).click()
await p.getByRole('checkbox', { name: /^Use my answers here/ }).click()
await next()
await p.waitForTimeout(400)
log('review shows:', await h1())
await next()
await p.getByRole('button', { name: 'See my stacks' }).waitFor({ timeout: 20000 })
log('fully charged:', await h1())
await shot('08-charged')
await p.waitForTimeout(1500)

// 8. Pinpoint (plan v5 §7): worded questions, a hunch line, a bad day read into answers.
const pinpointReplies = []
p.on('response', async (r) => {
  if (!r.url().endsWith('/api/consult/pinpoint')) return
  try {
    const body = await r.json()
    pinpointReplies.push(Object.keys(body)[0])
  } catch {}
})
await p.goto(BASE + '/quizv2', { waitUntil: 'networkidle' })
await p.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
await p.goto(BASE + '/quizv2', { waitUntil: 'networkidle' })
await p.getByRole('radio', { name: /^Pinpoint/ }).click()
await p.getByRole('button', { name: /^Energy/ }).click()
await next()
await p.getByRole('option', { name: '35–44' }).click()
await p.getByRole('radio', { name: 'Male', exact: true }).click()
await next()
for (let i = 0; i < 30; i++) {
  if (await p.getByRole('button', { name: 'Or tell me about a bad day' }).count()) break
  const scene = await p.locator('[data-scene]').getAttribute('data-scene')
  if (['follow-move', 'follow-rest', 'follow-fuel'].includes(scene)) {
    await p.locator('[data-scene] [role="radio"]').first().click()
    await p.waitForTimeout(600)
    continue
  }
  if (await p.getByRole('button', { name: /^Monday:/ }).count()) {
    await p.getByRole('button', { name: /^Monday:/ }).click()
    await p.getByRole('group', { name: 'Monday: what you do' }).getByRole('button', { name: /^Gym/ }).click()
  }
  if (await p.getByRole('slider', { name: 'Afternoon energy' }).count()) await p.getByRole('slider', { name: 'Afternoon energy' }).press('Home')
  if (await p.getByRole('radio', { name: 'OK', exact: true }).count()) await p.getByRole('radio', { name: 'OK', exact: true }).click()
  if (await p.getByRole('button', { name: 'None', exact: true }).count()) await p.getByRole('button', { name: 'None', exact: true }).click()
  if (await p.getByRole('radio', { name: /^Rarely/ }).count()) await p.getByRole('radio', { name: /^Rarely/ }).click()
  if (await p.getByRole('button', { name: /^Eggs/ }).count()) await p.getByRole('button', { name: /^Eggs/ }).click()
  if (await p.getByRole('button', { name: 'Nothing yet' }).count()) await p.getByRole('button', { name: 'Nothing yet' }).click()
  await next().catch(() => {})
  await p.waitForTimeout(500)
}
await p.getByRole('button', { name: 'Or tell me about a bad day' }).click()
await p.getByRole('textbox').fill('dragging by 3pm, a couple of coffees to get through, then wide awake at midnight')
await p.getByRole('button', { name: 'Send to Amp' }).click()
await p.getByText(/^From what you told me/).waitFor({ timeout: 15000 })
log('bad day:', await p.getByText(/^From what you told me/).textContent())
await shot('10-pinpoint-told')
for (let i = 0; i < 14; i++) {
  await p.waitForTimeout(1800) // about a person's pace: the words are asked for ahead
  if (await p.getByRole('button', { name: 'Continue', exact: true }).count()) break
  const card = p.locator('[data-swipe-card] p').last()
  if (await card.count()) log('question card:', await card.textContent())
  if (await p.getByRole('button', { name: 'That’s me', exact: true }).count()) {
    log('hunch:', await h1(), '|', await p.locator('h1 ~ p, h1 + div p').first().textContent().catch(() => ''))
    await shot('11-pinpoint-hunch')
    await p.getByRole('button', { name: 'That’s me', exact: true }).click()
    continue
  }
  if (await p.getByRole('button', { name: 'Keep going' }).count()) { await p.getByRole('button', { name: 'Keep going' }).click(); continue }
  await p.locator('[data-scene] [role="radio"]').first().click()
  if (await p.getByRole('slider').count()) await p.locator('[data-scene] button', { hasText: /^Next$/ }).first().click()
  if (await p.getByRole('radio', { name: 'Yes', exact: true }).count()) await p.locator('[data-scene] button', { hasText: /^Next$/ }).first().click().catch(() => {})
}
await shot('12-pinpoint-found')
log('pinpoint replies:', pinpointReplies.reduce((m, k) => ({ ...m, [k]: (m[k] ?? 0) + 1 }), {}))

// 9. Hub: AI log and the saved consult.
await p.goto(BASE + '/founderhub/monitoring#consult', { waitUntil: 'networkidle' })
await p.getByText('Amp Consult: is the AI working?').waitFor({ timeout: 20000 })
const table = await p.locator('table').filter({ hasText: 'Feature' }).innerText()
log('hub AI table:\n' + table)
log('saved consults:', await p.getByText(/^c_[a-z0-9]+$/).count())
await p.getByText('Amp Consult: is the AI working?').scrollIntoViewIfNeeded()
await p.screenshot({ path: path.join(dir, '09-hub.png'), fullPage: true })
log('errors:', errs)
log('screenshots in', dir)
await b.close()
process.exit(errs.length ? 1 : 0)

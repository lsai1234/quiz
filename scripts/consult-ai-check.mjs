#!/usr/bin/env node
/**
 * Every AI feature of the Amp Consult, end to end, in a real browser.
 *
 * Drives /quizv2 as a founder: the Founder preview and its live AI test, AI
 * wording on the first scene, "Tell Amp more" typed and spoken, the tracker
 * read, "What's this?" follow-ups, the shelf scan, read aloud, a finished
 * consult, and the hub's AI log. Prints what each one did; exits non-zero on
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

// 4. Tell Amp more: typed.
await p.getByRole('button', { name: /^Performance/ }).click()
await p.getByRole('button', { name: /^Tell Amp more/ }).click()
await p.getByRole('textbox').fill('I have three coffees a day and sore knees')
await p.getByRole('button', { name: 'Send to Amp' }).click()
await p.getByText('Amp picked up').waitFor({ timeout: 15000 })
log('picked up:', await p.getByRole('dialog').locator('li span.flex-1').allInnerTexts())
await shot('03-tell-more')
await p.getByRole('button', { name: /^Add (all|it)$/ }).click()

// 5. Voice: hold the mic.
await p.getByRole('button', { name: /^Tell Amp more/ }).click()
const mic = p.getByRole('button', { name: /Hold to talk/ })
const box = await mic.boundingBox()
await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
await p.mouse.down()
await p.waitForTimeout(1500)
log('listening:', await p.getByRole('button', { name: /Listening/ }).count(), '| waveform bars:', await p.locator('[data-waveform] > span').count())
await shot('04-voice-listening')
await p.mouse.up()
await p.waitForFunction(() => document.querySelector('textarea')?.value.length > 0, null, { timeout: 15000 })
log('voice text in box:', await p.getByRole('textbox').inputValue())
await shot('05-voice-text')
await p.keyboard.press('Escape')

await next() // goals → about
log('about heading (AI-worded + reaction):', await h1(), '|', await p.locator('p').filter({ hasText: /Nice one/ }).count() ? 'reaction shown' : 'no reaction')
await p.getByRole('option', { name: '35–44' }).click()
await p.getByRole('radio', { name: 'Male', exact: true }).click()
await next()

// 6. Tracker read on training.
await p.getByRole('button', { name: 'Fill from my tracker' }).click()
await p.getByRole('button', { name: 'Whoop' }).click()
await p.getByRole('checkbox').click()
const [c1] = await Promise.all([p.waitForEvent('filechooser'), p.getByRole('button', { name: /Take or choose a photo/ }).click()])
await c1.setFiles(PHOTO)
await p.getByRole('button', { name: 'Use these' }).waitFor({ timeout: 20000 })
log('tracker cards:', await p.locator('li span.flex-1').allInnerTexts())
await p.getByRole('button', { name: 'Use these' }).click()
log('week now:', await p.getByText(/sessions ·/).textContent())
await p.getByRole('radio', { name: 'Steady' }).click()
await next()

// energy
await p.getByRole('slider').press('End')
await next()
// sleep: prefilled; What's this? follow-up
log('sleep bedtime prefilled:', await p.getByRole('slider', { name: 'Bedtime' }).getAttribute('aria-valuetext'))
await p.getByRole('button', { name: /What’s how you sleep/ }).click()
await p.getByRole('textbox').fill('does a nap count?')
await p.getByRole('button', { name: 'Ask' }).click()
await p.getByText(/From the approved text/).waitFor({ timeout: 15000 })
log('what’s this follow-up answered')
await shot('06-whats-this')
await p.getByRole('radio', { name: 'OK' }).click()
await next()

// through to the shelf
for (let i = 0; i < 6; i++) {
  if (await p.getByRole('button', { name: 'Scan my shelf instead' }).count()) break
  if (await p.getByRole('region', { name: 'Comfort mode' }).count()) await p.getByRole('button', { name: 'No thanks' }).click()
  if (await p.getByRole('button', { name: 'None', exact: true }).count()) await p.getByRole('button', { name: 'None', exact: true }).click()
  else if (await p.getByRole('radio', { name: 'Most days' }).count()) await p.getByRole('radio', { name: 'Most days' }).click()
  else if (await p.getByRole('slider', { name: 'Daylight' }).count()) await p.getByRole('slider', { name: 'Daylight' }).press('End')
  else if (await p.getByRole('button', { name: /^Eggs/ }).count()) await p.getByRole('button', { name: /^Eggs/ }).click()
  await next().catch(() => {})
  await p.waitForTimeout(400)
}

// 7. Shelf scan.
await p.getByRole('button', { name: 'Scan my shelf instead' }).click()
await p.getByRole('checkbox').click()
const [c2] = await Promise.all([p.waitForEvent('filechooser'), p.getByRole('button', { name: /Take or choose a photo/ }).click()])
await c2.setFiles(PHOTO)
await p.getByRole('button', { name: 'Use these' }).waitFor({ timeout: 20000 })
await shot('07-shelf-cards')
await p.getByRole('button', { name: 'Use these' }).click()
log('shelf pressed:', await p.locator('[aria-pressed="true"]').allInnerTexts())

// 8. Read aloud in comfort mode.
await p.getByRole('button', { name: 'Bigger text' }).click()
await p.waitForTimeout(500)
log('spoken on comfort:', await p.evaluate(() => window.__spoken.filter((t) => t.trim())))

// finish: review → circuit → analysis → handoff
await next()
await p.waitForTimeout(400)
await next()
await p.waitForTimeout(400)
await p.getByRole('checkbox').first().click()
await p.getByRole('switch', { name: 'None of these' }).click()
await next()
await p.getByRole('button', { name: 'See my stacks' }).waitFor({ timeout: 20000 })
log('fully charged:', await h1())
await shot('08-charged')
await p.waitForTimeout(1500)

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

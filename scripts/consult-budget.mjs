#!/usr/bin/env node
/**
 * The consult's first-scene budget (build U7): "loads fast on 4G".
 *
 *   npm run build && npx next start --port 3200 &
 *   node scripts/consult-budget.mjs [--url http://localhost:3200]
 *
 * Loads /consult in Chromium on a throttled mobile connection (Lighthouse's
 * "Slow 4G": 1.6Mbps down, 750Kbps up, 150ms round trip — the pessimistic end
 * of 4G) with a cold cache, and measures:
 *
 *   bytes   everything transferred until the first scene is usable
 *   js      the JavaScript part of that, compressed
 *   ready   navigation → the route choice on screen AND answering a tap
 *           (a hydrated page, not just painted HTML)
 *
 * Exits non-zero if any is over budget. Must run against a production build:
 * a dev server's bundles are unminified and several times the size.
 */

import { chromium } from 'playwright-core'
import { existsSync } from 'node:fs'

/**
 * About a quarter above what it measured when set (205KB, 448KB, 3.3s), so
 * growth is a decision, not a drift. The Rive runtime is not in here and must
 * never be: it loads after idle (see `ampRive.ts`).
 */
const BUDGET = {
  /** Compressed JS for the first scene. */
  js: 256 * 1024,
  /** Everything: HTML, CSS, JS, fonts, images. */
  bytes: 560 * 1024,
  /** Navigation to a usable first scene on Slow 4G with a 4× slower CPU. */
  readyMs: 4000,
}

const args = process.argv.slice(2)
const at = args.indexOf('--url')
const base = at >= 0 && args[at + 1] ? args[at + 1] : 'http://localhost:3200'
const executablePath = [process.env.CHROME_PATH, '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => p && existsSync(p))

const browser = await chromium.launch(executablePath ? { executablePath } : {})
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
const page = await context.newPage()
const cdp = await context.newCDPSession(page)
await cdp.send('Network.enable')
await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
await cdp.send('Network.emulateNetworkConditions', {
  offline: false,
  latency: 150,
  downloadThroughput: (1.6 * 1024 * 1024) / 8,
  uploadThroughput: (750 * 1024) / 8,
})
// Four times slower CPU: a mid-range phone, as Lighthouse assumes.
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })

const sizes = new Map()
const types = new Map()
cdp.on('Network.responseReceived', (e) => types.set(e.requestId, { type: e.type, url: e.response.url }))
cdp.on('Network.loadingFinished', (e) => sizes.set(e.requestId, e.encodedDataLength))

const t0 = Date.now()
await page.goto(`${base}/consult`, { waitUntil: 'commit' })
const choice = page.getByRole('radio', { name: /^Speed run/ })
await choice.waitFor({ state: 'visible', timeout: 60_000 })
// Usable means hydrated: a tap has to do something.
await page.waitForFunction(() => {
  const el = [...document.querySelectorAll('[role="radio"]')][0]
  return el && Object.keys(el).some((k) => k.startsWith('__reactFiber'))
}, null, { timeout: 60_000 })
const readyMs = Date.now() - t0
await page.waitForTimeout(500)

let bytes = 0
let js = 0
const scripts = []
for (const [id, size] of sizes) {
  bytes += size
  const t = types.get(id)
  if (t?.type === 'Script') {
    js += size
    scripts.push([size, t.url.replace(base, '')])
  }
}
await browser.close()

const kb = (n) => `${Math.round(n / 1024)}KB`
const rows = [
  ['js', js, BUDGET.js, kb],
  ['bytes', bytes, BUDGET.bytes, kb],
  ['ready', readyMs, BUDGET.readyMs, (n) => `${(n / 1000).toFixed(2)}s`],
]
let over = false
for (const [name, value, budget, fmt] of rows) {
  const ok = value <= budget
  over ||= !ok
  console.log(`${ok ? '✓' : '✗'} ${name.padEnd(6)} ${fmt(value).padStart(8)}   budget ${fmt(budget)}`)
}
if (process.env.VERBOSE) for (const [s, u] of scripts.sort((a, b) => b[0] - a[0])) console.log(`   ${kb(s).padStart(6)}  ${u}`)
process.exit(over ? 1 : 0)

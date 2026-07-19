import { chromium } from 'playwright-core'

const base = 'http://localhost:3113'
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const page = await browser.newPage({ viewport: { width: 420, height: 900 } })
const out = '/tmp/claude-0/-home-user-quiz/7382f1e8-12b4-5940-bc63-8c20064022f6/scratchpad'

// Shop — wait for the bundles rail to render from the client fetch
await page.goto(`${base}/shop`, { waitUntil: 'networkidle' })
await page.waitForSelector('#shop-cat-bundles', { timeout: 15000 })
const bundlesHeading = await page.locator('#shop-cat-bundles h2').first().innerText()
const cardCount = await page.locator('#shop-cat-bundles a[href^="/bundles/"]').count()
const firstHref = await page.locator('#shop-cat-bundles a[href^="/bundles/"]').first().getAttribute('href')
const navHasBundles = await page.locator('nav button', { hasText: 'Bundles' }).count()
await page.screenshot({ path: `${out}/shop-bundles.png` })
console.log(JSON.stringify({ bundlesHeading, cardCount, firstHref, navHasBundles }))

// Bundle landing page
await page.goto(`${base}/bundles/leg-day-loading`, { waitUntil: 'networkidle' })
await page.waitForSelector('text=Leg Day Loading', { timeout: 15000 })
const hasWorkout = await page.locator('text=Heavy Lower').count()
const hasReceipt = await page.locator('text=One-off bundle').count()
const hasSticky = await page.locator('text=Checkout →').count()
await page.screenshot({ path: `${out}/bundle-page.png`, fullPage: true })
console.log(JSON.stringify({ hasWorkout, hasReceipt, hasSticky }))

await browser.close()

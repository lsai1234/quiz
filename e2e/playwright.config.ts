import { defineConfig, devices } from '@playwright/test'
import { existsSync } from 'fs'

/**
 * End-to-end configuration — every product, every journey, no outside service.
 *
 * The suite drives a real Next.js server against the app's own mock modes, so a
 * run touches no third party: Stripe, PowerBody, OpenAI, Google and the email
 * provider are all switched off below rather than stubbed at the network edge.
 * `docs/E2E_AUTOMATED_PLAN.md` explains what each switch buys and which journeys
 * are consequently out of reach.
 *
 * Chromium comes from the image (`PLAYWRIGHT_BROWSERS_PATH`), which ships a
 * different build number than this Playwright expects, so the executable is
 * named explicitly rather than resolved. `CHROME_PATH` overrides it elsewhere.
 */
const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
].filter(Boolean) as string[]

const executablePath = CHROME_CANDIDATES.find((p) => existsSync(p))

const PORT = Number(process.env.E2E_PORT ?? 3114)
/**
 * `localhost`, not `127.0.0.1`. Next's dev server treats the numeric host as a
 * different origin from the one it bound to and refuses the client's own HMR
 * and RSC requests, so the page renders but never hydrates — every button is
 * inert and every spec fails on a screen that looks perfectly correct.
 */
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`

export default defineConfig({
  testDir: './specs',
  /* Compiles the API routes before the first spec needs one — see the file. */
  globalSetup: './support/warmup.ts',
  outputDir: './.artifacts',
  snapshotDir: './snapshots',
  /* A journey that has to log in, buy and then read the result is not fast.
     Generous per-test budget, hard cap on the whole run. */
  timeout: 90_000,
  expect: { timeout: 15_000 },
  globalTimeout: 30 * 60_000,
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never', outputFolder: './.report' }]]
    : [['list']],

  use: {
    baseURL,
    launchOptions: executablePath ? { executablePath } : {},
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    /* The product is mobile-first and its own README tells you to open it at
       360px+. Testing it at desktop width would exercise a layout most visitors
       never see. Desktop gets its own project below. */
    ...devices['Pixel 7'],
    isMobile: false, // keep a real mouse: hover states are part of the design
    hasTouch: true,
  },

  projects: [
    /* 390px is the logical width of the iPhone most people are holding, and it
       is where the hub's clipped status pills and half-cut calendar boxes showed
       up — 412px was wide enough to hide both. */
    { name: 'mobile', use: { viewport: { width: 390, height: 844 } } },
    {
      name: 'desktop',
      use: { viewport: { width: 1280, height: 900 }, hasTouch: false },
      /* The hubs are the desktop surfaces; the storefront is checked at both. */
      testMatch: /(founderhub|partner|formatting|visual)\.spec\.ts/,
    },
    {
      /* The floor the README promises — "open it on mobile or in DevTools mobile
         view (360px+)". Text that fits at 390 and not at 360 is a broken promise,
         so the formatting pass runs here too. Screenshots do not: three sets of
         baselines to review is how a visual suite stops being read. */
      name: 'narrow',
      use: { viewport: { width: 360, height: 780 } },
      testMatch: /formatting\.spec\.ts/,
    },
  ],

  webServer: {
    command: `node --max-old-space-size=4096 node_modules/next/dist/bin/next dev --port ${PORT}`,
    cwd: '..',
    url: baseURL,
    /* A fresh server per run, deliberately. Reusing one saves about five
       seconds and cost far more than that once: a dev server left wedged from
       an earlier run kept answering pages while 404ing every API route, and
       twelve specs failed for a reason that had nothing to do with them. Set
       E2E_REUSE_SERVER=1 while iterating on a single spec. */
    reuseExistingServer: !!process.env.E2E_REUSE_SERVER,
    timeout: 180_000,
    stdout: 'ignore',
    stderr: 'pipe',
    env: {
      /* ── Every outside integration, off ──────────────────────────────────
         Each of these is the app's own "no third party" setting, not a test
         double bolted on: the code path under test is the one that ships when
         a key is missing. */
      PAYMENTS_SOURCE: 'mock',          // no Stripe: #mock-checkout, order paid inline
      SUPPLIER_SOURCE: 'mock',          // no PowerBody SOAP calls
      SUPPLIER_ORDERING: 'simulate',    // nothing is ever sent to a supplier
      NEXT_PUBLIC_DATA_SOURCE: 'mock',  // the built-in sample catalogue
      NOTIFY_SOURCE: 'manual',          // email queues to the outbox, sends nothing
      NOTIFY_AUTO_SEND: 'false',
      OPENAI_API_KEY: '',               // identity/questions fall back to fixtures
      NEXT_PUBLIC_OPENAI_API_KEY: '',
      GOOGLE_SERVICE_ACCOUNT_EMAIL: '',
      GOOGLE_PRIVATE_KEY: '',
      GOOGLE_SHEET_ID: '',

      /* ── Known-good credentials the specs sign in with ─────────────────── */
      FOUNDER_1_EMAIL: 'founder@e2e.test',
      FOUNDER_1_PASSWORD: 'e2e-founder-pw',
      FOUNDER_1_NAME: 'E2E Founder',

      /* ── Isolation ──────────────────────────────────────────────────────
         A file of its own, wiped by `npm run e2e:reset`, so a run never reads
         or corrupts the development database at .data/chrgd.db. */
      DATABASE_PATH: '.data/e2e.db',
      NODE_ENV: 'development',

      /* In mock-payments mode a hub sign-in with no plan is handed the demo one,
         which is right for `npm run dev` and is what most specs exercise. The
         empty-hub screen is only reachable with the seeding off, so that variant
         is passed through rather than fixed: `HUB_DEMO_SUBSCRIPTION=off npm run
         e2e` runs it, and the specs that need it skip otherwise. */
      HUB_DEMO_SUBSCRIPTION: process.env.HUB_DEMO_SUBSCRIPTION ?? '',
    },
  },
})

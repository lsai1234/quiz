/**
 * An open test view (server-only): which switches a founder chose for their
 * test views, held against a random token in an httpOnly cookie. While it's
 * open, `getOfferSettings` answers with those switches for that browser only,
 * so a sample member's hub or a sample results page shows the parts being
 * tested whatever is live. The Founders Hub's own pages read the live
 * settings (`getLiveOfferSettings`) and never see this.
 */
import { randomBytes } from 'node:crypto'
import { kvDelete, kvGet, kvSet } from '@/lib/db/kv'
import type { OfferSettings, TrainerProfile } from '@/lib/offer/settings'
import { TEST_VIEW_COOKIE } from './domain'

export interface TestSwitches {
  training: boolean
  trainer: boolean
  deals: boolean
  checkIns: boolean
  /** The hub on sale on its own, with its saving on the results page. */
  hubOnSale: boolean
}

export const DEFAULT_TEST_SWITCHES: TestSwitches = { training: true, trainer: true, deals: true, checkIns: true, hubOnSale: true }

export interface TestView {
  v: 1
  token: string
  openedAt: string
  /** The founder who opened it. */
  by: string
  switches: TestSwitches
}

const key = (token: string) => `test-view:${token}`
const SHAPE = /^[A-Za-z0-9_-]{32}$/
/** A test view lasts a working day; opening another starts it again. */
export const TEST_VIEW_HOURS = 12

export function normaliseSwitches(raw: unknown): TestSwitches {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const on = (k: keyof TestSwitches) => (typeof r[k] === 'boolean' ? (r[k] as boolean) : DEFAULT_TEST_SWITCHES[k])
  return { training: on('training'), trainer: on('trainer'), deals: on('deals'), checkIns: on('checkIns'), hubOnSale: on('hubOnSale') }
}

export async function openTestView(by: string, switches: TestSwitches, token?: string | null, now = new Date()): Promise<TestView> {
  const view: TestView = { v: 1, token: token && SHAPE.test(token) ? token : randomBytes(24).toString('base64url'), openedAt: now.toISOString(), by: by.slice(0, 120), switches }
  await kvSet(key(view.token), view)
  return view
}

export async function getTestView(token: string | null | undefined, now = new Date()): Promise<TestView | null> {
  if (!token || !SHAPE.test(token)) return null
  const view = (await kvGet<TestView>(key(token))) ?? null
  if (!view || now.getTime() - Date.parse(view.openedAt) > TEST_VIEW_HOURS * 3_600_000) return null
  return view
}

export async function closeTestView(token: string | null | undefined): Promise<void> {
  if (token && SHAPE.test(token)) await kvDelete(key(token))
}

/** The open test view for this request, if any. Never throws: outside a request there is none. */
export async function currentTestView(): Promise<TestView | null> {
  try {
    const { cookies } = await import('next/headers')
    const jar = await cookies()
    return await getTestView(jar.get(TEST_VIEW_COOKIE)?.value)
  } catch {
    return null
  }
}

/** A trainer to show when the live one isn't set up yet: clearly a sample. */
export const SAMPLE_TRAINER: Pick<TrainerProfile, 'name' | 'role' | 'bio' | 'replyHours'> = {
  name: 'Sam',
  role: 'Personal trainer (sample profile)',
  bio: 'A sample profile for test views. Set the real one in Founders Hub → Trainer.',
  replyHours: 24,
}

/** The settings as a test view sees them. Pure. */
export function withTestSwitches(settings: OfferSettings, s: TestSwitches): OfferSettings {
  const named = settings.trainer.name.trim().length > 0
  return {
    ...settings,
    services: { ...settings.services, training: s.training, trainer: s.trainer, deals: s.deals, checkIns: s.checkIns },
    trainer: s.trainer && !named ? { ...settings.trainer, ...SAMPLE_TRAINER } : settings.trainer,
    hubPrice: { ...settings.hubPrice, standalone: s.hubOnSale, monthly: settings.hubPrice.monthly > 0 ? settings.hubPrice.monthly : 10 },
  }
}

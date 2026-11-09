/**
 * The offer's hub settings: the hero list and the free bonus (Amp Consult and
 * offer plan, Phase 2). Pure and client-safe; `store.ts` keeps them.
 *
 *   Hero products   One less obvious product per person, the core offer. A
 *                   product becomes a hero only once a founder has recorded
 *                   its checks: legal to sell in GB (novel food status
 *                   included), safety and contraindications reviewed, the
 *                   wording it may carry (a register claim, or none), and
 *                   who checked it and when. A hero with any check missing
 *                   has no effect.
 *   Free bonus      A free product with the stack, picked per person (Phase 3)
 *                   from a pool the founders manage.
 *
 * Both switches are OFF by default, and nothing reads the lists until Phase 3
 * wires the selection. Even then, a switch on with no approved hero or an
 * empty pool changes nothing: `activeHeroIds` and `activeBonusPool` are empty,
 * and empty means "today's offer".
 */

import type { CatalogueProduct, SwapGroup } from '@/lib/catalogue/types'
import { CLAIMS, CLAIMS_BY_KIND } from '@/lib/consult/claims'
import type { StackLevel } from '@/lib/types'

/* ── Hero approval ──────────────────────────────────────────────────────── */

/**
 * GB novel food status, as the founder recorded it. Only `not-novel` (on sale
 * in the UK before 15 May 1997, or not a food ingredient that needs one) and
 * `authorised` (on the GB novel foods register) can be sold.
 */
export type NovelFoodStatus = 'not-novel' | 'authorised' | 'unauthorised' | 'unknown'
export const SELLABLE_NOVEL_FOOD: readonly NovelFoodStatus[] = ['not-novel', 'authorised']

export interface HeroApproval {
  productId: string
  /** The founder's "Hero" setting. Takes effect only with every check complete. */
  hero: boolean
  /** Legal to sell in GB. */
  legalGB: boolean
  novelFood: NovelFoodStatus
  /** Safety and contraindications reviewed. */
  safetyReviewed: boolean
  /** What was looked at, for the record. */
  safetyNotes: string
  /**
   * The wording it may carry: a register claim id from `CLAIMS_BY_KIND` for its
   * kind, `'none'` for no claim, or null while undecided.
   */
  claimId: string | null
  /** Who did the checks, by name. */
  checkedBy: string
  /** When, as YYYY-MM-DD. */
  checkedAt: string | null
  /** The founder account that last saved this, and when (ISO). Audit only. */
  updatedBy: string | null
  updatedAt: string | null
}

export function emptyHeroApproval(productId: string): HeroApproval {
  return {
    productId,
    hero: false,
    legalGB: false,
    novelFood: 'unknown',
    safetyReviewed: false,
    safetyNotes: '',
    claimId: null,
    checkedBy: '',
    checkedAt: null,
    updatedBy: null,
    updatedAt: null,
  }
}

/** The claims a product of this kind may carry, verbatim from the register (`claims.ts`). */
export function claimChoicesFor(swapGroup: SwapGroup | string | null | undefined): { id: string; wording: string }[] {
  const ids = (swapGroup && CLAIMS_BY_KIND[swapGroup as SwapGroup]) || []
  return ids.filter((id) => CLAIMS[id]).map((id) => ({ id, wording: CLAIMS[id].wording }))
}

export type HeroCheck = 'hero' | 'legal' | 'novel-food' | 'safety' | 'wording' | 'checked-by' | 'checked-at' | 'product'

export const HERO_CHECK_LABEL: Record<HeroCheck, string> = {
  hero: 'Hero switched on for this product',
  legal: 'Legal to sell in GB',
  'novel-food': 'Novel food status: not novel, or authorised',
  safety: 'Safety and contraindications reviewed',
  wording: 'Wording approved: a claim for its kind, or none',
  'checked-by': 'Checked by',
  'checked-at': 'Date checked',
  product: 'On sale in the catalogue',
}

const DATE = /^\d{4}-\d{2}-\d{2}$/

function validDate(value: string | null, today: string): boolean {
  if (!value || !DATE.test(value) || Number.isNaN(Date.parse(value))) return false
  return value <= today
}

/**
 * Every check this approval is still missing. Empty means it takes effect.
 *
 * `product` is the catalogue entry, when it is there: the wording check is
 * against ITS kind, so a product moved to another kind loses a claim its new
 * kind can't carry, and a product that has left the catalogue is no hero.
 */
export function missingHeroChecks(
  approval: HeroApproval,
  product: Pick<CatalogueProduct, 'swapGroup'> | null | undefined,
  today = new Date().toISOString().slice(0, 10),
): HeroCheck[] {
  const missing: HeroCheck[] = []
  if (!approval.hero) missing.push('hero')
  if (!approval.legalGB) missing.push('legal')
  if (!SELLABLE_NOVEL_FOOD.includes(approval.novelFood)) missing.push('novel-food')
  if (!approval.safetyReviewed) missing.push('safety')
  const claims = claimChoicesFor(product?.swapGroup)
  if (approval.claimId === null || (approval.claimId !== 'none' && !claims.some((c) => c.id === approval.claimId))) {
    missing.push('wording')
  }
  if (!approval.checkedBy.trim()) missing.push('checked-by')
  if (!validDate(approval.checkedAt, today)) missing.push('checked-at')
  if (!product) missing.push('product')
  return missing
}

export type HeroStatus = 'approved' | 'incomplete' | 'off'

/** How a product stands as a hero: on and complete, on but missing something, or not switched on. */
export function heroStatus(
  approval: HeroApproval | undefined,
  product: Pick<CatalogueProduct, 'swapGroup'> | null | undefined,
  today?: string,
): HeroStatus {
  if (!approval?.hero) return 'off'
  return missingHeroChecks(approval, product, today).length === 0 ? 'approved' : 'incomplete'
}

/* ── Free bonus ─────────────────────────────────────────────────────────── */

/** How the bonus and a discount code combine. The plan's default: whichever is worth more. */
export type BonusCodeRule = 'better-of' | 'code-cancels-bonus'

export interface BonusSettings {
  enabled: boolean
  /** Product ids founders have added. Order is display order only. */
  pool: string[]
  /** Least stack subtotal, before any discount (£), for the bonus to be offered. */
  minSubtotal: number
  /** Least the order may keep after every cost, bonus included (£). */
  floorPounds: number
  /** And at least this share of net revenue (0–1). */
  floorPct: number
  /** First order only (one per customer). */
  firstOrderOnly: boolean
  /** Which stack depths qualify. Stacks only: never the hero on its own. */
  tiers: StackLevel[]
  codes: BonusCodeRule
}

export const STACK_LEVELS: readonly StackLevel[] = ['essentials', 'performance', 'complete']

/**
 * Defaults. Minimum and floor are placeholders until the founders pick from
 * the economics on the Offer screen, which proposes figures from the live
 * catalogue; the bonus stays off whatever these say.
 */
export const DEFAULT_BONUS: BonusSettings = {
  enabled: false,
  pool: [],
  minSubtotal: 60,
  floorPounds: 8,
  floorPct: 0.15,
  firstOrderOnly: true,
  tiers: [...STACK_LEVELS],
  codes: 'better-of',
}

/* ── The whole document ─────────────────────────────────────────────────── */

/**
 * Settings → Offer → "Box services" (Option 1): what a box comes with beyond its
 * products. Check-ins run for every box unless switched off. The first-box
 * guarantee is a promise about money, so it is off until the founders agree
 * its terms (`/legal/guarantee`). Off, nothing anywhere mentions it.
 */
export interface ServiceSettings {
  checkIns: boolean
  guarantee: boolean
  /**
   * The training plan in the hub. Off until a qualified coach has reviewed the
   * exercise library (`lib/training/library`); off, nothing mentions it.
   */
  training: boolean
  /**
   * Member deals in the hub (`lib/deals`): a profit-floored price on each
   * product they've bought, opening as it's due to run out. Off until the
   * founders turn it on; off, nothing mentions it.
   */
  deals: boolean
  /**
   * Ask your trainer (`lib/trainer`): members message a real person, one of
   * the founders, about their training, and get an answer in the hub. Off
   * until it's on here and the trainer's profile has a name.
   */
  trainer: boolean
}

export const DEFAULT_SERVICES: ServiceSettings = { checkIns: true, guarantee: false, training: false, deals: false, trainer: false }

export function normaliseServices(raw: unknown): ServiceSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof ServiceSettings, unknown>>
  return {
    checkIns: r.checkIns !== false,
    guarantee: r.guarantee === true,
    training: r.training === true,
    deals: r.deals === true,
    trainer: r.trainer === true,
  }
}

/**
 * Settings → Member hub → "Your trainer": the real person members can ask.
 * Everything but `notifyEmail` is shown to customers.
 */
export interface TrainerProfile {
  /** Their name as members see it ("Sam", say). Empty: nobody is named, and the trainer stays off. */
  name: string
  /** One line under the name ("Co-founder · personal trainer"). */
  role: string
  /** A few lines in their own words: who they are and how they train. */
  bio: string
  /** A photo of them: an https link or a path on this site. Null shows their initial. */
  photoUrl: string | null
  /** How soon they promise an answer, in hours. */
  replyHours: number
  /** Questions a member can send in a day. */
  dailyLimit: number
  /** Where "a new question" emails go. Private: never sent to the browser. */
  notifyEmail: string | null
  /** They check every new or rebuilt training plan (Founders Hub → Trainer → Plans to check). */
  checksPlans: boolean
}

export const DEFAULT_TRAINER: TrainerProfile = { name: '', role: 'Personal trainer', bio: '', photoUrl: null, replyHours: 48, dailyLimit: 5, notifyEmail: null, checksPlans: true }

const text = (v: unknown, max: number, fallback: string) => (typeof v === 'string' ? v.trim().slice(0, max) : fallback)

export function normaliseTrainer(raw: unknown): TrainerProfile {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof TrainerProfile, unknown>>
  const photo = typeof r.photoUrl === 'string' ? r.photoUrl.trim() : ''
  const email = typeof r.notifyEmail === 'string' ? r.notifyEmail.trim().toLowerCase() : ''
  return {
    name: text(r.name, 40, DEFAULT_TRAINER.name),
    role: text(r.role, 60, DEFAULT_TRAINER.role) || DEFAULT_TRAINER.role,
    bio: text(r.bio, 600, DEFAULT_TRAINER.bio),
    photoUrl: /^https:\/\/[^\s]+$/.test(photo) || /^\/[\w\-./]+$/.test(photo) ? photo.slice(0, 500) : null,
    replyHours: Math.round(num(r.replyHours, DEFAULT_TRAINER.replyHours, 1, 168)),
    dailyLimit: Math.round(num(r.dailyLimit, DEFAULT_TRAINER.dailyLimit, 1, 50)),
    notifyEmail: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email.slice(0, 200) : null,
    checksPlans: r.checksPlans !== false,
  }
}

/**
 * Settings → Member hub → "The hub on its own": what the hub costs without an
 * order, so the 90 days an order brings can be shown as a saving. A saving
 * against a price nobody can pay is a misleading price, so it shows only
 * while `standalone` is on: the hub genuinely on sale on its own at `monthly`.
 */
export interface HubPriceSettings {
  /** £ a month, on its own. */
  monthly: number
  /** On sale on its own at that price. Off: no value or saving is shown anywhere. */
  standalone: boolean
}

export const DEFAULT_HUB_PRICE: HubPriceSettings = { monthly: 10, standalone: false }

export function normaliseHubPrice(raw: unknown): HubPriceSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof HubPriceSettings, unknown>>
  return { monthly: Math.round(num(r.monthly, DEFAULT_HUB_PRICE.monthly, 0, 100) * 100) / 100, standalone: r.standalone === true }
}

/** What 90 days of the hub costs on its own (£), or null while it isn't on sale on its own. */
export function hubValue(settings: Pick<OfferSettings, 'hubPrice' | 'services' | 'trainer'>): number | null {
  return hubOnSale(settings) ? Math.round(settings.hubPrice.monthly * 3 * 100) / 100 : null
}

/**
 * The hub can be bought on its own (`lib/hub-plan`): switched on, priced, and
 * with something in it to sell — the training plan or the trainer. The same
 * test decides whether the results page may show the hub as a saving, so a
 * saving never stands against a price nobody can pay.
 */
export function hubOnSale(settings: Pick<OfferSettings, 'hubPrice' | 'services' | 'trainer'>): boolean {
  const p = settings.hubPrice
  return p.standalone && p.monthly > 0 && (settings.services.training || trainerLive(settings))
}

/** The trainer is live: switched on, and someone is named. */
export function trainerLive(settings: Pick<OfferSettings, 'services' | 'trainer'>): boolean {
  return settings.services.trainer && settings.trainer.name.trim().length > 0
}

/** Every new or rebuilt training plan waits for the trainer's check: the trainer is live, checks are on, and so is the plan. */
export function trainerChecksPlans(settings: Pick<OfferSettings, 'services' | 'trainer'>): boolean {
  return trainerLive(settings) && settings.trainer.checksPlans && settings.services.training
}

/**
 * Settings → Offer → "Member deals" (`lib/deals`): how big a member's deal on
 * each kind of product may be, and when a top-up box ships free. A size is a
 * ceiling, never a promise: each deal is the deepest whole percent up to it
 * that still keeps the margin floor (Pricing → Last-chance offer).
 */
export interface MemberDealSettings {
  /** The deepest percent off for a kind with no size of its own (0–1). */
  defaultPct: number
  /** Sizes by product kind (0–1). */
  pct: Partial<Record<SwapGroup, number>>
  /** A top-up box ships free to the UK mainland at or over this (£, inc VAT). */
  topUpFreeOver: number
}

export const DEFAULT_MEMBER_DEALS: MemberDealSettings = { defaultPct: 0.15, pct: {}, topUpFreeOver: 40 }

export function normaliseMemberDeals(raw: unknown): MemberDealSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof MemberDealSettings, unknown>>
  const pct: Partial<Record<SwapGroup, number>> = {}
  if (r.pct && typeof r.pct === 'object') {
    for (const [k, v] of Object.entries(r.pct as Record<string, unknown>)) {
      if (typeof v === 'number' && Number.isFinite(v)) pct[k as SwapGroup] = Math.min(0.5, Math.max(0, v))
    }
  }
  return {
    defaultPct: num(r.defaultPct, DEFAULT_MEMBER_DEALS.defaultPct, 0, 0.5),
    pct,
    topUpFreeOver: num(r.topUpFreeOver, DEFAULT_MEMBER_DEALS.topUpFreeOver, 0, 500),
  }
}

export interface OfferSettings {
  /** Settings → Offer → "Hero products". Off: the core offer is today's top pick. */
  heroEnabled: boolean
  heroes: Record<string, HeroApproval>
  bonus: BonusSettings
  services: ServiceSettings
  memberDeals: MemberDealSettings
  /** Ask your trainer: who they are. */
  trainer: TrainerProfile
  /** The hub's price on its own, for its value on the box. */
  hubPrice: HubPriceSettings
}

export const DEFAULT_OFFER: OfferSettings = { heroEnabled: false, heroes: {}, bonus: DEFAULT_BONUS, services: DEFAULT_SERVICES, memberDeals: DEFAULT_MEMBER_DEALS, trainer: DEFAULT_TRAINER, hubPrice: DEFAULT_HUB_PRICE }

const NOVEL: readonly NovelFoodStatus[] = ['not-novel', 'authorised', 'unauthorised', 'unknown']
const num = (v: unknown, fallback: number, min = 0, max = Number.POSITIVE_INFINITY) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback
const str = (v: unknown, max = 500) => (typeof v === 'string' ? v.slice(0, max) : '')

export function normaliseHeroApproval(productId: string, raw: unknown): HeroApproval {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<HeroApproval>
  return {
    productId,
    hero: r.hero === true,
    legalGB: r.legalGB === true,
    novelFood: NOVEL.includes(r.novelFood as NovelFoodStatus) ? (r.novelFood as NovelFoodStatus) : 'unknown',
    safetyReviewed: r.safetyReviewed === true,
    safetyNotes: str(r.safetyNotes, 2000),
    claimId: typeof r.claimId === 'string' && r.claimId ? r.claimId.slice(0, 80) : null,
    checkedBy: str(r.checkedBy, 120),
    checkedAt: typeof r.checkedAt === 'string' && DATE.test(r.checkedAt) ? r.checkedAt : null,
    updatedBy: typeof r.updatedBy === 'string' ? r.updatedBy.slice(0, 200) : null,
    updatedAt: typeof r.updatedAt === 'string' ? r.updatedAt.slice(0, 40) : null,
  }
}

export function normaliseBonus(raw: unknown): BonusSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<BonusSettings>
  const pool = Array.isArray(r.pool) ? [...new Set(r.pool.filter((id): id is string => typeof id === 'string' && id.length > 0 && id.length <= 200))] : []
  const tiers = Array.isArray(r.tiers) ? STACK_LEVELS.filter((t) => (r.tiers as unknown[]).includes(t)) : DEFAULT_BONUS.tiers
  return {
    enabled: r.enabled === true,
    pool,
    minSubtotal: num(r.minSubtotal, DEFAULT_BONUS.minSubtotal, 0, 10_000),
    floorPounds: num(r.floorPounds, DEFAULT_BONUS.floorPounds, 0, 1_000),
    floorPct: num(r.floorPct, DEFAULT_BONUS.floorPct, 0, 1),
    firstOrderOnly: typeof r.firstOrderOnly === 'boolean' ? r.firstOrderOnly : DEFAULT_BONUS.firstOrderOnly,
    tiers: [...tiers],
    codes: r.codes === 'code-cancels-bonus' ? 'code-cancels-bonus' : 'better-of',
  }
}

export function normaliseOffer(raw: unknown): OfferSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<OfferSettings>
  const heroes: Record<string, HeroApproval> = {}
  if (r.heroes && typeof r.heroes === 'object') {
    for (const [id, a] of Object.entries(r.heroes)) heroes[id] = normaliseHeroApproval(id, a)
  }
  return { heroEnabled: r.heroEnabled === true, heroes, bonus: normaliseBonus(r.bonus), services: normaliseServices(r.services), memberDeals: normaliseMemberDeals(r.memberDeals), trainer: normaliseTrainer(r.trainer), hubPrice: normaliseHubPrice(r.hubPrice) }
}

/* ── What Phase 3 reads ─────────────────────────────────────────────────── */

/**
 * The heroes the selection may choose from: none while the switch is off, and
 * only approvals with every check complete, against the live catalogue.
 */
export function activeHeroIds(settings: OfferSettings, catalogue: readonly Pick<CatalogueProduct, 'id' | 'swapGroup'>[], today?: string): string[] {
  if (!settings.heroEnabled) return []
  const byId = new Map(catalogue.map((p) => [p.id, p]))
  return Object.values(settings.heroes)
    .filter((a) => heroStatus(a, byId.get(a.productId), today) === 'approved')
    .map((a) => a.productId)
    .sort()
}

/** The bonus pool the selection may choose from: none while the switch is off, and only products still in the catalogue. */
export function activeBonusPool(settings: OfferSettings, catalogue: readonly Pick<CatalogueProduct, 'id'>[]): string[] {
  if (!settings.bonus.enabled) return []
  const ids = new Set(catalogue.map((p) => p.id))
  return settings.bonus.pool.filter((id) => ids.has(id))
}

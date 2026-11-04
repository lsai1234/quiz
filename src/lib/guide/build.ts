/**
 * The stack guide (every order, one-off and subscription): their products on
 * their day, how much, what the approved science says, and how to keep it safe.
 *
 * Built on the server from the order's own lines and the catalogue, never from
 * anything the browser wrote: the only thing the checkout adds is the seed (their
 * day, their goals, a first name), and each part of it is checked here
 * (`normaliseGuideSeed`). The words are `./copy`; the claims are the register's
 * (`CLAIMS`), picked by the same map the results page uses (`productClaim`,
 * then the rest of the kind's own). Pure.
 */
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { Goal } from '@/lib/types'
import { ALL_GOALS } from '@/lib/types'
import { shortNameOf } from '@/lib/catalogue/short-name'
import { productTypeLabel } from '@/lib/catalogue/product-type'
import { CLAIMS, claimsFor, type Claim } from '@/lib/consult/claims'
import { productClaim } from '@/lib/results/goal-claims'
import { normaliseDay, routineFor, type Routine, type RoutineDay } from '@/lib/routine'
import { spokenClock } from '@/lib/routine/ring'
import { USAGE_SERVINGS_PER_OCCASION, type UsageLevel } from '@/lib/stack-blueprint/pricing'

/** What the checkout carries for the guide. Checked before use. */
export interface GuideSeed {
  day: RoutineDay
  goals: Goal[]
  firstName: string | null
  stackName: string | null
}

export interface GuideProduct {
  id: string
  title: string
  short: string
  type: string
  imageUrl: string | null
  /** "7am", or null for a moment with no time of its own. */
  time: string | null
  moment: string
  daysLabel: string
  amount: string
  /** The key actives per serving, from the catalogue ("Creatine 5 g"); null when it holds none. */
  serving: string | null
  /** Register claims, verbatim, at most two. */
  claims: Claim[]
  /** The label's warnings, verbatim. */
  warnings: string[]
}

export interface StackGuide {
  v: 1
  token: string
  createdAt: string
  plan: 'oneoff' | 'subscription'
  firstName: string | null
  stackName: string | null
  routine: Routine
  products: GuideProduct[]
  /** What the box comes with (Option 1), as said on the results page. */
  services: string[]
  /** When Amp first checks in (Option 2), ISO date. */
  checkInOn: string
}

export interface GuideLine {
  productId: string
  usage?: UsageLevel | null
}

const MAX_PRODUCTS = 16
const CHECK_IN_DAYS = 14

/** Keep the checkout's seed to what the guide may use. */
export function normaliseGuideSeed(raw: unknown): GuideSeed {
  const s = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const text = (v: unknown, max: number) => {
    if (typeof v !== 'string') return null
    const t = v.replace(/[\u0000-\u001f<>]/g, '').trim()
    return t ? t.slice(0, max) : null
  }
  const first = text(s.firstName, 40)?.split(/\s+/)[0] ?? null
  return {
    day: normaliseDay(s.day),
    goals: Array.isArray(s.goals) ? s.goals.filter((g): g is Goal => (ALL_GOALS as readonly string[]).includes(g as string)).slice(0, 6) : [],
    firstName: first ? first.charAt(0).toUpperCase() + first.slice(1) : null,
    stackName: text(s.stackName, 60),
  }
}

/** The key actives per serving, as the catalogue holds them: "Creatine 5 g · Taurine 1 g". */
export function servingOf(product: Pick<CatalogueProduct, 'actives'>): string | null {
  const actives = (product.actives ?? []).filter((a) => typeof a.mg === 'number' && a.mg > 0).slice(0, 3)
  if (!actives.length) return null
  return actives
    .map((a) => `${a.name} ${a.mg! >= 1000 ? `${Math.round(a.mg! / 100) / 10} g` : `${a.mg} mg`}`)
    .join(' · ')
}

/** At most two register claims: the goal's own first, then the kind's. */
export function guideClaims(product: Pick<CatalogueProduct, 'swapGroup'>, goals: readonly Goal[]): Claim[] {
  const first = productClaim(product, goals)
  const rest = claimsFor(product.swapGroup).map((id) => CLAIMS[id]).filter((c): c is Claim => Boolean(c) && c.id !== first?.id)
  return [...(first ? [first] : []), ...rest].slice(0, 2)
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export function buildGuide(input: {
  token: string
  now: string
  plan: 'oneoff' | 'subscription'
  lines: readonly GuideLine[]
  seed: GuideSeed
  catalogue: readonly CatalogueProduct[]
  services?: string[]
}): StackGuide {
  const byId = new Map(input.catalogue.map((p) => [p.id, p]))
  const seen = new Set<string>()
  const picked: { product: CatalogueProduct; usage: UsageLevel | null }[] = []
  for (const line of input.lines) {
    const product = byId.get(line.productId)
    if (!product || seen.has(product.id) || picked.length >= MAX_PRODUCTS) continue
    seen.add(product.id)
    picked.push({ product, usage: line.usage ?? null })
  }
  const servings = Object.fromEntries(picked.map(({ product, usage }) => [product.id, usage ? USAGE_SERVINGS_PER_OCCASION[usage] ?? 1 : 1]))
  const routine = routineFor(picked.map((p) => p.product), input.seed.day, servings)
  const products: GuideProduct[] = picked.map(({ product }) => {
    const item = routine.items.find((i) => i.productId === product.id)!
    return {
      id: product.id,
      title: product.title,
      short: shortNameOf(product),
      type: productTypeLabel(product),
      imageUrl: product.imageUrl ?? null,
      time: item.minutes === null ? null : spokenClock(item.minutes),
      moment: item.moment,
      daysLabel: item.daysLabel,
      amount: item.amount,
      serving: servingOf(product),
      claims: guideClaims(product, input.seed.goals),
      warnings: (product.warnings ?? []).filter((w) => typeof w === 'string' && w.trim()).slice(0, 4),
    }
  })
  return {
    v: 1,
    token: input.token,
    createdAt: input.now,
    plan: input.plan,
    firstName: input.seed.firstName,
    stackName: input.seed.stackName,
    routine,
    products,
    services: input.services ?? [],
    checkInOn: addDays(input.now, CHECK_IN_DAYS),
  }
}

/** "Wednesday 18 November", for the check-in line. */
export function longDate(iso: string): string {
  return new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/London' })
}

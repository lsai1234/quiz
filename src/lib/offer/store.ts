/**
 * Where the offer's hub settings are kept: one document, kv `portal:offer`,
 * beside the other portal documents and through the same conflict-safe write
 * (`mutateJson`), so two founders saving at once never drop each other's edit.
 *
 * Its own document rather than a field on the product records or on
 * `portal:settings`: the hero checks are an audited approval that has to
 * outlive a product being re-imported or re-priced, and the bonus pool is a
 * list of product ids, not a property of any one product. No schema change:
 * a kv row like every other setting.
 *
 * Server-only.
 */
import { mutateJson, readJson, withResult } from '@/lib/portal/persist'
import {
  DEFAULT_OFFER,
  normaliseBonus,
  normaliseHeroApproval,
  normaliseOffer,
  type BonusSettings,
  type HeroApproval,
  type OfferSettings,
} from './settings'

const FILE = 'offer'

/** For reading: never throws; an unreadable document reads as the defaults (everything off). */
export async function getOfferSettings(): Promise<OfferSettings> {
  return normaliseOffer(await readJson<unknown>(FILE, DEFAULT_OFFER))
}

async function mutate<R>(change: (state: OfferSettings) => R): Promise<R> {
  return mutateJson<unknown, R>(FILE, DEFAULT_OFFER, (stored) => {
    const state = normaliseOffer(stored)
    return withResult(state, change(state))
  })
}

export async function setHeroEnabled(on: boolean): Promise<OfferSettings> {
  return mutate((state) => {
    state.heroEnabled = on
    return state
  })
}

/**
 * Save one product's hero checks. The audit fields are stamped here, from the
 * signed-in founder, never taken from the browser.
 */
export async function saveHeroApproval(
  productId: string,
  patch: Partial<HeroApproval>,
  by: string,
  now = new Date(),
): Promise<HeroApproval> {
  return mutate((state) => {
    const current = state.heroes[productId]
    const next = normaliseHeroApproval(productId, { ...current, ...patch, updatedBy: by, updatedAt: now.toISOString() })
    state.heroes[productId] = next
    return next
  })
}

export async function saveBonusSettings(patch: Partial<BonusSettings>): Promise<OfferSettings> {
  return mutate((state) => {
    state.bonus = normaliseBonus({ ...state.bonus, ...patch })
    return state
  })
}

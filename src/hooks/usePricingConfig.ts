'use client'

import { useEffect, useState } from 'react'
import { getPricingConfig, type PricingConfig } from '@/lib/stack-blueprint/pricing'
import { PRICING_SYNCED_EVENT } from '@/lib/pricing/sync-event'

/**
 * The pricing config as the Founders Hub has it, re-read once the founders'
 * settings reach the browser (`PortalSync`).
 *
 * For figures a page promises, like "save up to 20%": read at render from
 * `PRICING_CONFIG`, the static defaults, they said what the code shipped with
 * rather than what the founders had set.
 */
export function usePricingConfig(): PricingConfig {
  const [config, setConfig] = useState<PricingConfig>(() => getPricingConfig())
  useEffect(() => {
    const read = () => setConfig(getPricingConfig())
    read()
    window.addEventListener(PRICING_SYNCED_EVENT, read)
    return () => window.removeEventListener(PRICING_SYNCED_EVENT, read)
  }, [])
  return config
}

/** The deepest plan saving on offer: the best bundle level's rate, as a whole percent. */
export function bestPlanSavingPct(config: PricingConfig): number {
  const rates = [config.subscriptionDiscount, ...Object.values(config.levelSubscriptionDiscount ?? {})]
  return Math.round(Math.max(0, ...rates.filter((r) => Number.isFinite(r))) * 100)
}

'use client'

import { useEffect, useState } from 'react'
import type { ResolvedBundle } from '@/lib/bundles/resolve'
import type { BundlePriceSummary } from '@/lib/bundles/pricing'

export interface ShopBundleView {
  bundle: ResolvedBundle
  price: BundlePriceSummary
}

interface UseShopBundlesReturn {
  bundles: ShopBundleView[]
  isLoading: boolean
  error: string | null
}

/**
 * Fetch the published, sellable bundles for the shop row. Priced live on the
 * server, ordered by displayOrder. Fetches once per mount of the shop.
 */
export function useShopBundles(): UseShopBundlesReturn {
  const [bundles, setBundles] = useState<ShopBundleView[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/bundles')
      .then((r) => r.json())
      .then((data: { bundles?: ShopBundleView[] }) => {
        if (cancelled) return
        if (Array.isArray(data.bundles)) setBundles(data.bundles)
      })
      .catch((err: Error) => {
        if (cancelled) return
        console.error('[useShopBundles]', err)
        setError(err.message)
      })
      .finally(() => { if (!cancelled) setIsLoading(false) })
    return () => { cancelled = true }
  }, [])

  return { bundles, isLoading, error }
}

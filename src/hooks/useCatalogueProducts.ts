'use client'

import { useEffect, useState } from 'react'
import { useQuizStore } from '@/lib/store'
import type { CatalogueProduct } from '@/lib/catalogue/types'

// Module-level guard — fetch /api/catalogue at most once per session.
let fetchStarted = false

/** Force a re-fetch (e.g. after the portal flips the data source). */
export function invalidateCatalogue(): void {
  fetchStarted = false
  try {
    useQuizStore.getState().setCatalogueProducts([])
  } catch {
    /* ignore */
  }
}

interface UseCatalogueProductsReturn {
  products: CatalogueProduct[]
  isLoading: boolean
  isLive: boolean
  error: string | null
}

export function useCatalogueProducts(): UseCatalogueProductsReturn {
  const catalogueProducts = useQuizStore((s) => s.catalogueProducts)
  const setCatalogueProducts = useQuizStore((s) => s.setCatalogueProducts)
  const [isLoading, setIsLoading] = useState(!fetchStarted)
  const [isLive, setIsLive] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (fetchStarted) {
      setIsLoading(false)
      return
    }
    fetchStarted = true

    fetch('/api/catalogue')
      .then((r) => r.json())
      .then((data: { products?: CatalogueProduct[]; source?: string; error?: string }) => {
        if (data.error) throw new Error(data.error)
        if (Array.isArray(data.products) && data.products.length > 0) {
          setCatalogueProducts(data.products)
          setIsLive(data.source === 'real')
        }
      })
      .catch((err: Error) => {
        console.error('[useCatalogueProducts]', err)
        setError(err.message)
        fetchStarted = false // allow retry on next mount
      })
      .finally(() => setIsLoading(false))
  }, [setCatalogueProducts])

  return { products: catalogueProducts, isLoading, isLive, error }
}

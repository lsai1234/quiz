'use client'

import { useEffect, useState } from 'react'
import { useQuizStore } from '@/lib/store'
import { loadCatalogue, invalidateCatalogue } from '@/lib/catalogue/load'
import type { CatalogueProduct } from '@/lib/catalogue/types'

// Re-exported so portal panels keep importing it from here.
export { invalidateCatalogue }

interface UseCatalogueProductsReturn {
  products: CatalogueProduct[]
  isLoading: boolean
  isLive: boolean
  error: string | null
}

/**
 * The catalogue, for components. Subscribes to the store (so imports/swaps made
 * elsewhere show up) and triggers the shared fetch on mount.
 *
 * `isLoading` matters: until it is false, an empty `products` means "not here
 * yet", not "no such product". Callers that look products up by id must wait,
 * or they will render every card as unavailable for a frame.
 */
export function useCatalogueProducts(): UseCatalogueProductsReturn {
  const products = useQuizStore((s) => s.catalogueProducts)
  const [isLoading, setIsLoading] = useState(true)
  const [isLive, setIsLive] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void loadCatalogue().then(({ source, error: loadError }) => {
      if (!active) return
      setIsLive(source === 'real')
      setError(loadError)
      setIsLoading(false)
    })
    return () => { active = false }
  }, [])

  return { products, isLoading, isLive, error }
}

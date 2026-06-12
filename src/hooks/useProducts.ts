'use client'

import { useState, useEffect } from 'react'
import type { Product } from '@/lib/types'
import { useQuizStore } from '@/lib/store'

// Module-level guard so the catalogue is fetched only once per session,
// no matter how many components mount this hook.
let fetchStarted = false

interface UseProductsReturn {
  products: Product[]
  isLoading: boolean
  isLive: boolean
  error: string | null
}

export function useProducts(): UseProductsReturn {
  const catalogue = useQuizStore((s) => s.catalogue)
  const catalogueSource = useQuizStore((s) => s.catalogueSource)
  const setCatalogue = useQuizStore((s) => s.setCatalogue)

  const [isLoading, setIsLoading] = useState(catalogueSource !== 'shopify')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (fetchStarted) {
      setIsLoading(false)
      return
    }
    fetchStarted = true

    fetch('/api/products')
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error)
        if (data.source === 'shopify' && Array.isArray(data.products)) {
          useQuizStore.getState().setCatalogue(data.products, 'shopify')
        } else if (data.shopifyError) {
          throw new Error(data.shopifyError)
        }
      })
      .catch((err) => {
        console.error('[useProducts]', err)
        setError(err.message)
        fetchStarted = false // allow retry on next mount
      })
      .finally(() => setIsLoading(false))
    // setCatalogue accessed via getState to keep deps empty
  }, [setCatalogue])

  return {
    products: catalogue,
    isLoading,
    isLive: catalogueSource === 'shopify',
    error,
  }
}

'use client'

import { useState, useEffect } from 'react'
import type { Product } from '@/lib/types'
import { MOCK_PRODUCTS } from '@/lib/mock-products'

interface UseProductsReturn {
  products: Product[]
  isLoading: boolean
  isLive: boolean
  error: string | null
}

export function useProducts(): UseProductsReturn {
  const [products, setProducts] = useState<Product[]>(MOCK_PRODUCTS as Product[])
  const [isLoading, setIsLoading] = useState(true)
  const [isLive, setIsLive] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/products')
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return
        if (data.error) throw new Error(data.error)
        setProducts(data.products)
        setIsLive(data.source === 'shopify')
      })
      .catch((err) => {
        if (cancelled) return
        console.error('[useProducts]', err)
        setError(err.message)
        // keep the mock fallback already in state
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  return { products, isLoading, isLive, error }
}

'use client'

import { useEffect } from 'react'
import { setDataSourceOverride } from '@/lib/data-source'
import { setPricingOverrides } from '@/lib/stack-blueprint/pricing'

/**
 * Mirrors the portal's runtime config (data-source mode + pricing overrides)
 * into the client so the customer-facing quiz/hub reflect portal edits. Mounted
 * once in the root layout; reads the public /api/config.
 */
export function PortalSync() {
  useEffect(() => {
    fetch('/api/config')
      .then((r) => r.json())
      .then((data: { dataSourceMode?: 'auto' | 'mock' | 'shopify'; pricingOverrides?: Record<string, unknown> }) => {
        if (data.dataSourceMode) setDataSourceOverride(data.dataSourceMode)
        if (data.pricingOverrides) setPricingOverrides(data.pricingOverrides)
      })
      .catch(() => { /* non-critical */ })
  }, [])
  return null
}

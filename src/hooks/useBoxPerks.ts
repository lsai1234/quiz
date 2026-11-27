'use client'

import { useEffect, useState } from 'react'
import type { TryOffer } from '@/lib/hub/try-new'

/**
 * What a plan member's next box comes with beyond their plan (`/api/hub/next-box`):
 * one product to try at a first-time price, and whether it's a thank-you box.
 * Asked again whenever `key` changes (the plan did).
 */
export function useBoxPerks(key: string): { offer: TryOffer | null; thankYou: { box: number } | null; clearOffer: () => void } {
  const [offer, setOffer] = useState<TryOffer | null>(null)
  const [thankYou, setThankYou] = useState<{ box: number } | null>(null)
  useEffect(() => {
    let live = true
    fetch('/api/hub/next-box')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { try?: TryOffer | null; thankYou?: { box: number } | null } | null) => {
        if (!live) return
        setOffer(data?.try ?? null)
        setThankYou(data?.thankYou ?? null)
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [key])
  return { offer, thankYou, clearOffer: () => setOffer(null) }
}

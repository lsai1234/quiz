'use client'

import { useEffect, useState } from 'react'
import { DEFAULT_OFFER, normaliseOffer, type OfferSettings } from '@/lib/offer/settings'

/**
 * The offer settings the results page reads (`GET /api/offer`), once per
 * page load. `ready` is false until they are here, so the page can wait
 * rather than draw today's top pick and then swap it for the hero. A failed
 * read is everything off: the top pick, and no bonus.
 */
let cached: Promise<OfferSettings> | null = null

function load(): Promise<OfferSettings> {
  if (!cached) {
    cached = fetch('/api/offer', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { offer?: unknown } | null) => (d?.offer ? normaliseOffer(d.offer) : DEFAULT_OFFER))
      .catch(() => DEFAULT_OFFER)
  }
  return cached
}

/** For tests: forget the settings read so far. */
export function resetOfferSettings(): void {
  cached = null
}

export function useOfferSettings(): { settings: OfferSettings; ready: boolean } {
  const [state, setState] = useState<{ settings: OfferSettings; ready: boolean }>({ settings: DEFAULT_OFFER, ready: false })
  useEffect(() => {
    let live = true
    void load().then((settings) => {
      if (live) setState({ settings, ready: true })
    })
    return () => {
      live = false
    }
  }, [])
  return state
}

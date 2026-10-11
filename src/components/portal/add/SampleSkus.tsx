'use client'

import { useEffect, useState } from 'react'
import { Button, Note, Skeleton } from '@/components/system'
import { SUPPLIER_SETTINGS_HREF } from '@/lib/portal/product-links'
import { Row, Stack, TextLink, metaText } from './ui'

/**
 * Codes that exist, for when you have none to hand.
 *
 * On the sample catalogue, or a PowerBody DEMO account whose products exist
 * only in the API, there is nowhere else to get a code from to try the page
 * with. Codes only — names and prices come from looking them up.
 */
export function SampleSkus({ onPick, onPutAll }: { onPick: (sku: string) => void; onPutAll: (skus: string[]) => void }) {
  const [skus, setSkus] = useState<string[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    setError(null)
    setSkus(null)
    fetch('/api/portal/supplier/skus?limit=40', { cache: 'no-store' })
      .then(async (res) => {
        const d = await res.json().catch(() => ({}))
        if (!active) return
        if (!res.ok) setError(d.error ?? `the server answered ${res.status}`)
        else setSkus(Array.isArray(d.skus) ? d.skus : [])
      })
      .catch(() => active && setError('the server could not be reached'))
    return () => {
      active = false
    }
  }, [attempt])

  if (error) {
    return (
      <Note tone="critical" live="polite">
        No sample codes — {error}.{' '}
        <Button size="sm" variant="ghost" onClick={() => setAttempt((n) => n + 1)}>
          Try again
        </Button>{' '}
        <TextLink href={SUPPLIER_SETTINGS_HREF}>Run the checks</TextLink>
      </Note>
    )
  }
  if (!skus) return <Skeleton height="var(--control-md)" />
  if (skus.length === 0) {
    return (
      <Note tone="attention">
        The supplier’s list came back empty, so there are no codes to show. <TextLink href={SUPPLIER_SETTINGS_HREF}>Run the checks</TextLink> to see what it is answering.
      </Note>
    )
  }
  return (
    <Stack gap="var(--space-2)">
      <p style={metaText}>{skus.length} codes that exist — tap one to put it in the box.</p>
      <Row gap="var(--space-1)">
        {skus.map((sku) => (
          // No aria-label: the SKU is the visible text, and so the name. A label
          // that does not start with what is written breaks voice control.
          <Button key={sku} size="sm" variant="secondary" onClick={() => onPick(sku)}>
            {sku}
          </Button>
        ))}
      </Row>
      <Row>
        <Button size="sm" variant="ghost" onClick={() => onPutAll(skus)}>
          Put all {skus.length} in the box
        </Button>
      </Row>
    </Stack>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Badge } from '@/components/system'

/**
 * How many products are waiting for review, on the sub-nav's Review link.
 *
 * Fetched in the browser rather than counted by the Products layout, because a
 * layout is not re-rendered when you move between the pages under it: a count
 * drawn there would still say 3 after the founder had approved all three and
 * gone back to the list. Re-read on every move between Products pages instead,
 * which is exactly when the number can have changed — approving happens on the
 * Review page and on a product's own page, and leaving either is a navigation.
 *
 * Says nothing at all when the queue is empty or the count cannot be read. A
 * "0" is noise, and a badge is not the place to report a failed request — the
 * Review page itself says what went wrong.
 */
export function ReviewCountBadge() {
  const pathname = usePathname()
  const [count, setCount] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/portal/products/review', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { count?: unknown; products?: unknown[] } | null) => {
        if (cancelled || !data) return
        const n = typeof data.count === 'number' ? data.count : Array.isArray(data.products) ? data.products.length : null
        setCount(n)
      })
      .catch(() => {
        /* no badge rather than a wrong one */
      })
    return () => {
      cancelled = true
    }
  }, [pathname])

  if (!count) return null
  return (
    // Solid: it sits on the sub-nav's pills, one of which is a filled accent
    // chip, and a tinted badge over a filled chip loses its contrast. Solid is
    // for one badge per view, and this is the only one in the bar.
    <Badge tone="attention" variant="solid">
      {count}
      <span className="sr-only">{` waiting`}</span>
    </Badge>
  )
}

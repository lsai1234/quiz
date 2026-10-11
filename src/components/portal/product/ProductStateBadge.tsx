import { Badge } from '@/components/system'
import type { ProductState } from '@/lib/portal/product-edit'

/**
 * Where a product stands, said the same way on every screen: on sale, waiting
 * for review (held out of the shop and the quiz), or removed (hidden, and can
 * be restored).
 */
const LABEL: Record<ProductState, string> = {
  live: 'On sale',
  pending: 'Waiting for review',
  removed: 'Removed',
}
const TONE: Record<ProductState, 'positive' | 'attention' | 'neutral'> = {
  live: 'positive',
  pending: 'attention',
  removed: 'neutral',
}

export function ProductStateBadge({ state }: { state: ProductState }) {
  return (
    <Badge tone={TONE[state]} dot>
      {LABEL[state]}
    </Badge>
  )
}

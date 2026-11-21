'use client'

import { ShopTopBar } from './ShopTopBar'

interface Props {
  count: number
  onOpenBasket: () => void
  /** Takes you to the shop's search box. */
  onSearch?: () => void
}

/** The shop's top bar: the shared storefront bar, with the drawer it opens in place. */
export function ShopHeader({ count, onOpenBasket, onSearch }: Props) {
  return <ShopTopBar count={count} onOpenBasket={onOpenBasket} onSearch={onSearch} />
}

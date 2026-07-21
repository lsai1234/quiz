export interface ShopifyMoneyV2 {
  amount: string
  currencyCode: string
}

export interface ShopifyImage {
  url: string
  altText: string | null
  width: number
  height: number
}

export interface ShopifyVariant {
  id: string
  title: string
  priceV2: ShopifyMoneyV2
  compareAtPriceV2: ShopifyMoneyV2 | null
  image: ShopifyImage | null
  availableForSale: boolean
  /** Real remaining units when inventory is tracked; null otherwise. */
  quantityAvailable?: number | null
  /** Out of stock but still purchasable (continue-selling / backorder) — a real restock signal. */
  currentlyNotInStock?: boolean
  product: { title: string; handle: string; images: { edges: { node: ShopifyImage }[] } }
  /** Subscription selling-plan allocations — present once selling plans/Recharge are configured. */
  sellingPlanAllocations?: { edges: { node: { sellingPlan: { id: string } } }[] }
}

export interface ShopifyMetafield {
  key: string
  value: string
  type: string
}

export interface ShopifyProduct {
  id: string
  title: string
  handle: string
  description: string
  productType: string
  tags: string[]
  images: { edges: { node: ShopifyImage }[] }
  variants: { edges: { node: ShopifyVariant }[] }
  metafields: (ShopifyMetafield | null)[]
}

export interface CartLineItem {
  id: string
  variantId: string
  quantity: number
  variant: ShopifyVariant
  // personalisation reason added by recommendation engine
  reason?: string
}

export interface ShopifyCart {
  id: string
  lines: CartLineItem[]
  estimatedCost: {
    totalAmount: ShopifyMoneyV2
    subtotalAmount: ShopifyMoneyV2
  }
  checkoutUrl: string
}

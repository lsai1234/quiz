'use client'

import { useState } from 'react'
import { Select } from '@/components/system'
import { ShopProductCard } from '@/components/shop/ShopProductCard'
import { ProductDetailBody } from '@/components/shop/ProductDetail'
import { masterVariant } from '@/lib/catalogue/master'
import { priceRange } from '@/lib/shop/merchandising'
import { labelsOf } from '@/lib/catalogue/line-variant'
import { Section, META, money, type Payload } from './shared'

/**
 * What the customer sees — drawn by the shop's OWN components, not a summary of
 * them, so this cannot disagree with the shelf. That is the whole answer to
 * "what does the shop show for servings, price and flavour names": the card a
 * shopper scrolls past, and the product page with its flavour picker, exactly
 * as they render.
 *
 * `inert`, because a click here would add to a basket or leave the hub. Not
 * dimmed: the storefront's quiet text is already at its contrast floor, and an
 * opacity on top would push it under.
 */
export function ProductPreview({ payload }: { payload: Payload }) {
  const { product, state } = payload
  const master = masterVariant(product)
  const [variantId, setVariantId] = useState<string | undefined>(master?.id)
  const variant = product.variants.find((v) => v.id === variantId) ?? master

  const range = priceRange(product)
  const cheapest = [...product.variants].filter((v) => v.available).sort((a, b) => a.price - b.price)[0]
  const cardSku = (range.varies ? cheapest : undefined) ?? product.variants.find((v) => v.available) ?? product.variants[0]
  const why = range.varies
    ? `The card quotes “from ${money(range.min)}” and describes ${cardSku ? labelsOf(cardSku)[0] : 'the cheapest SKU'}, the cheapest one in stock, because the prices differ.`
    : `The card shows ${cardSku ? labelsOf(cardSku)[0] : 'the first SKU'}, the first one in stock.`

  return (
    <Section
      id="preview"
      title="What the customer sees"
      defaultOpen={state !== 'pending'}
      summary={state === 'live' ? 'Exactly as the shop draws it.' : 'How the shop would draw it once it is on sale.'}
    >
      <p style={META}>
        {why} The product page opens on the master SKU, {master ? labelsOf(master)[0] : '—'}.
        {state !== 'live' ? ' Pictures not yet processed by the shop may show at full size here.' : ''}
      </p>
      {product.variants.length > 1 && (
        <Select
          label="Show the product page on"
          value={variant?.id ?? ''}
          onChange={(e) => setVariantId(e.target.value)}
        >
          {product.variants.map((v) => (
            <option key={v.id} value={v.id}>
              {labelsOf(v)[1] ?? v.title}
              {v.available ? '' : ' (sold out)'}
            </option>
          ))}
        </Select>
      )}
      <div
        inert
        className="grid gap-4"
        style={{
          gridTemplateColumns: 'repeat(auto-fit, minmax(14rem, 1fr))',
          background: 'var(--bg)',
          padding: 'var(--space-4)',
          borderRadius: 'var(--radius-card)',
        }}
      >
        <div style={{ maxWidth: '18rem' }}>
          <ShopProductCard product={product} />
        </div>
        <ProductDetailBody product={product} variant={variant} onSelectVariant={setVariantId} />
      </div>
    </Section>
  )
}

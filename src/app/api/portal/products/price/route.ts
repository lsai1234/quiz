import { NextResponse } from 'next/server'
import { isPortalAuthed } from '@/lib/portal/guard'
import { allEditableProducts, saveProductEdit } from '@/lib/portal/editable-products'
import { clearVariantPrice, priceRows, rulePriceFor, setVariantPrice } from '@/lib/catalogue/price'

/**
 * Setting one SKU's price by hand, and putting it back on the rule.
 *
 * The shop's prices are computed — supplier cost × the markup, rounded down to
 * .99 — and that is the policy for the catalogue, not a law about any one
 * product. This is the exception, made deliberately and recorded as one: the
 * variant's price is written with `priceSource: 'founder'`, which is what makes
 * every later supplier pull leave it alone (see `supplier/variant-pricing`).
 *
 * `price: null` is the way back. It re-computes the rule price from what the
 * supplier charges us and drops the flag, so the product rejoins the policy —
 * and it is refused when nothing knows the cost, because there is then no rule
 * price to return to.
 *
 * Everything about what a price MEANS is in `catalogue/price`, which is pure.
 * This route reads the product, applies it, and writes what comes back.
 */
export const dynamic = 'force-dynamic'

interface Body {
  productId?: string
  variantId?: string
  /** The price to charge (£), or null to go back to the rule. */
  price?: number | null
}

/** A price is money in pounds, and a typo must not reach the shelf as one. */
const MAX_PRICE = 1000

export async function POST(req: Request) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return NextResponse.json({ error: 'Malformed request.' }, { status: 400 })
  }

  const productId = typeof body.productId === 'string' ? body.productId.trim() : ''
  const variantId = typeof body.variantId === 'string' ? body.variantId.trim() : ''
  if (!productId || !variantId) {
    return NextResponse.json({ error: 'productId and variantId required' }, { status: 400 })
  }

  const clearing = body.price === null
  const price = typeof body.price === 'number' ? body.price : NaN
  if (!clearing && (!Number.isFinite(price) || price <= 0)) {
    return NextResponse.json({ error: 'Give a price above £0, or null to use the rule.' }, { status: 400 })
  }
  if (!clearing && price > MAX_PRICE) {
    return NextResponse.json(
      { error: `£${price.toFixed(2)} looks like a typo — the most this will set is £${MAX_PRICE}.` },
      { status: 400 },
    )
  }

  const product = (await allEditableProducts()).find((p) => p.id === productId)
  if (!product) return NextResponse.json({ error: `No product with id "${productId}".` }, { status: 404 })
  const variant = product.variants.find((v) => v.id === variantId)
  if (!variant) {
    return NextResponse.json({ error: `That product has no SKU "${variantId}".` }, { status: 404 })
  }

  /*
    Refused rather than half-done: dropping the flag without a rule price to put
    in its place would leave a number that is neither the rule's nor anybody's,
    and the screen would go on showing it as though the policy had priced it.
  */
  if (clearing && rulePriceFor(product, variant) == null) {
    return NextResponse.json(
      { error: 'No supplier price on file for that SKU, so there is no rule price to go back to. Pull from PowerBody first.' },
      { status: 400 },
    )
  }

  const next = clearing ? clearVariantPrice(product, variantId) : setVariantPrice(product, variantId, price)
  // Nothing to do is a success: the price on the shelf is already the one asked
  // for, and a founder who pressed Save twice has not made a mistake.
  if (next) {
    await saveProductEdit(next, {
      variants: next.variants,
      basePrice: next.basePrice,
      compareAtPrice: next.compareAtPrice,
    })
  }

  const saved = next ?? product
  return NextResponse.json({
    ok: true,
    basePrice: saved.basePrice,
    rows: priceRows(saved),
  })
}

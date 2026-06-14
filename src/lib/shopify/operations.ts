import { shopifyFetch } from './client'
import type { ShopifyCart, ShopifyProduct, ShopifyVariant } from './types'
import { MOCK_PRODUCTS } from '@/lib/mock-products'

// ─── GraphQL fragments + queries ──────────────────────────────────────────────

const CART_FIELDS = `
  id
  checkoutUrl
  estimatedCost {
    totalAmount { amount currencyCode }
    subtotalAmount { amount currencyCode }
  }
  lines(first: 50) {
    edges {
      node {
        id
        quantity
        merchandise {
          ... on ProductVariant {
            id
            title
            priceV2 { amount currencyCode }
            compareAtPriceV2 { amount currencyCode }
            image { url altText width height }
            availableForSale
            product {
              title handle
              images(first: 1) { edges { node { url altText width height } } }
            }
          }
        }
      }
    }
  }
`

const CREATE_CART = `
  mutation cartCreate($lines: [CartLineInput!]) {
    cartCreate(input: { lines: $lines }) {
      cart { ${CART_FIELDS} }
      userErrors { field message }
    }
  }
`

// CartLineInput supports an attributes field: [AttributeInput!]
// We pass attributes through in the lines array so each line carries
// stack metadata (stackId, slotType, reason, source) into the Shopify order.
const CREATE_CART_WITH_ATTRS = `
  mutation cartCreateWithAttrs($lines: [CartLineInput!]) {
    cartCreate(input: { lines: $lines }) {
      cart { ${CART_FIELDS} }
      userErrors { field message }
    }
  }
`

const ADD_LINES = `
  mutation cartLinesAdd($cartId: ID!, $lines: [CartLineInput!]!) {
    cartLinesAdd(cartId: $cartId, lines: $lines) {
      cart { ${CART_FIELDS} }
      userErrors { field message }
    }
  }
`

const UPDATE_LINES = `
  mutation cartLinesUpdate($cartId: ID!, $lines: [CartLineUpdateInput!]!) {
    cartLinesUpdate(cartId: $cartId, lines: $lines) {
      cart { ${CART_FIELDS} }
    }
  }
`

const REMOVE_LINES = `
  mutation cartLinesRemove($cartId: ID!, $lineIds: [ID!]!) {
    cartLinesRemove(cartId: $cartId, lineIds: $lineIds) {
      cart { ${CART_FIELDS} }
    }
  }
`

const GET_PRODUCTS = `
  query getProducts($first: Int!) {
    products(first: $first) {
      edges {
        node {
          id
          title
          handle
          description
          productType
          tags
          images(first: 3) { edges { node { url altText width height } } }
          variants(first: 10) { edges { node {
            id
            title
            availableForSale
            priceV2 { amount currencyCode }
            compareAtPriceV2 { amount currencyCode }
            image { url altText width height }
            product { title handle images(first:1){edges{node{url altText width height}}} }
            sellingPlanAllocations(first: 1) { edges { node { sellingPlan { id } } } }
          }}}
          metafields(identifiers: [
            {namespace: "chrgd", key: "safe_wording"},
            {namespace: "chrgd", key: "accent_color"},
            {namespace: "chrgd", key: "stack_priority"},
            {namespace: "chrgd", key: "subcategory"},
            {namespace: "chrgd", key: "margin_priority"},
            {namespace: "chrgd", key: "subscription_eligible"},
            {namespace: "chrgd", key: "days_of_supply"},
            {namespace: "chrgd", key: "subscription_product_handle"},
            {namespace: "chrgd", key: "subscription_only"},
            {namespace: "chrgd", key: "consumption_cadence"},
            {namespace: "chrgd", key: "doses_per_unit"},
            {namespace: "chrgd", key: "min_subscription_months"},
            {namespace: "chrgd", key: "formats"}
          ]) { key value type }
        }
      }
    }
  }
`

// ─── Raw Shopify operations ────────────────────────────────────────────────────

interface CartData { cart: RawCart }
interface RawCartLine {
  id: string
  quantity: number
  merchandise: ShopifyVariant & { id: string }
}
interface RawCart {
  id: string
  checkoutUrl: string
  estimatedCost: ShopifyCart['estimatedCost']
  lines: { edges: { node: RawCartLine }[] }
}

function normaliseCart(raw: RawCart): ShopifyCart {
  return {
    id: raw.id,
    checkoutUrl: raw.checkoutUrl,
    estimatedCost: raw.estimatedCost,
    lines: raw.lines.edges.map(({ node }) => ({
      id: node.id,
      variantId: node.merchandise.id,
      quantity: node.quantity,
      variant: node.merchandise,
    })),
  }
}

export async function createCart(
  lines: { merchandiseId: string; quantity: number; sellingPlanId?: string; attributes?: { key: string; value: string }[] }[],
): Promise<ShopifyCart> {
  // Use the attributes-capable mutation when any line carries attributes
  const hasAttrs = lines.some((l) => l.attributes && l.attributes.length > 0)
  const query = hasAttrs ? CREATE_CART_WITH_ATTRS : CREATE_CART
  const data = await shopifyFetch<{ cartCreate: CartData }>(query, { lines })
  return normaliseCart(data.cartCreate.cart)
}

export async function addCartLines(cartId: string, lines: { merchandiseId: string; quantity: number }[]): Promise<ShopifyCart> {
  const data = await shopifyFetch<{ cartLinesAdd: CartData }>(ADD_LINES, { cartId, lines })
  return normaliseCart(data.cartLinesAdd.cart)
}

export async function updateCartLines(cartId: string, lines: { id: string; quantity: number }[]): Promise<ShopifyCart> {
  const data = await shopifyFetch<{ cartLinesUpdate: CartData }>(UPDATE_LINES, { cartId, lines })
  return normaliseCart(data.cartLinesUpdate.cart)
}

export async function removeCartLines(cartId: string, lineIds: string[]): Promise<ShopifyCart> {
  const data = await shopifyFetch<{ cartLinesRemove: CartData }>(REMOVE_LINES, { cartId, lineIds })
  return normaliseCart(data.cartLinesRemove.cart)
}

// ─── Mock mode helpers ─────────────────────────────────────────────────────────
// When Shopify env vars aren't set, mock everything using MOCK_PRODUCTS

let _mockCartId = 0

export function buildMockCart(lines: { variantId: string; quantity: number }[]): ShopifyCart {
  const items = lines.map((l) => {
    const product = MOCK_PRODUCTS.find((p) => p.shopifyVariantId === l.variantId)
    const variant: ShopifyVariant = {
      id: l.variantId,
      title: 'Default Title',
      priceV2: { amount: String(product?.price ?? 29.99), currencyCode: 'GBP' },
      compareAtPriceV2: null,
      image: null,
      availableForSale: true,
      product: {
        title: product?.name ?? 'Product',
        handle: product?.id ?? 'product',
        images: { edges: [] },
      },
    }
    return { id: `mock-line-${l.variantId}`, variantId: l.variantId, quantity: l.quantity, variant }
  })

  const total = items.reduce((s, i) => {
    const price = parseFloat(i.variant.priceV2.amount)
    return s + price * i.quantity
  }, 0)

  return {
    id: `mock-cart-${++_mockCartId}`,
    lines: items,
    estimatedCost: {
      totalAmount: { amount: total.toFixed(2), currencyCode: 'GBP' },
      subtotalAmount: { amount: total.toFixed(2), currencyCode: 'GBP' },
    },
    checkoutUrl: '#mock-checkout',
  }
}

export async function getProducts(first = 50): Promise<ShopifyProduct[]> {
  const data = await shopifyFetch<{ products: { edges: { node: ShopifyProduct }[] } }>(
    GET_PRODUCTS,
    { first },
  )
  return data.products.edges.map(({ node }) => node)
}

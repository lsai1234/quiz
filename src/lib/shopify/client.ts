const DOMAIN = process.env.NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN
const TOKEN = process.env.NEXT_PUBLIC_SHOPIFY_STOREFRONT_TOKEN
const API_VERSION = process.env.NEXT_PUBLIC_SHOPIFY_API_VERSION ?? '2024-10'

// Whether to read mock vs live Shopify data is decided by the data-source
// resolver in src/lib/data-source.ts — not by a credentials-only flag here.

export async function shopifyFetch<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  if (!DOMAIN || !TOKEN) throw new Error('Shopify env vars not set — use mock mode')

  const endpoint = `https://${DOMAIN}/api/${API_VERSION}/graphql.json`
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Storefront-Access-Token': TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  })

  if (!res.ok) throw new Error(`Shopify API error: ${res.status}`)

  const json = await res.json()
  if (json.errors) throw new Error(json.errors[0].message)
  return json.data as T
}

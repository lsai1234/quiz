/**
 * @jest-environment node
 *
 * The product page and who may read it.
 *
 * The hub's layout swaps `children` for the sign-in screen when nobody is signed
 * in — but Next renders the page segment anyway and ships its output in the
 * page's data, so a layout is not a gate. The product payload carries what we
 * pay PowerBody, the markup, unreleased imports, review notes and a founder's
 * email, so the page itself has to refuse before it reads anything.
 */
import type { ReactElement } from 'react'

const isPortalAuthed = jest.fn<Promise<boolean>, []>()
jest.mock('@/lib/portal/guard', () => ({ isPortalAuthed: () => isPortalAuthed() }))

const productPayload = jest.fn()
jest.mock('@/lib/portal/product-edit', () => ({
  productPayload: (...args: unknown[]) => productPayload(...args),
}))

// The workspace is a large client tree; what matters here is what it is handed.
jest.mock('@/components/portal/product/ProductWorkspace', () => ({ ProductWorkspace: () => null }))

const notFound = jest.fn(() => {
  throw new Error('NEXT_NOT_FOUND')
})
jest.mock('next/navigation', () => ({ notFound: () => notFound() }))

import ProductItemPage from '../page'

const PAYLOAD = {
  product: { id: 'chrgd-whey-protein', title: 'CHRGD Whey', cost: 11.2, review: { approvedBy: 'founder@example.com' } },
  priceRows: [],
}

const open = (id: string) => ProductItemPage({ params: Promise.resolve({ id }) })

/** The `initial` the workspace was given, wherever it sits under the Suspense. */
function initialOf(el: ReactElement | null): unknown {
  const child = (el?.props as { children?: ReactElement } | undefined)?.children
  return (child?.props as { initial?: unknown } | undefined)?.initial
}

beforeEach(() => {
  isPortalAuthed.mockReset()
  productPayload.mockReset()
  notFound.mockClear()
})

describe('the product page, signed out', () => {
  it('draws nothing and never reads the product, so none of it reaches the page data', async () => {
    isPortalAuthed.mockResolvedValue(false)
    productPayload.mockResolvedValue(PAYLOAD)

    const el = await open('chrgd-whey-protein')

    expect(el).toBeNull()
    expect(productPayload).not.toHaveBeenCalled()
  })

  it('answers a missing id exactly as it answers a real one, so ids cannot be probed', async () => {
    isPortalAuthed.mockResolvedValue(false)
    productPayload.mockResolvedValue(null)

    await expect(open('no-such-product')).resolves.toBeNull()
    expect(notFound).not.toHaveBeenCalled()
  })
})

describe('the product page, signed in', () => {
  it('reads the product fresh, by its decoded id, and hands it to the workspace', async () => {
    isPortalAuthed.mockResolvedValue(true)
    productPayload.mockResolvedValue(PAYLOAD)

    const el = await open('chrgd%20whey')

    expect(productPayload).toHaveBeenCalledWith('chrgd whey', { fresh: true })
    expect(initialOf(el)).toBe(PAYLOAD)
  })

  it('is a 404 for a product that does not exist', async () => {
    isPortalAuthed.mockResolvedValue(true)
    productPayload.mockResolvedValue(null)

    await expect(open('no-such-product')).rejects.toThrow('NEXT_NOT_FOUND')
  })
})

describe('a broken address', () => {
  it('is not found, not a server error', async () => {
    isPortalAuthed.mockResolvedValue(true)
    await expect(open('%E0%A4%A')).rejects.toThrow('NEXT_NOT_FOUND')
    expect(productPayload).not.toHaveBeenCalled()
  })
})

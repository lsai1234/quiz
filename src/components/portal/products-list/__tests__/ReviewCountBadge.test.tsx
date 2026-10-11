import { render, screen, waitFor } from '@testing-library/react'
import { SubNav, isActive } from '../../SubNav'
import { ReviewCountBadge } from '../ReviewCountBadge'

const path = { value: '/founderhub/products' }
jest.mock('next/navigation', () => ({ usePathname: () => path.value }))

const originalFetch = global.fetch
afterEach(() => {
  global.fetch = originalFetch
  path.value = '/founderhub/products'
})

function serve(body: unknown, status = 200) {
  global.fetch = jest.fn().mockResolvedValue({ ok: status === 200, status, json: async () => body }) as unknown as typeof fetch
}

describe('the Products sub-nav', () => {
  it('keeps Products lit on a product’s own page', () => {
    const products = { href: '/founderhub/products', label: 'Products', exact: true, activeFor: ['/founderhub/products/item/'] }
    expect(isActive(products, '/founderhub/products')).toBe(true)
    expect(isActive(products, '/founderhub/products/item/whey')).toBe(true)
    expect(isActive(products, '/founderhub/products/review')).toBe(false)
  })

  it('shows how many products wait for review, in words a screen reader can say', async () => {
    serve({ products: [], count: 3 })
    render(
      <SubNav
        title="Products"
        items={[
          { href: '/founderhub/products', label: 'Products', exact: true },
          { href: '/founderhub/products/review', label: 'Review', badge: <ReviewCountBadge /> },
        ]}
      />,
    )
    expect(await screen.findByRole('link', { name: 'Review 3 waiting' })).toHaveAttribute('href', '/founderhub/products/review')
    expect(screen.getByRole('link', { name: 'Products' })).toHaveAttribute('aria-current', 'page')
  })

  it('says nothing when the queue is empty or cannot be read', async () => {
    serve({ products: [], count: 0 })
    const { container, unmount } = render(<ReviewCountBadge />)
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
    unmount()

    serve({ error: 'Unauthorized' }, 401)
    const second = render(<ReviewCountBadge />)
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    expect(second.container).toBeEmptyDOMElement()
  })
})

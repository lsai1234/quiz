const mockTrack = jest.fn()
jest.mock('@/lib/analytics/events', () => ({ track: (...a: unknown[]) => mockTrack(...a) }))
const path = { value: '/' }
jest.mock('next/navigation', () => ({ usePathname: () => path.value }))

import { render } from '@testing-library/react'
import { PageViews, isTrackedPath } from '../PageViews'

/** The top of every funnel: one view per page landed on, and none of our own tools. */

beforeEach(() => mockTrack.mockClear())

describe('PageViews', () => {
  it('records a view of the page, and a new one on navigation', () => {
    path.value = '/'
    const { rerender } = render(<PageViews />)
    expect(mockTrack).toHaveBeenCalledWith('page_view')
    rerender(<PageViews />)
    expect(mockTrack).toHaveBeenCalledTimes(1)
    path.value = '/shop'
    rerender(<PageViews />)
    expect(mockTrack).toHaveBeenCalledTimes(2)
  })

  it('leaves the hubs and the founders’ preview out', () => {
    for (const p of ['/founderhub', '/founderhub/analytics', '/quizv2', '/styleguide', '/partner/login', '/myhub']) {
      expect(isTrackedPath(p)).toBe(false)
    }
    for (const p of ['/', '/shop', '/product/whey', '/s/abc', '/order/confirmation', '/partnership']) {
      expect(isTrackedPath(p)).toBe(true)
    }
  })
})

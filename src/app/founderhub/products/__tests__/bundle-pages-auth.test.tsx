/**
 * @jest-environment node
 *
 * The two bundle editors and who may read them.
 *
 * Like the product page: the hub's layout shows the sign-in screen in place of
 * `children`, but Next still renders the page segment and ships its output in
 * the page data. So each page refuses before it reads the bundle.
 */
const isPortalAuthed = jest.fn<Promise<boolean>, []>()
jest.mock('@/lib/portal/guard', () => ({ isPortalAuthed: () => isPortalAuthed() }))

const getResolvedBundle = jest.fn()
const getProductBundle = jest.fn()
jest.mock('@/lib/bundles/store', () => ({
  getResolvedBundle: (...a: unknown[]) => getResolvedBundle(...a),
  getProductBundle: (...a: unknown[]) => getProductBundle(...a),
}))
jest.mock('@/components/portal/BundleEditor', () => ({ BundleEditor: () => null }))
jest.mock('@/components/portal/ProductBundleEditor', () => ({ ProductBundleEditor: () => null }))
jest.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))

import EditBundlePage from '../bundles/[slug]/page'
import EditProductBundlePage from '../prebuilt/[slug]/page'

const params = Promise.resolve({ slug: 'morning-stack' })

beforeEach(() => {
  isPortalAuthed.mockReset()
  getResolvedBundle.mockReset().mockResolvedValue({ slug: 'morning-stack', items: [] })
  getProductBundle.mockReset().mockResolvedValue({ slug: 'morning-stack', items: [] })
})

describe.each([
  ['session stack editor', EditBundlePage, getResolvedBundle],
  ['pre-built bundle editor', EditProductBundlePage, getProductBundle],
])('the %s', (_name, Page, read) => {
  it('draws nothing and reads nothing for a visitor who is not signed in', async () => {
    isPortalAuthed.mockResolvedValue(false)
    expect(await Page({ params })).toBeNull()
    expect(read).not.toHaveBeenCalled()
  })

  it('hands the bundle to the editor for a signed-in founder', async () => {
    isPortalAuthed.mockResolvedValue(true)
    const el = (await Page({ params })) as { props: { initial: unknown } }
    expect(el.props.initial).toEqual({ slug: 'morning-stack', items: [] })
  })
})

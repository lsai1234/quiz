/**
 * Where the product screens live. One place, so a link written in a component,
 * a front-page action item and an error message can never point at a page that
 * has moved — which is what happened to every "go to the Dashboard" sentence
 * when Catalogue, Dashboard and Readiness became one Products page.
 */

export const PRODUCTS_HREF = '/founderhub/products'
export const ADD_PRODUCTS_HREF = '/founderhub/products/add'
export const REVIEW_HREF = '/founderhub/products/review'
export const FIXUPS_HREF = '/founderhub/products/fix-ups'
export const SUPPLIER_SETTINGS_HREF = '/founderhub/settings/supplier'

/** The sections of a product page, in page order. Also the `#hash` anchors. */
export type ProductSection = 'checks' | 'preview' | 'listing' | 'variants' | 'quiz' | 'supplier' | 'hero'

/** A product's own page, optionally at one of its sections. */
export function productHref(id: string, section?: ProductSection, opts: { queue?: boolean } = {}): string {
  const base = `/founderhub/products/item/${encodeURIComponent(id)}`
  return `${base}${opts.queue ? '?queue=review' : ''}${section ? `#${section}` : ''}`
}

/** The Products list, filtered to one view. */
export function productsHref(show?: 'live' | 'pending' | 'attention' | 'blocking' | 'removed' | 'all'): string {
  return show ? `${PRODUCTS_HREF}?show=${show}` : PRODUCTS_HREF
}

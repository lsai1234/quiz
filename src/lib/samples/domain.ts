/**
 * Test views (Founders Hub → Settings → Test views): the names that mark
 * sample data and a founder's test-view browser. Safe in the browser.
 *
 * Sample members live on a `.test` domain, which no mail server ever accepts:
 * an address on it can't reach anyone, whatever else goes wrong.
 */
export const SAMPLE_DOMAIN = 'sample.chrgd.test'

export function isSampleEmail(email: string | null | undefined): boolean {
  return typeof email === 'string' && email.trim().toLowerCase().endsWith(`@${SAMPLE_DOMAIN}`)
}

export function sampleEmailFor(scenario: string): string {
  return `${scenario}@${SAMPLE_DOMAIN}`
}

/** The server's record of an open test view (httpOnly). */
export const TEST_VIEW_COOKIE = 'chrgd_tv'
/** That a test view is open in this browser, for the banner and analytics (readable). */
export const TEST_VIEW_FLAG = 'chrgd_tv_on'

/** A test view is open in this browser. */
export function testViewOpen(): boolean {
  if (typeof document === 'undefined') return false
  return document.cookie.split(/;\s*/).some((c) => c === `${TEST_VIEW_FLAG}=1`)
}

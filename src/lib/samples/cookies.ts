/**
 * Setting and clearing a test view's two cookies (server-only, inside a
 * request). The token is httpOnly; the flag is readable so the page can show
 * the banner and keep our own analytics out of it.
 */
import { TEST_VIEW_COOKIE, TEST_VIEW_FLAG } from './domain'
import { TEST_VIEW_HOURS, type TestView } from './session'

export async function setTestViewCookies(view: TestView): Promise<void> {
  const { cookies } = await import('next/headers')
  const jar = await cookies()
  const base = { sameSite: 'lax' as const, secure: process.env.NODE_ENV === 'production', path: '/', maxAge: TEST_VIEW_HOURS * 3600 }
  jar.set(TEST_VIEW_COOKIE, view.token, { ...base, httpOnly: true })
  jar.set(TEST_VIEW_FLAG, '1', { ...base, httpOnly: false })
}

export async function clearTestViewCookies(): Promise<string | null> {
  const { cookies } = await import('next/headers')
  const jar = await cookies()
  const token = jar.get(TEST_VIEW_COOKIE)?.value ?? null
  jar.delete(TEST_VIEW_COOKIE)
  jar.delete(TEST_VIEW_FLAG)
  return token
}

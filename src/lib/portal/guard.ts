import { cookies } from 'next/headers'
import { PORTAL_COOKIE, isAuthed } from './auth'

/** True when the current request carries a valid portal session. */
export async function isPortalAuthed(): Promise<boolean> {
  const jar = await cookies()
  return isAuthed(jar.get(PORTAL_COOKIE)?.value)
}

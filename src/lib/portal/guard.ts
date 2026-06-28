import { cookies } from 'next/headers'
import { PORTAL_COOKIE, isAuthed, founderForToken, type FounderAccount } from './auth'

/** True when the current request carries a valid portal session. */
export async function isPortalAuthed(): Promise<boolean> {
  const jar = await cookies()
  return isAuthed(jar.get(PORTAL_COOKIE)?.value)
}

/** The signed-in founder for the current request (display + attribution), or null. */
export async function getFounder(): Promise<FounderAccount | null> {
  const jar = await cookies()
  return founderForToken(jar.get(PORTAL_COOKIE)?.value)
}

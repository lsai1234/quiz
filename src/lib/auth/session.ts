/**
 * Hub session cookie — the request-side of customer auth.
 *
 * The `hub_session` cookie carries the opaque token whose hash lives in the
 * `sessions` table (see src/lib/db/sessions.ts). This is the customer realm;
 * the founders' portal keeps its own separate `portal_session` cookie.
 *
 * Server-only (next/headers).
 */
import { cookies } from 'next/headers'
import { createSession, deleteSession, getUserForSession } from '@/lib/db/sessions'
import { toPublicUser, type PublicUser, type UserRecord } from '@/lib/db/users'

export const HUB_COOKIE = 'hub_session'

/** Create a DB session for the user and set the cookie on the response. */
export async function startHubSession(userId: string): Promise<void> {
  const { token, expiresAt } = await createSession(userId)
  const jar = await cookies()
  jar.set(HUB_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    expires: expiresAt,
    path: '/',
  })
}

/** The signed-in customer for the current request, or null. */
export async function getHubUser(): Promise<UserRecord | null> {
  const jar = await cookies()
  return getUserForSession(jar.get(HUB_COOKIE)?.value)
}

/** Same, in browser-safe shape. */
export async function getHubPublicUser(): Promise<PublicUser | null> {
  const user = await getHubUser()
  return user ? toPublicUser(user) : null
}

/** Revoke the DB session and clear the cookie. */
export async function endHubSession(): Promise<void> {
  const jar = await cookies()
  await deleteSession(jar.get(HUB_COOKIE)?.value)
  jar.delete(HUB_COOKIE)
}

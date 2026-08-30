/**
 * Who looked at whose record.
 *
 * Article 5(2) is accountability — being able to *demonstrate* compliance
 * rather than assert it — and Article 32 asks for measures appropriate to the
 * risk. The Founders Hub can open any member's full record: their plan, their
 * billing history, their consents, what we have emailed them. That left no
 * trace at all, so "was this member's record accessed, and by whom?" had no
 * answer, and neither did the version of that question asked after a breach.
 *
 * ── What is recorded, and what is not ───────────────────────────────────────
 * The founder, the member, the kind of access and when. Nothing about what was
 * on screen: logging the contents would make the audit log a second copy of the
 * data it exists to protect, which is how an access log becomes the largest
 * liability in the system.
 *
 * Writes never fail the request they describe. A member-support screen that
 * 500s because the audit write failed helps nobody, and refusing to serve
 * support because logging is down is worse than the gap it closes. A failure is
 * logged loudly instead.
 *
 * Server-only.
 */
import { getEngine, now } from '@/lib/db/engine'

export type AccessKind = 'member-record' | 'member-order' | 'member-export'

export interface AccessEntry {
  id: string
  founder: string
  userId: string
  kind: AccessKind
  path: string | null
  at: string
}

/** Record that a founder opened a member's record. */
export async function logMemberAccess(input: {
  founderEmail: string
  userId: string
  kind: AccessKind
  path?: string | null
}): Promise<void> {
  try {
    const db = await getEngine()
    await db.run(
      `INSERT INTO member_access_log (id, founder, user_id, kind, path, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        globalThis.crypto.randomUUID(),
        input.founderEmail,
        input.userId,
        input.kind,
        input.path ?? null,
        now(),
      ],
    )
  } catch (err) {
    console.error('[access-log] could not record member access:', err)
  }
}

/**
 * Every access to one member's record, newest first.
 *
 * This is what a subject access request is answered from when someone asks who
 * has looked at their data — so it reads by member, not by founder.
 */
export async function accessesForMember(userId: string, limit = 200): Promise<AccessEntry[]> {
  const db = await getEngine()
  const rows = await db.all<{
    id: string; founder: string; user_id: string; kind: string; path: string | null; created_at: string
  }>(
    `SELECT id, founder, user_id, kind, path, created_at FROM member_access_log
     WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`,
    [userId, limit],
  )
  return rows.map((r) => ({
    id: r.id,
    founder: r.founder,
    userId: r.user_id,
    kind: r.kind as AccessKind,
    path: r.path,
    at: r.created_at,
  }))
}

/**
 * The addresses themselves — one row per person, however many times they visit.
 *
 * Server-only. Everything here is upsert-shaped rather than insert-shaped: the
 * same person finishing the quiz three times in a fortnight is one lead whose
 * `last_seen_at` moved, not three duplicates that a founder then has to
 * de-duplicate by eye before sending anything.
 *
 * What an upsert may and may not overwrite is the interesting part. A later
 * visit refreshes the name and the goals — the most recent quiz is the most
 * useful thing to segment on — but never rewrites `source` or `first_seen_at`,
 * because "where did this address come from, and when" is a fact about an event
 * that already happened and is exactly what a consent audit asks about.
 */
import { getEngine, now } from '@/lib/db/engine'
import { consentStateOf, normaliseEmail } from './consent'
import type { AudienceMember, EmailLead, LeadSource } from './types'

interface Row {
  email: string
  first_name: string | null
  source: string
  track: string | null
  primary_goal: string | null
  user_id: string | null
  first_seen_at: string
  last_seen_at: string
}

const toLead = (r: Row): EmailLead => ({
  email: r.email,
  firstName: r.first_name,
  source: r.source as LeadSource,
  track: r.track,
  primaryGoal: r.primary_goal,
  userId: r.user_id,
  firstSeenAt: r.first_seen_at,
  lastSeenAt: r.last_seen_at,
})

export interface UpsertLeadInput {
  email: string
  firstName?: string | null
  source: LeadSource
  track?: string | null
  primaryGoal?: string | null
  userId?: string | null
}

/**
 * Record an address, or update what we know about one we have.
 *
 * `COALESCE(excluded.x, table.x)` on every optional column: a later capture that
 * knows less than an earlier one must not blank what we already had. Someone who
 * gave their name on the reveal and later signs up with an address alone keeps
 * their name.
 */
export async function upsertLead(input: UpsertLeadInput): Promise<EmailLead> {
  const email = normaliseEmail(input.email)
  const at = now()
  const db = await getEngine()

  await db.run(
    `INSERT INTO email_leads
       (email, first_name, source, track, primary_goal, user_id, first_seen_at, last_seen_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(email) DO UPDATE SET
       first_name   = COALESCE(excluded.first_name, email_leads.first_name),
       track        = COALESCE(excluded.track, email_leads.track),
       primary_goal = COALESCE(excluded.primary_goal, email_leads.primary_goal),
       user_id      = COALESCE(excluded.user_id, email_leads.user_id),
       last_seen_at = excluded.last_seen_at`,
    [
      email,
      input.firstName?.trim() || null,
      input.source,
      input.track ?? null,
      input.primaryGoal ?? null,
      input.userId ?? null,
      at,
      at,
    ],
  )

  return (await getLead(email))!
}

export async function getLead(email: string): Promise<EmailLead | null> {
  const db = await getEngine()
  const row = await db.get<Row>('SELECT * FROM email_leads WHERE email = ?', [
    normaliseEmail(email),
  ])
  return row ? toLead(row) : null
}

/**
 * Tie an address to an account.
 *
 * Called when someone signs up or signs in with an address we already hold, so
 * one preference governs the address however it arrived — a member who opts out
 * in the hub is out of the quiz list too, because both read the same row.
 */
export async function linkLeadToUser(email: string, userId: string): Promise<void> {
  const db = await getEngine()
  await db.run('UPDATE email_leads SET user_id = ? WHERE email = ?', [
    userId,
    normaliseEmail(email),
  ])
}

export interface ListLeadsOptions {
  source?: LeadSource
  track?: string
  /** Only addresses we may currently email. */
  marketableOnly?: boolean
  /** ISO date — leads first seen on or after it. */
  since?: string
  /** Case-insensitive substring of the address or name. */
  search?: string
  limit?: number
}

/**
 * The audience, newest first, each row carrying its permission state.
 *
 * Consent state is resolved per row rather than joined, because the authority on
 * suppression is the KV store the email footers write to, not this table. That
 * is two reads per lead and it is why `limit` exists — the hub pages, and the
 * export streams in one pass with its own bulk read.
 */
export async function listAudience(options: ListLeadsOptions = {}): Promise<AudienceMember[]> {
  const db = await getEngine()
  const where: string[] = []
  const params: unknown[] = []

  if (options.source) {
    where.push('source = ?')
    params.push(options.source)
  }
  if (options.track) {
    where.push('track = ?')
    params.push(options.track)
  }
  if (options.since) {
    where.push('first_seen_at >= ?')
    params.push(options.since)
  }
  if (options.search) {
    where.push('(LOWER(email) LIKE ? OR LOWER(COALESCE(first_name, \'\')) LIKE ?)')
    const like = `%${options.search.trim().toLowerCase()}%`
    params.push(like, like)
  }

  const rows = await db.all<Row>(
    `SELECT * FROM email_leads
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY last_seen_at DESC
     ${options.limit ? `LIMIT ${Math.max(1, Math.floor(options.limit))}` : ''}`,
    params,
  )

  const members = await Promise.all(
    rows.map(async (row) => ({ ...toLead(row), ...(await consentStateOf(row.email)) })),
  )

  return options.marketableOnly ? members.filter((m) => m.marketable) : members
}

/** Headline counts for the hub, over the whole table rather than a page of it. */
export async function audienceCounts(): Promise<{
  total: number
  marketable: number
  suppressed: number
  members: number
}> {
  const everyone = await listAudience()
  return {
    total: everyone.length,
    marketable: everyone.filter((m) => m.marketable).length,
    suppressed: everyone.filter((m) => m.suppressedAt != null || (!m.marketable && m.optedInAt != null)).length,
    members: everyone.filter((m) => m.userId != null).length,
  }
}

/** Remove an address entirely. The consent history is NOT touched — see `rights.ts`. */
export async function deleteLead(email: string): Promise<void> {
  const db = await getEngine()
  await db.run('DELETE FROM email_leads WHERE email = ?', [normaliseEmail(email)])
}

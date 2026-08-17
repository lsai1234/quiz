import crypto from 'crypto'
import { getEngine, now } from '@/lib/db/engine'

/**
 * Competition entries.
 *
 * ── An entry is not a share ─────────────────────────────────────────────────
 * One person may share five times and enter once; somebody may enter without
 * ever sharing, because the free entry route the CAP Code requires has to be of
 * equal standing. Modelling an entry as "a share that happened" makes the draw
 * unauditable, which is the one thing a prize draw cannot be — so entries are
 * their own rows, and `shareToken` is nullable.
 *
 * ── A stored card is not evidence ───────────────────────────────────────────
 * Anyone can post a crafted payload to `/api/share` and get a token back (it is
 * written down in that route). So an entry carrying a token is a *claim* that
 * somebody posted a card, and it enters `pending` until a person has looked. The
 * draw only ever runs over `verified`.
 *
 * Server-only.
 */

export type EntryChannel = 'instagram' | 'tiktok' | 'other'
export type EntryRoute = 'share' | 'free'
export type EntryState = 'pending' | 'verified' | 'rejected' | 'won'

export interface CompetitionEntry {
  id: string
  campaign: string
  shareToken: string | null
  handle: string
  channel: EntryChannel
  route: EntryRoute
  state: EntryState
  isTest: boolean
  note: string | null
  createdAt: string
}

interface Row {
  id: string
  campaign: string
  share_token: string | null
  handle: string
  channel: string
  route: string
  state: string
  is_test: number
  note: string | null
  created_at: string
}

const toEntry = (r: Row): CompetitionEntry => ({
  id: r.id,
  campaign: r.campaign,
  shareToken: r.share_token,
  handle: r.handle,
  channel: r.channel as EntryChannel,
  route: r.route as EntryRoute,
  state: r.state as EntryState,
  isTest: Number(r.is_test) === 1,
  note: r.note,
  createdAt: r.created_at,
})

/**
 * Normalise a social handle.
 *
 * Lowercased, `@` and a pasted profile URL both stripped — because the unique
 * index is what enforces one entry per person, and `@Jamie`, `jamie` and
 * `instagram.com/jamie/` are one person entering three times otherwise.
 */
export function normaliseHandle(input: string): string | null {
  const trimmed = input.trim().replace(/^https?:\/\/(www\.)?(instagram|tiktok)\.com\//i, '')
  const handle = trimmed.replace(/^@/, '').replace(/\/+$/, '').toLowerCase()
  if (!/^[a-z0-9._]{2,30}$/.test(handle)) return null
  return handle
}

export type EnterResult =
  | { ok: true; entry: CompetitionEntry }
  | { ok: false; reason: 'invalid-handle' | 'already-entered' }

export async function enterCompetition(input: {
  campaign: string
  handle: string
  channel: EntryChannel
  route: EntryRoute
  shareToken?: string | null
  isTest?: boolean
  note?: string | null
}): Promise<EnterResult> {
  const handle = normaliseHandle(input.handle)
  if (!handle) return { ok: false, reason: 'invalid-handle' }

  const db = await getEngine()
  const existing = await db.get<Row>(
    'SELECT * FROM competition_entries WHERE campaign = ? AND channel = ? AND handle = ?',
    [input.campaign, input.channel, handle],
  )
  // Answered rather than thrown: entering twice is a person pressing a button
  // twice, not an error, and the second press should say "you're already in".
  if (existing) return { ok: false, reason: 'already-entered' }

  const entry: CompetitionEntry = {
    id: crypto.randomUUID(),
    campaign: input.campaign,
    shareToken: input.shareToken ?? null,
    handle,
    channel: input.channel,
    route: input.route,
    // Never `verified` on creation. A stored card is a claim, not proof.
    state: 'pending',
    isTest: input.isTest ?? false,
    note: input.note ?? null,
    createdAt: now(),
  }

  await db.run(
    `INSERT INTO competition_entries
       (id, campaign, share_token, handle, channel, route, state, is_test, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [entry.id, entry.campaign, entry.shareToken, entry.handle, entry.channel,
     entry.route, entry.state, entry.isTest ? 1 : 0, entry.note, entry.createdAt],
  )

  return { ok: true, entry }
}

export async function listEntries(campaign: string): Promise<CompetitionEntry[]> {
  const db = await getEngine()
  const rows = await db.all<Row>(
    'SELECT * FROM competition_entries WHERE campaign = ? ORDER BY created_at DESC',
    [campaign],
  )
  return rows.map(toEntry)
}

export async function setEntryState(id: string, state: EntryState, note?: string | null): Promise<void> {
  const db = await getEngine()
  await db.run('UPDATE competition_entries SET state = ?, note = ? WHERE id = ?', [state, note ?? null, id])
}

/**
 * Draw a winner.
 *
 * Only from `verified`, and never from a test entry — a rehearsal row winning a
 * real draw is the failure this whole `is_test` column exists to prevent.
 *
 * The randomness is `crypto.randomInt`, not `Math.random`: this picks who gets
 * £200, and "we used a properly random draw" is a claim that has to survive
 * somebody asking how.
 */
export async function drawWinner(
  campaign: string,
  pick: (max: number) => number = (max) => crypto.randomInt(max),
): Promise<CompetitionEntry | null> {
  const db = await getEngine()
  const rows = await db.all<Row>(
    "SELECT * FROM competition_entries WHERE campaign = ? AND state = 'verified' AND is_test = 0 ORDER BY id",
    [campaign],
  )
  if (rows.length === 0) return null

  const winner = toEntry(rows[pick(rows.length)])
  await setEntryState(winner.id, 'won')
  return { ...winner, state: 'won' }
}

/** Counts for the Founders Hub, so it never has to tally in the browser. */
export async function entryCounts(campaign: string): Promise<Record<EntryState | 'test', number>> {
  const entries = await listEntries(campaign)
  return {
    pending: entries.filter((e) => e.state === 'pending' && !e.isTest).length,
    verified: entries.filter((e) => e.state === 'verified' && !e.isTest).length,
    rejected: entries.filter((e) => e.state === 'rejected' && !e.isTest).length,
    won: entries.filter((e) => e.state === 'won' && !e.isTest).length,
    test: entries.filter((e) => e.isTest).length,
  }
}

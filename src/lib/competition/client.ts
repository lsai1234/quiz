'use client'

import { share as shareEvents } from '@/lib/analytics/share'
/**
 * The competition, as this browser remembers it.
 *
 * Entering returns an entry id; sharing the card trades that id for the bonus.
 * The two happen on different components — the entry block at the foot of the
 * results page and the share sheet — and in either order, so the id lives here
 * rather than in either of them, and a share made *before* entering is held as
 * a flag and claimed the moment an email goes in.
 *
 * localStorage, wrapped: if it throws (private mode, blocked storage) entering
 * still works, the bonus just has to be claimed in the same visit.
 */

const ENTRY_KEY = 'chrgd_competition_entry'
const SHARED_KEY = 'chrgd_competition_shared'
/** Fired on `window` whenever the remembered entry changes. */
export const COMPETITION_EVENT = 'chrgd:competition'

export interface RememberedEntry {
  campaign: string
  id: string
  email: string
  tickets: number
  shared: boolean
}

/** `undefined` when storage itself is unavailable — distinct from "nothing stored". */
function read<T>(key: string): T | null | undefined {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return undefined
  }
}

function write(key: string, value: unknown): void {
  try {
    if (value === null) window.localStorage.removeItem(key)
    else window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage unavailable — fine for this visit */
  }
}

/** Only consulted when storage is unavailable, so the bonus can still be claimed this visit. */
let memory: RememberedEntry | null = null

export function rememberedEntry(campaign: string): RememberedEntry | null {
  const stored = read<RememberedEntry>(ENTRY_KEY)
  const entry = stored === undefined ? memory : stored
  return entry && entry.campaign === campaign ? entry : null
}

export function rememberEntry(entry: RememberedEntry): void {
  memory = entry
  write(ENTRY_KEY, entry)
  window.dispatchEvent(new Event(COMPETITION_EVENT))
}

/** A share went out before any email did. Held until there is an entry to credit. */
function sharedBeforeEntering(campaign: string): boolean {
  return read<string>(SHARED_KEY) === campaign
}

async function postBonus(entry: RememberedEntry): Promise<void> {
  try {
    const res = await fetch('/api/competition/bonus', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: entry.id }),
    })
    if (!res.ok) return
    const json = (await res.json()) as { tickets?: number }
    write(SHARED_KEY, null)
    shareEvents.competitionBonus()
    rememberEntry({ ...entry, shared: true, tickets: json.tickets ?? entry.tickets })
  } catch {
    /* network — the flag stays, and the next share or entry tries again */
  }
}

/**
 * The card was shared. Credit the bonus if they have entered, or hold it until
 * they do. Called by the share sheet for any campaign that is open.
 */
export async function noteCardShared(campaign: string): Promise<void> {
  const entry = rememberedEntry(campaign)
  if (entry?.shared) return
  if (!entry) {
    write(SHARED_KEY, campaign)
    window.dispatchEvent(new Event(COMPETITION_EVENT))
    return
  }
  await postBonus(entry)
}

/** Whether a share is waiting for an entry to land on. */
export function hasPendingShare(campaign: string): boolean {
  return sharedBeforeEntering(campaign)
}

/**
 * Enter with an email. Claims a held share straight after, so somebody who
 * shared first and entered second still gets the bonus.
 */
export async function enterByEmail(input: {
  campaign: string
  email: string
}): Promise<
  | { ok: true; entry: RememberedEntry; already: boolean }
  | { ok: false; reason: 'invalid-email' | 'closed' | 'error' }
> {
  try {
    const res = await fetch('/api/competition/enter', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      // The form says entering is agreeing to the terms, offers and news
      // included — so there is no separate yes to send, only this one.
      body: JSON.stringify({ email: input.email, agreedToTerms: true, route: 'quiz' }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      if (json.error === 'invalid-email') return { ok: false, reason: 'invalid-email' }
      if (res.status === 404 || res.status === 409) return { ok: false, reason: 'closed' }
      return { ok: false, reason: 'error' }
    }
    const entry: RememberedEntry = {
      campaign: input.campaign,
      id: json.id,
      email: input.email.trim().toLowerCase(),
      tickets: json.tickets ?? 1,
      shared: json.shared === true,
    }
    rememberEntry(entry)
    shareEvents.competitionEnter({ already: json.already === true })
    if (!entry.shared && sharedBeforeEntering(input.campaign)) await postBonus(entry)
    return { ok: true, entry: rememberedEntry(input.campaign) ?? entry, already: json.already === true }
  } catch {
    return { ok: false, reason: 'error' }
  }
}

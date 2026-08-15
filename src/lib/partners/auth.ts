/**
 * The partner auth realm — the third one, alongside customers (`hub_session`)
 * and founders (`portal_session`).
 *
 * Separate on purpose, and it is not a role flag on `users`. A partner is a
 * commercial counterparty, not a shopper: if they held a customer session then
 * one wrong guard lands a partner on `/hub` looking at somebody's subscription,
 * or a member on `/partner` looking at commission. The blast radius of a single
 * mistaken check is another person's data, and three cookies is a cheap price
 * for making that mistake impossible rather than unlikely.
 *
 * A partner who also wants to BUY signs up as a customer separately, with the
 * same email if they like. The two records are unrelated.
 *
 * The browser holds a random opaque token; only its SHA-256 hash is stored, so
 * a leaked database cannot be replayed as live logins.
 *
 * Server-only (next/headers, node crypto).
 */
import crypto from 'crypto'
import { cookies } from 'next/headers'
import { hashPassword, verifyPassword } from '@/lib/auth/password'
import { appBaseUrl, canSendFromHub } from '@/lib/notify'
import { sendPasswordReset } from '@/lib/notify/account'
import * as repo from './repo'
import type { Partner } from './types'

export const PARTNER_COOKIE = 'partner_session'

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days
/** Long enough to act on an email, short enough that a stale one is useless. */
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000

/**
 * A self-serve reset is a much shorter-lived thing than an invite.
 *
 * An invite is handed to a founder to pass on, and may sit in an inbox over a
 * weekend before anyone opens it. A reset was asked for by somebody staring at
 * a sign-in screen, so the window only has to cover finding the email — and a
 * week-long one is a week in which a forwarded message or a shared laptop is a
 * working credential.
 */
const RESET_TTL_MS = 60 * 60 * 1000
const RESET_TTL_WORDS = '60 minutes'

/** How many links one partner can ask for in an hour. */
const MAX_RESETS_PER_HOUR = 3

function hash(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

function newToken(): string {
  return crypto.randomBytes(32).toString('base64url')
}

// ─── Sessions ─────────────────────────────────────────────────────────────────

export async function startPartnerSession(partnerId: string): Promise<void> {
  const token = newToken()
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS)
  await repo.insertSession({ tokenHash: hash(token), partnerId, expiresAt: expiresAt.toISOString() })

  const jar = await cookies()
  jar.set(PARTNER_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    expires: expiresAt,
    path: '/',
  })
}

/**
 * The signed-in partner for this request, or null.
 *
 * A suspended partner is turned away here rather than at each screen. Suspension
 * stops their code working the same moment, so leaving them able to read their
 * dashboard would show a live-looking account that no longer earns.
 */
export async function getSessionPartner(): Promise<Partner | null> {
  const jar = await cookies()
  const token = jar.get(PARTNER_COOKIE)?.value
  if (!token) return null

  const partnerId = await repo.partnerIdForSession(hash(token))
  if (!partnerId) return null

  const partner = await repo.getPartner(partnerId)
  if (!partner || partner.status === 'suspended') return null
  return partner
}

export async function endPartnerSession(): Promise<void> {
  const jar = await cookies()
  const token = jar.get(PARTNER_COOKIE)?.value
  if (token) await repo.deleteSessionByHash(hash(token))
  jar.delete(PARTNER_COOKIE)
}

// ─── Signing in ───────────────────────────────────────────────────────────────

export type LoginResult = { ok: true; partner: Partner } | { ok: false; reason: string }

/**
 * Check an email and password.
 *
 * Every failure says the same thing. Distinguishing "no such partner" from
 * "wrong password" tells anyone who asks which of our partners exist, and the
 * programme's whole value to a partner is that their relationship with us is
 * theirs — enumerating them is not a small leak.
 */
export async function login(email: string, password: string): Promise<LoginResult> {
  const generic = 'That email and password do not match.'
  const partner = await repo.getPartnerByEmail(email ?? '')
  if (!partner) return { ok: false, reason: generic }

  const stored = await repo.getPartnerPasswordHash(partner.id)
  // An invited partner has no password yet. Same wording — the invite email is
  // how they get in, and saying "you have not set one" here would confirm the
  // address exists to anyone guessing.
  if (!verifyPassword(password ?? '', stored)) return { ok: false, reason: generic }

  if (partner.status === 'suspended') {
    // Worth being specific: they know they have an account, so a generic
    // refusal here just sends them to support to be told this anyway.
    return { ok: false, reason: 'This account is suspended. Get in touch and we will sort it out.' }
  }

  return { ok: true, partner }
}

// ─── Invites and resets ───────────────────────────────────────────────────────

/**
 * Mint a single-use link for a partner to set a password.
 *
 * Returns the raw token, which is the ONLY time it exists in readable form —
 * the store keeps its hash. Whoever calls this is responsible for getting it to
 * the partner; it is not recoverable afterwards, only reissued.
 */
export async function createInviteToken(
  partnerId: string,
  kind: 'invite' | 'reset' = 'invite',
  opts: { ttlMs?: number } = {},
): Promise<string> {
  const token = newToken()
  await repo.insertInvite({
    tokenHash: hash(token),
    partnerId,
    kind,
    expiresAt: new Date(Date.now() + (opts.ttlMs ?? INVITE_TTL_MS)).toISOString(),
  })
  return token
}

/**
 * A partner asking for their own reset link.
 *
 * The realm has always been able to MINT one of these — a founder pressing
 * "reissue" in the hub — but there was no way for a partner to ask, and the
 * sign-in screen told them to send an email and wait for somebody to be at a
 * desk. Their commission dashboard is not a thing to be locked out of on a
 * Sunday.
 *
 * Answers identically whatever happened, for the reason `login` gives: which
 * addresses are partners of ours is theirs to disclose, not ours. A suspended
 * partner is treated as unknown here rather than told — `login` already explains
 * suspension to anyone who can prove the account is theirs, and this endpoint
 * proves nothing.
 */
export async function requestPartnerPasswordReset(email: string): Promise<PartnerResetOutcome> {
  if (!canSendFromHub()) return 'unavailable'

  const partner = await repo.getPartnerByEmail(email ?? '')
  if (!partner || partner.status === 'suspended') return 'unknown'

  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  if ((await repo.countInvitesSince(partner.id, since, 'reset')) >= MAX_RESETS_PER_HOUR) {
    return 'throttled'
  }

  // Only the newest link works. Untouched: an outstanding `invite`, which is a
  // founder's onboarding link and not this endpoint's to cancel.
  await repo.invalidateInvites(partner.id, 'reset')

  const token = await createInviteToken(partner.id, 'reset', { ttlMs: RESET_TTL_MS })
  const sent = await sendPasswordReset({
    userId: null,
    email: partner.email,
    firstName: partner.name?.trim().split(/\s+/)[0] || null,
    resetUrl: `${appBaseUrl()}/partner/set-password?token=${encodeURIComponent(token)}`,
    expiresIn: RESET_TTL_WORDS,
    realm: 'partner',
  })
  return sent ? 'sent' : 'failed'
}

/** For the server log only — the route collapses all but `unavailable` into one answer. */
export type PartnerResetOutcome = 'sent' | 'unknown' | 'throttled' | 'failed' | 'unavailable'

/** Who a link belongs to, without spending it — so a form can greet them by name. */
export async function partnerForInvite(token: string): Promise<Partner | null> {
  const invite = await repo.findUsableInvite(hash(token))
  if (!invite) return null
  return repo.getPartner(invite.partnerId)
}

export type SetPasswordResult = { ok: true; partner: Partner } | { ok: false; reason: string }

/**
 * Spend a link and set the password.
 *
 * The invite is burnt BEFORE the password is written, and only the caller that
 * burnt it proceeds — so a link forwarded, replayed or opened in two tabs
 * cannot set a password twice. Every session the partner held is dropped
 * afterwards: a password change has to end sessions somebody else might be
 * holding, which is the entire reason to change one.
 */
export async function setPasswordWithToken(token: string, password: string): Promise<SetPasswordResult> {
  const weak = passwordProblem(password)
  if (weak) return { ok: false, reason: weak }

  const invite = await repo.findUsableInvite(hash(token))
  if (!invite) return { ok: false, reason: 'That link has expired or has already been used.' }

  if (!(await repo.consumeInvite(hash(token)))) {
    return { ok: false, reason: 'That link has expired or has already been used.' }
  }

  await repo.setPartnerPassword(invite.partnerId, hashPassword(password))
  await repo.deleteSessionsFor(invite.partnerId)

  const partner = await repo.getPartner(invite.partnerId)
  if (!partner) return { ok: false, reason: 'That account no longer exists.' }
  return { ok: true, partner }
}

/** Why a password is not acceptable, or null. */
export function passwordProblem(password: string): string | null {
  if (!password || password.length < 10) return 'Use at least 10 characters.'
  if (password.length > 200) return 'That is too long.'
  return null
}

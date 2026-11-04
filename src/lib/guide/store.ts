/**
 * Where guides live: one kv document each, `guide:<token>`. No schema change.
 *
 * The token is the only way in: 24 random characters (144 bits), unguessable,
 * and checked for shape before anything is read. A guide holds no email, no
 * address and no answers: products, times, claims and a first name.
 */
import { randomBytes } from 'node:crypto'
import { kvDelete, kvGet, kvSet } from '@/lib/db/kv'
import type { StackGuide } from './build'

const PREFIX = 'guide:'
const SHAPE = /^[A-Za-z0-9_-]{24}$/

export function newGuideToken(): string {
  return randomBytes(18).toString('base64url')
}

export function isGuideToken(token: string): boolean {
  return SHAPE.test(token)
}

export async function saveGuide(guide: StackGuide): Promise<void> {
  if (!isGuideToken(guide.token)) throw new Error('Invalid guide token')
  await kvSet(PREFIX + guide.token, guide)
}

export async function getGuide(token: string): Promise<StackGuide | null> {
  if (!isGuideToken(token)) return null
  const guide = await kvGet<StackGuide>(PREFIX + token)
  return guide && guide.v === 1 && guide.token === token ? guide : null
}

export async function deleteGuide(token: string): Promise<void> {
  if (isGuideToken(token)) await kvDelete(PREFIX + token)
}

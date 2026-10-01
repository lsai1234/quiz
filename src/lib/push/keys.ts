/**
 * The key pair that signs every push we send (VAPID).
 *
 * A push service — Apple's, for an iPhone — only delivers a message signed by
 * the same key the phone subscribed with, so this pair is what ties a founder's
 * phone to this site. It is not a credential for anything else: holding it lets
 * you send to devices whose subscription you also hold, and those live in the
 * same database.
 *
 * ── Generated once, stored, not typed into Vercel ───────────────────────────
 * The first founder to turn notifications on creates the pair, and it is kept in
 * the key-value store from then on. Asking two founders to run a key generator
 * and paste a 43-character secret into hosting settings is the step most likely
 * to stop this ever being switched on, and it buys nothing a database row does
 * not: the private key is no more sensitive than the subscriptions beside it.
 * `VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` still win when both are set, for
 * anyone who would rather hold it there.
 *
 * The pair must NEVER change once phones have subscribed: every existing
 * subscription is bound to the old public key and would be refused. Hence
 * create-if-missing, and nothing that regenerates.
 */
import { kvGet, kvSet } from '@/lib/db/kv'

export interface VapidKeys {
  publicKey: string
  privateKey: string
}

const KV_KEY = 'push:vapid'

function fromEnv(): VapidKeys | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim()
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim()
  return publicKey && privateKey ? { publicKey, privateKey } : null
}

/** The pair in use, or null when nobody has turned notifications on yet. */
export async function getVapidKeys(): Promise<VapidKeys | null> {
  const env = fromEnv()
  if (env) return env
  const stored = await kvGet<VapidKeys>(KV_KEY)
  return stored?.publicKey && stored.privateKey ? stored : null
}

/** The pair in use, made on first call. Only a founder turning a phone on calls this. */
export async function ensureVapidKeys(): Promise<VapidKeys> {
  const existing = await getVapidKeys()
  if (existing) return existing
  const { default: webpush } = await import('web-push')
  const keys = webpush.generateVAPIDKeys()
  await kvSet<VapidKeys>(KV_KEY, keys)
  return keys
}

/**
 * Who to contact about our pushes, which the push service asks for in every
 * signature. Apple refuses one that is not a `mailto:` or an `https:` URL, so a
 * `localhost` APP_URL falls through to the next option rather than being used.
 */
export function vapidSubject(): string {
  const explicit = process.env.VAPID_SUBJECT?.trim()
  if (explicit) return explicit
  const founder = process.env.FOUNDER_1_EMAIL?.trim()
  if (founder) return `mailto:${founder}`
  const app = process.env.APP_URL?.trim()
  if (app?.startsWith('https://')) return app
  return 'https://getchrgd.co.uk'
}

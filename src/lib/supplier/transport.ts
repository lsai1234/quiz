/**
 * Which PowerBody service code (`transport_code`) each order asks for.
 *
 * Every order is sent with the cheapest service that can carry its weight
 * (`lib/pricing/delivery.ts`): Royal Mail Tracked 48 up to 7 kg, DPD Two Day
 * above. `createOrder` takes the service as a code from
 * `dropshipping.getShippingMethod`, and the codes are the account's own, so
 * they are read from PowerBody rather than typed into the app:
 *
 *   detected  Settings → Supplier → Test the integration asks PowerBody for the
 *             account's services and picks each carrier's code by its name.
 *             Sending an order does the same once, if no code is known yet.
 *   set       A founder chose a code in Settings → Supplier, which a later
 *             detection never overwrites.
 *
 * With no code for a carrier the order goes with the field empty, as before,
 * and PowerBody choose.
 */
import { kvGet, kvSet } from '@/lib/db/kv'
import type { DeliveryCarrier } from '@/lib/stack-blueprint/pricing'
import type { SupplierShippingMethod } from './types'

export const CARRIERS: DeliveryCarrier[] = ['royal-mail', 'dpd', 'ups']

export interface CarrierCode {
  code: string | null
  /** Where it came from: read off the account's services, or chosen by a founder. */
  source: 'detected' | 'set' | null
}

export interface TransportCodes {
  codes: Record<DeliveryCarrier, CarrierCode>
  /** The account's services, as PowerBody last listed them. */
  methods: SupplierShippingMethod[]
  /** When PowerBody were last asked (ISO), whatever the answer. */
  checkedAt: string | null
}

const KEY = 'supplier-transport-codes'
/** How long a failed ask holds off the next one from the order path. */
const RETRY_MS = 60 * 60 * 1000

const empty = (): TransportCodes => ({
  codes: { 'royal-mail': { code: null, source: null }, dpd: { code: null, source: null }, ups: { code: null, source: null } },
  methods: [],
  checkedAt: null,
})

const NAMES: Record<DeliveryCarrier, { match: RegExp; prefer: RegExp }> = {
  'royal-mail': { match: /royal\s*mail|\brm\s*\d/i, prefer: /48/ },
  dpd: { match: /\bdpd\b/i, prefer: /two\s*day|2\s*day|48/i },
  ups: { match: /\bups\b/i, prefer: /standard|international/i },
}

/** Each carrier's code from the account's services, read by name. */
export function detectTransportCodes(methods: readonly SupplierShippingMethod[]): Record<DeliveryCarrier, string | null> {
  const pick = (carrier: DeliveryCarrier): string | null => {
    const { match, prefer } = NAMES[carrier]
    const hits = methods.filter((m) => match.test(`${m.name} ${m.code}`))
    return (hits.find((m) => prefer.test(`${m.name} ${m.code}`)) ?? hits[0])?.code ?? null
  }
  return { 'royal-mail': pick('royal-mail'), dpd: pick('dpd'), ups: pick('ups') }
}

export async function getTransportCodes(): Promise<TransportCodes> {
  const saved = await kvGet<TransportCodes | null>(KEY)
  if (!saved) return empty()
  const base = empty()
  return { ...base, ...saved, codes: { ...base.codes, ...(saved.codes ?? {}) } }
}

/**
 * Keep what PowerBody listed, and the codes read from it. A code a founder set
 * stays as it is.
 */
export async function rememberShippingMethods(methods: SupplierShippingMethod[], now = new Date()): Promise<TransportCodes> {
  const current = await getTransportCodes()
  const found = detectTransportCodes(methods)
  const codes = { ...current.codes }
  for (const c of CARRIERS) {
    if (codes[c].source === 'set') continue
    codes[c] = found[c] ? { code: found[c], source: 'detected' } : { code: null, source: null }
  }
  const next: TransportCodes = { codes, methods, checkedAt: now.toISOString() }
  await kvSet(KEY, next)
  return next
}

/** A founder's choice for one carrier; an empty code goes back to detection. */
export async function setTransportCode(carrier: DeliveryCarrier, code: string | null): Promise<TransportCodes> {
  const current = await getTransportCodes()
  const trimmed = code?.trim() || null
  const detected = trimmed ? null : detectTransportCodes(current.methods)[carrier]
  const next: TransportCodes = {
    ...current,
    codes: {
      ...current.codes,
      [carrier]: trimmed ? { code: trimmed, source: 'set' } : { code: detected, source: detected ? 'detected' : null },
    },
  }
  await kvSet(KEY, next)
  return next
}

/**
 * The code to send for this carrier, or null to leave it to PowerBody.
 *
 * With none known, `listMethods` (the live supplier's `shippingMethods`) is
 * asked once, and not again within the hour if that fails or finds nothing.
 * Never throws: a missing code sends the order as it always went.
 */
export async function transportCodeFor(
  carrier: DeliveryCarrier,
  listMethods?: (() => Promise<SupplierShippingMethod[]>) | null,
  now = new Date(),
): Promise<string | null> {
  try {
    const current = await getTransportCodes()
    if (current.codes[carrier].code) return current.codes[carrier].code
    if (!listMethods) return null
    if (current.checkedAt && now.getTime() - Date.parse(current.checkedAt) < RETRY_MS) return null
    const methods = await listMethods().catch(async () => {
      await kvSet(KEY, { ...current, checkedAt: now.toISOString() })
      return null
    })
    if (!methods) return null
    return (await rememberShippingMethods(methods, now)).codes[carrier].code
  } catch {
    return null
  }
}

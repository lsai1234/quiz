import { NextResponse } from 'next/server'
import { getFounder, isPortalAuthed } from '@/lib/portal/guard'
import { ensureVapidKeys, getVapidKeys } from '@/lib/push/keys'
import {
  deviceIdFor,
  deviceKind,
  getDevice,
  listDevices,
  parseSubscription,
  removeDevice,
  saveDevice,
} from '@/lib/push/devices'
import { getPushPrefs, setPushPrefs, type PushPrefs } from '@/lib/push/prefs'
import { sendToDevices } from '@/lib/push/send'
import { reviewCount } from '@/lib/push/badge'
import { listFounders } from '@/lib/portal/auth'

export const dynamic = 'force-dynamic'

/**
 * Order notifications, from Settings → Notifications.
 *
 * GET  → the devices, the shared preferences and the server's public key.
 * POST { action, … }:
 *   prepare      → { publicKey }, making the key pair the first time (see `lib/push/keys`)
 *   subscribe    { subscription } → this phone joins the list (or is refreshed on it)
 *   unsubscribe  { id } → a phone leaves it — this one, or one that was lost
 *   test         { id } → a sample notification to one phone
 *   prefs        { prefs } → which orders notify
 */
async function state() {
  const founders = listFounders()
  const nameOf = (email: string) => founders.find((f) => f.email === email)?.name ?? email
  const devices = (await listDevices()).map((d) => ({
    id: d.id,
    label: d.label,
    founder: nameOf(d.founderEmail),
    endpoint: d.endpoint,
    createdAt: d.createdAt,
    lastOkAt: d.lastOkAt,
    lastError: d.lastError,
    lastErrorAt: d.lastErrorAt,
  }))
  return {
    publicKey: (await getVapidKeys())?.publicKey ?? null,
    devices,
    prefs: await getPushPrefs(),
    reviewCount: await reviewCount(),
  }
}

export async function GET() {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json(await state())
}

export async function POST(req: Request) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  switch (body.action) {
    case 'prepare': {
      const keys = await ensureVapidKeys()
      return NextResponse.json({ publicKey: keys.publicKey })
    }

    case 'subscribe': {
      const subscription = parseSubscription(body.subscription)
      if (!subscription) {
        return NextResponse.json({ error: 'That is not a push subscription this hub can send to.' }, { status: 400 })
      }
      const founder = await getFounder()
      const email = founder?.email ?? 'founder'
      const name = founder?.name ?? 'Founder'
      // A quiet re-sync from `HubApp` refreshes a phone already on the list but
      // never adds one: a phone somebody removed stays removed until it is
      // turned on again, on purpose, from this page.
      // Nor does it touch one that has not changed — saving clears the last
      // error, and that error is the only clue when a phone stops receiving.
      if (body.quiet === true) {
        const known = await getDevice(deviceIdFor(subscription.endpoint))
        const same = known?.p256dh === subscription.keys.p256dh && known?.auth === subscription.keys.auth
        if (!known || same) return NextResponse.json({ ok: true, skipped: true })
      }
      const device = await saveDevice({
        founderEmail: email,
        label: `${name} · ${deviceKind(req.headers.get('user-agent'))}`,
        subscription,
      })
      return NextResponse.json({ ok: true, id: device.id, ...(await state()) })
    }

    case 'unsubscribe': {
      if (typeof body.id !== 'string') return NextResponse.json({ error: 'id is required' }, { status: 400 })
      await removeDevice(body.id)
      return NextResponse.json({ ok: true, ...(await state()) })
    }

    case 'test': {
      if (typeof body.id !== 'string') return NextResponse.json({ error: 'id is required' }, { status: 400 })
      const device = await getDevice(body.id)
      if (!device) return NextResponse.json({ error: 'That phone is no longer on the list.' }, { status: 404 })
      const count = await reviewCount()
      const result = await sendToDevices(
        {
          title: 'Notifications are on',
          body: `New orders will arrive like this on ${device.label}. ${count === 1 ? '1 order is' : `${count} orders are`} waiting for review.`,
          url: '/founderhub/commerce/queue',
          tag: 'test',
          badge: count,
        },
        (d) => d.id === device.id,
      )
      if (result.sent === 1) return NextResponse.json({ ok: true, ...(await state()) })
      const after = await getDevice(device.id)
      const reason = result.removed
        ? 'Apple says this phone is no longer subscribed. Turn notifications on again.'
        : `It did not go through: ${after?.lastError ?? 'no answer from the push service'}.`
      return NextResponse.json({ error: reason, ...(await state()) }, { status: 502 })
    }

    case 'prefs': {
      const prefs = await setPushPrefs((body.prefs ?? {}) as Partial<PushPrefs>)
      return NextResponse.json({ ok: true, prefs })
    }

    default:
      return NextResponse.json(
        { error: 'action must be prepare | subscribe | unsubscribe | test | prefs' },
        { status: 400 },
      )
  }
}

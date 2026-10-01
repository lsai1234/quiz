'use client'

import { useCallback, useEffect, useState } from 'react'
import { Badge, Button, Card, Checkbox, Note } from '@/components/system'
import { formatStamp } from './OrdersList'
import {
  currentSubscription,
  hubWorker,
  isAppleMobile,
  isInstalledApp,
  keyBytes,
  pushSupported,
} from './hub-app'

/**
 * Settings → Notifications: turn order notifications on for the phone in your
 * hand, choose what notifies, and see every phone that gets them.
 *
 * Most of this screen is about getting to the one button. On an iPhone, push
 * only exists inside the hub once it is on the Home Screen, so in a Safari tab
 * the page says how to get there instead of offering a button that cannot work.
 */

interface Device {
  id: string
  label: string
  founder: string
  endpoint: string
  createdAt: string
  lastOkAt: string | null
  lastError: string | null
  lastErrorAt: string | null
}

interface Prefs {
  orders: boolean
  subscribers: boolean
  renewals: boolean
}

interface State {
  publicKey: string | null
  devices: Device[]
  prefs: Prefs
  reviewCount: number
}

/** Where the phone in your hand stands. */
type Phase = 'loading' | 'install' | 'unsupported' | 'blocked' | 'off' | 'on'

const eyebrow = {
  fontSize: 'var(--text-micro)',
  fontWeight: 'var(--weight-strong)',
  fontFamily: 'var(--font-display)',
  letterSpacing: 'var(--tracking-eyebrow)',
  textTransform: 'uppercase',
  color: 'var(--ink-3)',
  marginBottom: 'var(--space-2)',
} as const

const body = {
  fontSize: 'var(--text-body-sm)',
  lineHeight: 'var(--leading-loose)',
  color: 'var(--ink-2)',
} as const

const meta = {
  fontSize: 'var(--text-meta)',
  lineHeight: 'var(--leading-snug)',
  color: 'var(--ink-3)',
} as const

const PHASE_BADGE: Record<Phase, { tone: 'neutral' | 'positive' | 'attention' | 'critical'; text: string }> = {
  loading: { tone: 'neutral', text: 'Checking…' },
  install: { tone: 'attention', text: 'Add to Home Screen first' },
  unsupported: { tone: 'neutral', text: 'Not available in this browser' },
  blocked: { tone: 'critical', text: 'Blocked' },
  off: { tone: 'neutral', text: 'Off' },
  on: { tone: 'positive', text: 'On' },
}

async function post(payload: Record<string, unknown>) {
  const res = await fetch('/api/portal/push', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const json = await res.json().catch(() => ({}))
  return { ok: res.ok, json }
}

/** Whether a subscription was made with this key — one made with an old key cannot be sent to. */
function madeWith(sub: PushSubscription, publicKey: string): boolean {
  const used = sub.options.applicationServerKey
  if (!used) return false
  const a = new Uint8Array(used)
  const b = keyBytes(publicKey)
  return a.length === b.length && a.every((v, i) => v === b[i])
}

export function NotificationSettings() {
  const [state, setState] = useState<State | null>(null)
  const [phase, setPhase] = useState<Phase>('loading')
  const [mine, setMine] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch('/api/portal/push').catch(() => null)
    const next: State | null = res?.ok ? await res.json() : null
    if (next) setState(next)

    if (!pushSupported()) {
      setPhase(isAppleMobile() && !isInstalledApp() ? 'install' : 'unsupported')
      return
    }
    if (Notification.permission === 'denied') {
      setPhase('blocked')
      return
    }
    const sub = await currentSubscription()
    const device = sub && next?.devices.find((d) => d.endpoint === sub.endpoint)
    setMine(device ? device.id : null)
    setPhase(device ? 'on' : 'off')
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function sendTest(id: string) {
    setBusy('test')
    setError(null)
    setSent(false)
    const { ok, json } = await post({ action: 'test', id })
    if (json.devices) setState(json)
    if (ok) setSent(true)
    else setError(json.error ?? 'The test did not go through.')
    setBusy(null)
  }

  async function turnOn() {
    setBusy('on')
    setError(null)
    setSent(false)
    try {
      // First, while the tap still counts as a tap: iOS only shows the
      // permission prompt in direct response to one.
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setPhase(permission === 'denied' ? 'blocked' : 'off')
        return
      }
      const prepared = await post({ action: 'prepare' })
      if (!prepared.ok || !prepared.json.publicKey) throw new Error(prepared.json.error ?? 'The hub could not set up notifications.')
      const publicKey: string = prepared.json.publicKey

      const reg = await hubWorker()
      if (!reg) throw new Error('This browser would not start the hub’s background worker.')
      let sub = await reg.pushManager.getSubscription()
      if (sub && !madeWith(sub, publicKey)) {
        await sub.unsubscribe()
        sub = null
      }
      sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) })

      const saved = await post({ action: 'subscribe', subscription: sub.toJSON() })
      if (!saved.ok) throw new Error(saved.json.error ?? 'The hub did not save this phone.')
      setState(saved.json)
      setMine(saved.json.id)
      setPhase('on')
      // The proof it works, straight away, rather than waiting for a customer.
      await sendTest(saved.json.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Notifications could not be turned on.')
    } finally {
      setBusy(null)
    }
  }

  async function remove(id: string) {
    setBusy(`remove:${id}`)
    setError(null)
    setSent(false)
    if (id === mine) {
      const sub = await currentSubscription()
      await sub?.unsubscribe().catch(() => {})
    }
    const { ok, json } = await post({ action: 'unsubscribe', id })
    if (ok) {
      setState(json)
      if (id === mine) {
        setMine(null)
        setPhase('off')
      }
    } else {
      setError(json.error ?? 'That phone could not be removed.')
    }
    setBusy(null)
  }

  async function savePrefs(patch: Partial<Prefs>) {
    if (!state) return
    const prefs = { ...state.prefs, ...patch }
    setState({ ...state, prefs })
    const { ok, json } = await post({ action: 'prefs', prefs })
    if (ok) setState((s) => (s ? { ...s, prefs: json.prefs } : s))
    else setError(json.error ?? 'That setting did not save.')
  }

  const badge = PHASE_BADGE[phase]

  return (
    <div style={{ display: 'grid', gap: 'var(--space-6)' }}>
      <Card elevation={1} as="section">
        <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
          <div className="flex items-center justify-between flex-wrap" style={{ gap: 'var(--space-2)' }}>
            <h2 style={{ ...eyebrow, marginBottom: 0 }}>This phone</h2>
            <Badge tone={badge.tone} dot>
              {badge.text}
            </Badge>
          </div>

          {phase === 'install' && (
            <>
              <p style={body}>
                On an iPhone, notifications only reach the hub once it is on your Home Screen.
              </p>
              <ol style={{ ...body, paddingLeft: 'var(--space-5)', listStyle: 'decimal', display: 'grid', gap: 'var(--space-1)' }}>
                <li>Tap Share in Safari. On iOS 26, tap the ⋯ button first, then Share.</li>
                <li>Tap Add to Home Screen. If you see Open as Web App, leave it on. Then tap Add.</li>
                <li>Open CHRGD Hub from your Home Screen, sign in, and come back to this page.</li>
              </ol>
            </>
          )}

          {phase === 'unsupported' && (
            <p style={body}>
              This browser cannot receive notifications. Open the hub from its Home Screen icon on
              your iPhone instead.
            </p>
          )}

          {phase === 'blocked' && (
            <p style={body}>
              Notifications are blocked for the hub. On your iPhone, open Settings → Notifications →
              CHRGD Hub and switch on Allow Notifications, then come back here.
            </p>
          )}

          {phase === 'off' && (
            <>
              <p style={body}>
                Turn on to get a notification here for every new order. Your phone will ask to
                allow notifications — tap Allow.
              </p>
              <div>
                <Button variant="primary" size="md" loading={busy === 'on'} disabled={busy !== null} onClick={() => void turnOn()} icon="bell">
                  Turn on notifications
                </Button>
              </div>
            </>
          )}

          {phase === 'on' && mine && (
            <>
              <p style={body}>New orders notify this phone, and its icon shows how many are waiting for review.</p>
              <div className="flex flex-wrap" style={{ gap: 'var(--space-2)' }}>
                <Button size="sm" loading={busy === 'test'} disabled={busy !== null} onClick={() => void sendTest(mine)}>
                  Send a test
                </Button>
                <Button variant="ghost" size="sm" loading={busy === `remove:${mine}`} disabled={busy !== null} onClick={() => void remove(mine)}>
                  Turn off for this phone
                </Button>
              </div>
            </>
          )}

          {sent && !error && (
            <Note tone="positive" icon="check" live="polite">
              Sent. It should arrive in a few seconds.
            </Note>
          )}
          {error && (
            <Note tone="critical" icon="alert-triangle" live="assertive">
              {error}
            </Note>
          )}
        </div>
      </Card>

      <Card elevation={1} as="section">
        <h2 style={eyebrow}>What notifies you</h2>
        {state ? (
          <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
            <Checkbox
              label="New orders"
              hint="Shop and quiz, including free orders from founder codes and partner starters."
              checked={state.prefs.orders}
              onChange={(e) => void savePrefs({ orders: e.target.checked })}
            />
            <Checkbox
              label="New subscribers"
              hint="A new member’s first box, with what they pay each month."
              checked={state.prefs.subscribers}
              onChange={(e) => void savePrefs({ subscribers: e.target.checked })}
            />
            <Checkbox
              label="Subscription renewals"
              hint="One for every member, every month."
              checked={state.prefs.renewals}
              onChange={(e) => void savePrefs({ renewals: e.target.checked })}
            />
            <p style={meta}>
              The same for both of you. A checkout nobody paid for never notifies. Lock-screen
              notifications show the amount, the first item and the order reference — never the
              customer’s name or address.
            </p>
          </div>
        ) : (
          <p style={meta}>Loading…</p>
        )}
      </Card>

      <section>
        <h2 style={eyebrow}>Phones getting notifications</h2>
        {state && state.devices.length === 0 && (
          <p style={meta}>None yet. Each of you turns notifications on from your own phone.</p>
        )}
        <ul style={{ display: 'grid', gap: 'var(--space-2)', margin: 0, padding: 0, listStyle: 'none' }}>
          {state?.devices.map((d) => (
            <Card key={d.id} as="li" solid padding="tight">
              <div className="flex items-start justify-between" style={{ gap: 'var(--space-3)' }}>
                <div className="min-w-0" style={{ display: 'grid', gap: 'var(--space-1)' }}>
                  <div className="flex items-center flex-wrap" style={{ gap: 'var(--space-2)' }}>
                    <span style={{ fontSize: 'var(--text-body-sm)', fontWeight: 'var(--weight-strong)', fontFamily: 'var(--font-display)', color: 'var(--ink-1)' }}>
                      {d.label}
                    </span>
                    {d.id === mine && <Badge tone="accent">This phone</Badge>}
                  </div>
                  <span style={meta}>
                    {d.lastOkAt ? `Last notified ${formatStamp(d.lastOkAt)}` : `Added ${formatStamp(d.createdAt)}`}
                  </span>
                  {d.lastError && (
                    <span style={{ ...meta, color: 'var(--tone-critical)' }}>
                      Last one failed{d.lastErrorAt ? ` (${formatStamp(d.lastErrorAt)})` : ''}: {d.lastError}
                    </span>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  loading={busy === `remove:${d.id}`}
                  disabled={busy !== null}
                  onClick={() => void remove(d.id)}
                >
                  Remove
                </Button>
              </div>
            </Card>
          ))}
        </ul>
      </section>

      {state && (
        <p style={meta}>
          The number on the hub’s icon is the orders waiting for review — {state.reviewCount} right
          now. It updates when an order arrives and whenever you open the hub.
        </p>
      )}
    </div>
  )
}

'use client'

import { useState } from 'react'
import { Button, Card, Input, Note } from '@/components/system'
import { HUB_COPY as C } from '@/lib/hub/copy'
import type { HubHome } from '@/lib/hub/home-types'
import { body, col, meta, SectionHead, strong } from './ui'

/** Their orders, newest first: reference, date, total, what was in it. */
export function OrdersSection({ orders }: { orders: HubHome['orders'] }) {
  return (
    <section data-orders>
      <SectionHead title={C.ordersTitle} />
      {orders.length === 0 ? (
        <p style={meta}>{C.ordersEmpty}</p>
      ) : (
        <Card padding="none">
          <ul>
            {orders.map((o, i) => (
              <li key={o.reference} style={{ padding: 'var(--space-4)', borderTop: i === 0 ? 'none' : '1px solid var(--edge)' }}>
                <p style={{ ...strong, fontSize: 'var(--text-body-sm)' }}>
                  {C.orderLine(o.reference, new Date(o.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }), o.total)}
                </p>
                <p style={meta}>{o.items.join(', ')}</p>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </section>
  )
}

/** An order made under another email joins this account, by a code sent to that inbox. */
export function LinkOrder({ onLinked }: { onLinked: () => void }) {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [stage, setStage] = useState<'ask' | 'code' | 'done'>('ask')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ tone: 'positive' | 'critical' | 'neutral'; text: string } | null>(null)

  async function send(payload: unknown) {
    setBusy(true)
    setMessage(null)
    try {
      const res = await fetch('/api/hub/link-order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      return { ok: res.ok, data: (await res.json().catch(() => ({}))) as { linked?: number; reason?: string } }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div data-link-order>
      <Card padding="normal">
        <div style={col('var(--space-3)')}>
          <p style={strong}>{C.linkTitle}</p>
          <p style={body}>{C.linkBody}</p>
          {stage === 'ask' && (
            <div className="flex items-end" style={{ gap: 'var(--space-2)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Input label={C.linkEmail} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <Button
                variant="secondary"
                loading={busy}
                disabled={!/\S+@\S+\.\S+/.test(email)}
                onClick={async () => {
                  await send({ email })
                  setStage('code')
                  setMessage({ tone: 'neutral', text: C.linkSent(email) })
                }}
              >
                {C.linkSend}
              </Button>
            </div>
          )}
          {stage === 'code' && (
            <div className="flex items-end" style={{ gap: 'var(--space-2)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Input label={C.linkCode} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
              </div>
              <Button
                variant="primary"
                loading={busy}
                disabled={code.length !== 6}
                onClick={async () => {
                  const r = await send({ code })
                  if (r.ok) {
                    setStage('done')
                    setMessage({ tone: 'positive', text: C.linkDone(r.data.linked ?? 0) })
                    onLinked()
                  } else setMessage({ tone: 'critical', text: r.data.reason === 'tries' || r.data.reason === 'expired' ? C.linkTooMany : C.linkWrong })
                }}
              >
                {C.linkConfirm}
              </Button>
            </div>
          )}
          {message && (
            <Note tone={message.tone} live="polite">
              {message.text}
            </Note>
          )}
        </div>
      </Card>
    </div>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { Card, Checkbox } from '@/components/system'

/**
 * "Do you want to hear from us?" — in the hub, where a member can find it.
 *
 * Withdrawing consent has to be as easy as giving it (UK GDPR Art. 7(3)), and
 * "as easy" cannot mean "go and find an old email and click the small link at
 * the bottom". A member who is already signed in and looking at their plan
 * should be able to change their mind where they are.
 *
 * It says what cannot be turned off, in the same breath and without being
 * asked. Somebody who believes they have switched off their receipts is a
 * support ticket, and the way to prevent it is to be plain the first time.
 */
export function EmailPreferences() {
  const [optedIn, setOptedIn] = useState<boolean | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/hub/marketing')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setOptedIn(d.optedIn === true))
      .catch(() => setOptedIn(null))
  }, [])

  // Nothing to show until we know the answer — a checkbox that flips from
  // unticked to ticked as the request lands looks like the page changing it.
  if (optedIn === null) return null

  async function change(next: boolean) {
    setSaving(true)
    setOptedIn(next)
    try {
      const res = await fetch('/api/hub/marketing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ optedIn: next }),
      })
      if (!res.ok) setOptedIn(!next)
    } catch {
      setOptedIn(!next)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card padding="normal" data-reveal>
      <p className="text-sm font-bold text-[var(--ink-1)]" style={{ fontFamily: 'var(--font-display)' }}>
        Email
      </p>
      <div className="mt-3">
        <Checkbox
          label="Tips, offers and new products"
          hint="Not often, and never shared with anyone. Change your mind any time."
          checked={optedIn}
          disabled={saving}
          onChange={(e) => change(e.target.checked)}
        />
      </div>
      <p className="text-xs text-[var(--ink-3)] mt-3 leading-relaxed">
        Either way you&rsquo;ll still get the emails that are part of your plan — receipts, anything
        that changes on it, price notices and anything about a payment. Those are the record of what
        you&rsquo;ve bought, so we can&rsquo;t stop sending them.
      </p>
    </Card>
  )
}

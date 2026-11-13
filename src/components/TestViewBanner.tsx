'use client'

import { useEffect, useState } from 'react'
import { testViewOpen } from '@/lib/samples/domain'

/**
 * While a founder has a test view open (Settings → Test views), every page in
 * that browser says so, with the way out. Renders nothing otherwise.
 */
export function TestViewBanner() {
  const [open, setOpen] = useState(false)
  useEffect(() => setOpen(testViewOpen()), [])
  if (!open) return null

  async function leave() {
    await fetch('/api/test-view/leave', { method: 'POST' }).catch(() => null)
    window.location.assign('/founderhub/settings/test-views')
  }

  return (
    <div
      role="status"
      data-test-view-banner
      style={{
        position: 'fixed',
        left: '50%',
        // Clear of the member hub's tab bar where there is one (`--bottom-chrome`).
        bottom: 'calc(env(safe-area-inset-bottom) + var(--space-3) + var(--bottom-chrome, 0px))',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-3)',
        padding: 'var(--space-2) var(--space-2) var(--space-2) var(--space-4)',
        borderRadius: '999px',
        background: 'var(--tone-attention)',
        color: 'var(--ground-base)',
        fontSize: 'var(--text-meta)',
        fontWeight: 'var(--weight-strong)',
        boxShadow: 'var(--shadow-raised)',
        whiteSpace: 'nowrap',
        // Only "Leave" takes a tap: the label never sits between a thumb and
        // the page's own controls.
        pointerEvents: 'none',
      }}
    >
      <span>Test view · sample data</span>
      <button
        type="button"
        onClick={() => void leave()}
        style={{ borderRadius: '999px', padding: 'var(--space-1) var(--space-3)', background: 'color-mix(in srgb, black 18%, transparent)', color: 'inherit', fontWeight: 'inherit', fontSize: 'inherit', pointerEvents: 'auto' }}
      >
        Leave
      </button>
    </div>
  )
}

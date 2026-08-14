'use client'

import type { ReactNode } from 'react'
import { CHRGDLogo } from '@/components/brand/CHRGDLogo'
import { IconButton } from '@/components/ui/IconButton'
import { GLASS } from '@/lib/ui/tokens'

/**
 * The chrome around the hub.
 *
 * There wasn't any. `/myhub` renders a component into a bare page, so the one
 * screen a paying member returns to had no brand mark, no header, and a naked
 * underlined "Sign out" floating beside the greeting. The shop has had a proper
 * shell all along (`ShopShell`); this is the hub's.
 *
 * Deliberately thin: a mark, a title, and the one account action. The hub is a
 * single screen with sheets over it, so a nav would be furniture for its own
 * sake.
 */
export function HubShell({
  children,
  onSignOut,
}: {
  children: ReactNode
  /** Omitted while signed out — there is nothing to sign out of. */
  onSignOut?: () => void
}) {
  return (
    <div className="min-h-screen" style={{ background: 'var(--color-bg)' }}>
      <header
        className="sticky top-0 z-30"
        style={{
          background: 'color-mix(in srgb, var(--color-bg) 82%, transparent)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderBottom: `1px solid ${GLASS.hairline}`,
        }}
      >
        <div className="max-w-lg mx-auto px-5 h-14 flex items-center justify-between gap-3">
          <CHRGDLogo markSize={20} wordClassName="text-base" />
          {onSignOut && <IconButton icon="log-out" label="Sign out" size="sm" onClick={onSignOut} className="-mr-2" />}
        </div>
      </header>

      <main className="max-w-lg mx-auto px-5 pt-6 pb-20">{children}</main>
    </div>
  )
}

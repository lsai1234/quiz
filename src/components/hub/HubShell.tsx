'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { CHRGDLogo } from '@/components/brand/CHRGDLogo'
import { Button, Ground, buttonSurface } from '@/components/system'

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
const NAV = [
  { id: 'home', href: '/myhub', label: 'Home' },
  { id: 'training', href: '/myhub/training', label: 'Training' },
] as const

export function HubShell({
  children,
  onSignOut,
  nav,
  wide = false,
}: {
  children: ReactNode
  /** The home's two columns on a wide screen: a wider page, header and all. */
  wide?: boolean
  /** Omitted while signed out — there is nothing to sign out of. */
  onSignOut?: () => void
  /** Which part of the hub this is, for the header's links; none while signed out. */
  nav?: (typeof NAV)[number]['id']
}) {
  return (
    // `my-hub` is the region class the focus floor in `system.css` hangs off,
    // the same safety net the Founders Hub roots carry. See `my-hub.test.ts`.
    <Ground className="my-hub">
      {/* One of the three surfaces allowed to blur: persistent chrome over a
          page that does not move under it. */}
      <header
        className="sticky top-0 z-30"
        style={{
          background: 'var(--surface-2)',
          backdropFilter: 'blur(var(--blur-nav)) saturate(var(--blur-saturate))',
          WebkitBackdropFilter: 'blur(var(--blur-nav)) saturate(var(--blur-saturate))',
          borderBottom: '1px solid var(--edge)',
        }}
      >
        <div
          className={`${wide ? 'max-w-2xl lg:max-w-5xl' : 'max-w-2xl'} mx-auto flex items-center justify-between`}
          style={{ padding: 'var(--space-3) var(--gutter)', gap: 'var(--space-3)' }}
        >
          <Link href="/myhub" aria-label="Your member hub">
            <CHRGDLogo markSize={20} wordClassName="text-base" />
          </Link>
          <div className="flex items-center" style={{ gap: 'var(--space-1)' }}>
            {nav && (
              <nav aria-label="Member hub" className="flex items-center" style={{ gap: 'var(--space-1)' }}>
                {NAV.map((n) => {
                  const surface = buttonSurface(n.id === nav ? 'secondary' : 'ghost', 'sm')
                  return (
                    <Link key={n.id} href={n.href} aria-current={n.id === nav ? 'page' : undefined} className={surface.className} style={surface.style} data-hub-nav={n.id}>
                      {n.label}
                    </Link>
                  )
                })}
              </nav>
            )}
            {onSignOut && (
              <Button variant="ghost" size="sm" icon="log-out" aria-label="Sign out" onClick={onSignOut} />
            )}
          </div>
        </div>
      </header>

      <main
        className={`${wide ? 'max-w-2xl lg:max-w-5xl' : 'max-w-2xl'} mx-auto`}
        style={{ padding: 'var(--space-6) var(--gutter) var(--space-8)' }}
      >
        {children}
      </main>
    </Ground>
  )
}

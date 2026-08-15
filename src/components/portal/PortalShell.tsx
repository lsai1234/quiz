'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Badge, Button, Ground } from '@/components/system'

/**
 * The top bar is deliberately short. Fifteen tabs is a filing cabinet, not a
 * navigation — everything about the range now lives under Products and
 * everything about money under Commerce, each with its own sub-nav.
 *
 * ── Why the tabs are links and not `Tabs` ───────────────────────────────────
 * The design system has a `Tabs` primitive, and it is the wrong thing here.
 * These navigate: each one is a route with its own URL, its own back-button
 * entry, and a middle-click that should open a new tab. `Tabs` renders
 * `role="tab"` buttons inside a `role="tablist"`, which tells a screen reader
 * that the panels are all present and being switched between — a lie about a
 * router, and one that costs the user their ability to open a section in a new
 * tab. So these stay `<Link>`s, styled from tokens.
 *
 * `Tabs` is for switching panels inside one page. See DESIGN.md.
 */

const NAV = [
  { href: '/founderhub', label: 'Dashboard' },
  { href: '/founderhub/commerce', label: 'Commerce' },
  { href: '/founderhub/products', label: 'Products' },
  { href: '/founderhub/pricing', label: 'Pricing' },
  { href: '/founderhub/partners', label: 'Partners' },
  { href: '/founderhub/actions', label: 'Requires action' },
  { href: '/founderhub/emails', label: 'Emails' },
  { href: '/founderhub/settings', label: 'Settings' },
]

export function PortalShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [source, setSource] = useState<{ mode: string; effective: string } | null>(null)
  const [founder, setFounder] = useState<{ name: string } | null>(null)

  useEffect(() => {
    fetch('/api/portal/data-source').then((r) => (r.ok ? r.json() : null)).then((d) => d && setSource(d)).catch(() => {})
  }, [pathname])

  useEffect(() => {
    fetch('/api/portal/me').then((r) => (r.ok ? r.json() : null)).then((d) => d?.founder && setFounder(d.founder)).catch(() => {})
  }, [])

  async function logout() {
    await fetch('/api/portal/logout', { method: 'POST' })
    window.location.href = '/founderhub'
  }

  return (
    <Ground>
      {/* One of the three surfaces allowed to blur: persistent chrome over a
          static page, which is what `backdrop-filter` is worth paying for. */}
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
          className="max-w-3xl mx-auto flex items-center justify-between"
          style={{ padding: 'var(--space-3) var(--gutter)', gap: 'var(--space-3)' }}
        >
          <span
            style={{
              fontSize: 'var(--text-body)',
              fontWeight: 'var(--weight-display)',
              fontFamily: 'var(--font-display)',
              letterSpacing: 'var(--tracking-display)',
              color: 'var(--ink-1)',
            }}
          >
            CHRGD <span style={{ color: 'var(--accent)' }}>Founders Hub</span>
          </span>
          <div className="flex items-center" style={{ gap: 'var(--space-3)' }}>
            {founder && (
              <span
                className="hidden sm:inline"
                style={{
                  fontSize: 'var(--text-meta)',
                  fontWeight: 'var(--weight-strong)',
                  color: 'var(--ink-3)',
                }}
              >
                {founder.name}
              </span>
            )}
            {source && (
              <Badge tone={source.effective === 'real' ? 'accent' : 'neutral'} dot>
                {source.effective === 'real' ? 'Real catalogue' : 'Mock catalogue'}
              </Badge>
            )}
            <Button variant="ghost" size="sm" onClick={logout}>Sign out</Button>
          </div>
        </div>

        <nav
          className="max-w-3xl mx-auto flex overflow-x-auto scrollbar-hide"
          style={{ padding: '0 var(--gutter)', gap: 'var(--space-1)' }}
          aria-label="Founders Hub sections"
        >
          {NAV.map((n) => {
            const active = n.href === '/founderhub' ? pathname === '/founderhub' : pathname.startsWith(n.href)
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? 'page' : undefined}
                className="system-control system-focus relative shrink-0 whitespace-nowrap"
                style={{
                  padding: 'var(--space-3) var(--space-3)',
                  fontSize: 'var(--text-body-sm)',
                  fontWeight: 'var(--weight-strong)',
                  fontFamily: 'var(--font-display)',
                  letterSpacing: 'var(--tracking-title)',
                  color: active ? 'var(--ink-1)' : 'var(--ink-3)',
                  background: active ? 'var(--surface-1)' : 'transparent',
                  borderRadius: 'var(--radius-chip) var(--radius-chip) 0 0',
                  ['--rest-shadow' as string]: 'var(--shadow-none)',
                  ['--hover-bg' as string]: 'var(--surface-hover)',
                  ['--hover-shadow' as string]: 'var(--shadow-none)',
                }}
              >
                {n.label}
                {/* Its own element rather than a bottom border, so it can carry a
                    bloom — a 2px accent line is a line; the same line with light
                    coming off it is a filament. */}
                <span
                  aria-hidden
                  className={`absolute inset-x-0 bottom-0 ${active ? 'system-tab-glow' : ''}`}
                  style={{
                    height: '2px',
                    borderRadius: 'var(--radius-pill)',
                    background: active ? 'var(--fill-accent)' : 'transparent',
                    opacity: active ? 1 : 0,
                    transition: 'opacity var(--duration-base) var(--ease-settle)',
                  }}
                />
              </Link>
            )
          })}
        </nav>
      </header>

      <main className="max-w-3xl mx-auto" style={{ padding: 'var(--space-6) var(--gutter) var(--space-8)' }}>
        {children}
      </main>
    </Ground>
  )
}

'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'

export interface SubNavItem {
  href: string
  label: string
  /** Match only this exact path — for a section's index page. */
  exact?: boolean
}

/**
 * The second level of navigation inside a hub tab.
 *
 * The hub is two big areas — Products and Commerce — and everything under one
 * of them is a view of the same thing rather than a separate destination. A
 * sub-nav says that out loud, and keeps the top bar down to the handful of
 * places you actually switch between.
 *
 * Links rather than the `Tabs` primitive, for the same reason as the top bar:
 * these are routes, and `role="tab"` would tell a screen reader the panels are
 * all present and being switched between. See `PortalShell`.
 */
export function SubNav({ items, title, blurb }: { items: SubNavItem[]; title: string; blurb?: string }) {
  const pathname = usePathname()

  return (
    <div style={{ marginBottom: 'var(--space-6)' }}>
      <h1
        style={{
          fontSize: 'var(--text-display)',
          fontWeight: 'var(--weight-display)',
          fontFamily: 'var(--font-display)',
          letterSpacing: 'var(--tracking-display)',
          lineHeight: 'var(--leading-tight)',
          color: 'var(--ink-1)',
        }}
      >
        {title}
      </h1>
      {blurb && (
        <p
          style={{
            fontSize: 'var(--text-body)',
            lineHeight: 'var(--leading-loose)',
            color: 'var(--ink-3)',
            marginTop: 'var(--space-2)',
            maxWidth: '42rem',
          }}
        >
          {blurb}
        </p>
      )}
      <nav
        className="flex overflow-x-auto scrollbar-hide"
        style={{ gap: 'var(--space-2)', marginTop: 'var(--space-4)' }}
        aria-label={`${title} views`}
      >
        {items.map((item) => {
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className="system-control system-focus shrink-0 whitespace-nowrap"
              style={{
                padding: 'var(--space-2) var(--space-4)',
                fontSize: 'var(--text-body-sm)',
                fontWeight: 'var(--weight-strong)',
                fontFamily: 'var(--font-display)',
                borderRadius: 'var(--radius-pill)',
                // The selected view is a solid accent chip; the rest are glass.
                // One filled pill in a row of hairlines is unmistakable at a
                // glance, which is the whole job of a sub-nav.
                background: active ? 'var(--fill-accent)' : 'var(--fill-glass)',
                color: active ? 'var(--ink-on-accent)' : 'var(--ink-2)',
                border: `1px solid ${active ? 'transparent' : 'var(--edge)'}`,
                borderTopColor: active ? 'transparent' : 'var(--edge-top)',
                ['--rest-shadow' as string]: active
                  ? 'var(--inset-highlight), var(--glow-accent)'
                  : 'var(--inset-hairline)',
                ['--hover-bg' as string]: active ? 'var(--fill-accent)' : 'var(--surface-hover)',
                ['--hover-edge' as string]: active ? 'transparent' : 'var(--edge-strong)',
                ['--hover-shadow' as string]: active
                  ? 'var(--inset-highlight), var(--glow-accent-strong)'
                  : 'var(--inset-hairline), var(--shadow-card)',
              }}
            >
              {item.label}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}

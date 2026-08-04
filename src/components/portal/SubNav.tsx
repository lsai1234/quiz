'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'

const ACCENT = '#00D4FF'

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
 */
export function SubNav({ items, title, blurb }: { items: SubNavItem[]; title: string; blurb?: string }) {
  const pathname = usePathname()

  return (
    <div className="mb-5">
      <h1 className="text-2xl font-black" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>{title}</h1>
      {blurb && <p className="text-sm text-[var(--color-muted)] mt-0.5">{blurb}</p>}
      <nav className="flex gap-1.5 overflow-x-auto mt-3 -mx-1 px-1">
        {items.map((item) => {
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className="px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-colors"
              style={{
                background: active ? ACCENT : 'var(--color-surface-2)',
                color: active ? 'var(--color-bg)' : 'var(--color-muted)',
                border: '1px solid var(--color-border)',
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

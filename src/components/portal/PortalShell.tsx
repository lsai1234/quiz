'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { useEffect, useState } from 'react'

const ACCENT = '#00D4FF'

const NAV = [
  { href: '/portal', label: 'Home' },
  { href: '/portal/dashboard', label: 'Dashboard' },
  { href: '/portal/orders', label: 'Orders' },
  { href: '/portal/actions', label: 'Requires action' },
  { href: '/portal/subscriptions', label: 'Subscriptions' },
  { href: '/portal/emails', label: 'Emails' },
  { href: '/portal/products', label: 'Products' },
  { href: '/portal/supplier', label: 'PowerBody' },
  { href: '/portal/bundles', label: 'Bundles' },
  { href: '/portal/backlog', label: 'Backlog' },
  { href: '/portal/import', label: 'Import' },
  { href: '/portal/pricing', label: 'Pricing' },
  { href: '/portal/coverage', label: 'Coverage' },
  { href: '/portal/readiness', label: 'Readiness' },
  { href: '/portal/settings', label: 'Settings' },
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
    window.location.href = '/portal'
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--color-bg)' }}>
      {/* Top bar */}
      <header className="sticky top-0 z-10 border-b border-[var(--color-border)]" style={{ background: 'var(--color-surface)' }}>
        <div className="max-w-3xl mx-auto px-5 py-3 flex items-center justify-between gap-3">
          <span className="text-sm font-black" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
            CHRGD <span style={{ color: ACCENT }}>Founders Hub</span>
          </span>
          <div className="flex items-center gap-3">
            {founder && <span className="text-[11px] font-semibold text-[var(--color-muted)] hidden sm:inline">{founder.name}</span>}
            {source && (
              <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-full"
                style={{
                  color: source.effective === 'shopify' ? ACCENT : 'var(--color-muted)',
                  background: source.effective === 'shopify' ? `color-mix(in srgb, ${ACCENT} 14%, transparent)` : 'var(--color-surface-2)',
                  border: '1px solid var(--color-border)',
                }}>
                {source.effective === 'shopify' ? '● Live Shopify' : '● Mock data'}
              </span>
            )}
            <button onClick={logout} className="text-xs font-semibold text-[var(--color-muted)] underline">Sign out</button>
          </div>
        </div>
        <nav className="max-w-3xl mx-auto px-5 flex gap-1 overflow-x-auto">
          {NAV.map((n) => {
            const active = n.href === '/portal' ? pathname === '/portal' : pathname.startsWith(n.href)
            return (
              <Link
                key={n.href}
                href={n.href}
                className="px-3 py-2.5 text-xs font-bold whitespace-nowrap border-b-2 transition-colors"
                style={{
                  color: active ? 'var(--color-text)' : 'var(--color-muted)',
                  borderColor: active ? ACCENT : 'transparent',
                  fontFamily: 'var(--font-display)',
                }}
              >
                {n.label}
              </Link>
            )
          })}
        </nav>
      </header>

      <main className="max-w-3xl mx-auto px-5 py-6">{children}</main>
    </div>
  )
}

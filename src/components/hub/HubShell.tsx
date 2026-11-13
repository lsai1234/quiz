'use client'

import Link from 'next/link'
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { CHRGDLogo } from '@/components/brand/CHRGDLogo'
import { Button, Ground, buttonSurface } from '@/components/system'
import { Icon, type IconName } from '@/components/ui/Icon'
import { useOfferSettings } from '@/hooks/useOfferSettings'
import { trainerLive } from '@/lib/offer/settings'

/**
 * The chrome around the hub.
 *
 * On a phone the hub is an app: the brand mark rides at the top of the page
 * and scrolls away with it, and the three places a member goes sit in a glass
 * tab bar at the thumb. On a wide screen the same three are links in a sticky
 * glass header, where a pointer reaches them.
 *
 * Only one of the two is ever chrome: the header blurs from `md` up, the tab
 * bar below it, so the hub stays inside the three-blur budget with a sheet
 * open (see DESIGN.md, "The cap").
 */
const NAV = [
  { id: 'home', href: '/myhub', label: 'Home', icon: 'home' },
  { id: 'training', href: '/myhub/training', label: 'Training', icon: 'dumbbell' },
  { id: 'trainer', href: '/myhub/trainer', label: 'Trainer', icon: 'chat' },
] as const satisfies readonly { id: string; href: string; label: string; icon: IconName }[]

type NavId = (typeof NAV)[number]['id']

/**
 * Where the tab bar's light last sat. Each hub page mounts its own shell, so
 * the bar is new on every navigation; remembering the last tab lets the light
 * start there and slide to the new one, as if the bar had never left.
 */
let lastTab: NavId | null = null

function TabBar({ tabs, current }: { tabs: readonly (typeof NAV)[number][]; current: NavId }) {
  const index = Math.max(0, tabs.findIndex((t) => t.id === current))
  const [at, setAt] = useState(() => {
    const from = tabs.findIndex((t) => t.id === lastTab)
    return from >= 0 ? from : index
  })
  useEffect(() => {
    lastTab = current
    // After the first paint, so the slide from the last tab is seen.
    const frame = requestAnimationFrame(() => setAt(index))
    return () => cancelAnimationFrame(frame)
  }, [current, index])

  return (
    <nav aria-label="Member hub" className="hub-tabbar system-glass" data-hub-tabbar style={{ ['--tabs' as string]: tabs.length, ['--tab-at' as string]: at } as CSSProperties}>
      <span aria-hidden className="hub-tabbar-light" />
      {tabs.map((t) => {
        const on = t.id === current
        return (
          <Link key={t.id} href={t.href} aria-current={on ? 'page' : undefined} className="hub-tab system-focus" data-on={on} data-hub-tab={t.id}>
            <Icon name={t.icon} size={22} />
            <span>{t.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}

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
  nav?: NavId
}) {
  // The trainer's tab only while there's a trainer to ask.
  const { settings } = useOfferSettings()
  const trainerOn = trainerLive(settings)
  const tabs = NAV.filter((n) => n.id !== 'trainer' || trainerOn || nav === 'trainer')
  return (
    // `my-hub` is the region class the focus floor in `system.css` hangs off,
    // the same safety net the Founders Hub roots carry. See `my-hub.test.ts`.
    <Ground className="my-hub hub-app">
      <header className="hub-header">
        <div
          className={`${wide ? 'max-w-2xl lg:max-w-5xl' : 'max-w-2xl'} mx-auto flex items-center justify-between`}
          style={{ padding: 'var(--space-3) var(--gutter)', gap: 'var(--space-3)' }}
        >
          <Link href="/myhub" aria-label="Your member hub">
            <CHRGDLogo markSize={20} wordClassName="text-base" />
          </Link>
          <div className="flex items-center" style={{ gap: 'var(--space-1)' }}>
            {nav && (
              <nav aria-label="Member hub" className="hub-header-nav items-center" style={{ gap: 'var(--space-1)' }}>
                {tabs.map((n) => {
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

      <main className={`hub-main ${nav ? 'hub-main-tabbed' : ''} ${wide ? 'max-w-2xl lg:max-w-5xl' : 'max-w-2xl'} mx-auto`}>{children}</main>

      {nav && <TabBar tabs={tabs} current={nav} />}
    </Ground>
  )
}

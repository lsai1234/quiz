'use client'

import { Skeleton } from '@/components/system'

/**
 * What the hub shows while the session is coming back.
 *
 * It used to show the login screen. `HubPage` rendered `HubLogin` whenever there
 * was no session yet — which is also true for the entire hydration round-trip —
 * so a signed-in member got "Sign in to manage your stack" flashing at them on
 * every single load, then the dashboard. That reads as being logged out.
 *
 * Mirrors the loaded layout at matching heights, the way `ShopShell`'s skeleton
 * does, so the swap doesn't shove the page around when the real content lands.
 */
export function HubSkeleton() {
  const card = { background: 'var(--surface-1)', border: `1px solid var(--edge)` }

  return (
    <div aria-hidden>
      {/* Greeting */}
      <Skeleton width={96} height={10} radius="var(--radius-chip)" />
      <Skeleton width={168} height={26} radius="var(--radius-chip)" className="mt-2.5" />

      {/* Next box hero */}
      <div className="rounded-3xl p-5 mt-5" style={card}>
        <Skeleton width={140} height={10} radius="var(--radius-chip)" />
        <Skeleton width="72%" height={24} radius="var(--radius-chip)" className="mt-2.5" />
        <Skeleton width="54%" height={12} radius="var(--radius-chip)" className="mt-2.5" />
        <div className="flex gap-2 mt-4">
          <Skeleton height={44} radius="var(--radius-row)" className="flex-1" />
          <Skeleton width={92} height={44} radius="var(--radius-row)" />
        </div>
      </div>

      {/* Billing summary */}
      <div className="rounded-2xl p-5 mt-5" style={card}>
        <div className="flex items-center justify-between">
          <Skeleton width={104} height={10} radius="var(--radius-chip)" />
          <Skeleton width={72} height={18} radius="var(--radius-chip)" />
        </div>
        <Skeleton height={10} radius="var(--radius-chip)" className="mt-3" />
        <Skeleton width="82%" height={10} radius="var(--radius-chip)" className="mt-2" />
      </div>

      {/* Delivery rail */}
      <div className="flex gap-3 mt-6 overflow-hidden">
        {[0, 1, 2].map((i) => (
          <div key={i} className="w-36 shrink-0 rounded-2xl p-3.5" style={card}>
            <Skeleton width={44} height={10} radius="var(--radius-chip)" />
            <Skeleton width={58} height={30} radius="var(--radius-chip)" className="mt-2.5" />
            <Skeleton height={10} radius="var(--radius-chip)" className="mt-3" />
          </div>
        ))}
      </div>

      {/* Stack */}
      <Skeleton width={80} height={10} radius="var(--radius-chip)" className="mt-7" />
      <div className="flex flex-col gap-3 mt-3">
        {[0, 1].map((i) => (
          <div key={i} className="rounded-2xl p-4" style={card}>
            <div className="flex items-start gap-3">
              <Skeleton width={56} height={56} radius="var(--radius-row)" />
              <div className="flex-1">
                <Skeleton width="70%" height={14} radius="var(--radius-chip)" />
                <Skeleton width="42%" height={10} radius="var(--radius-chip)" className="mt-2" />
                <Skeleton width="54%" height={10} radius="var(--radius-chip)" className="mt-2" />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <Skeleton height={40} radius="var(--radius-row)" className="flex-1" />
              <Skeleton width={88} height={40} radius="var(--radius-row)" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

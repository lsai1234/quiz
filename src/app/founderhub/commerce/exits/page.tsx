import { ExitsPage } from '@/components/portal/ExitsPage'

/**
 * Where subscriptions go when they end.
 *
 * A settlement that was invoiced and declined is money owed on a plan nobody
 * would otherwise open again, so it needs a queue of its own — and the "owed"
 * figure at the top is the honest measure of whether the exit charge is working
 * at all. A large one means we are billing balances we cannot collect, which is
 * worse than not billing them.
 */
export default function Page() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-black" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
          Exits
        </h2>
        <p className="text-sm text-[var(--color-muted)] mt-0.5">
          Every plan that has ended, what it settled, and what is still outstanding.
        </p>
        <p className="text-[11px] text-[var(--color-muted)] mt-1">
          Waiving and writing off both take a note — they are decisions, and someone will ask about them later.
        </p>
      </div>
      <ExitsPage />
    </div>
  )
}

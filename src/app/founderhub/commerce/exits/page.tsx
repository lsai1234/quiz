import { ExitsPage } from '@/components/portal/ExitsPage'

/**
 * Where subscriptions go when they end.
 *
 * A settlement that was invoiced and declined is money owed on a plan nobody
 * would otherwise open again, so it needs a queue of its own — and the "owed"
 * figure at the top is the honest measure of whether the exit charge is working
 * at all. A large one means we are billing balances we cannot collect, which is
 * worse than not billing them.
 *
 * Returns are here too, and are the more urgent half. A member who cancelled
 * inside their 14 days and posted their box back is owed money and waiting for
 * it, and until someone opens the parcel nobody can say how much. "Returns
 * coming" is the ceiling on that; each one opens a tick-list of exactly what we
 * sent, so the refund is decided against the goods rather than from memory.
 */
export default function Page() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-black" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
          Exits &amp; returns
        </h2>
        <p className="text-sm text-[var(--color-muted)] mt-0.5">
          Every plan that has ended, what it settled, what is still outstanding, and every parcel on its way back.
        </p>
        <p className="text-[11px] text-[var(--color-muted)] mt-1">
          Waiving, writing off and settling a return all take a note — they are decisions, and someone will ask
          about them later.
        </p>
      </div>
      <ExitsPage />
    </div>
  )
}

'use client'

interface Props {
  oneOffPrice: number
  subscriptionPrice: number
  savingsSummary: string
  onCheckout?: () => void
  onCustomise?: () => void
}

export function StackPriceSummary({ oneOffPrice, subscriptionPrice, savingsSummary, onCheckout, onCustomise }: Props) {
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-2)] overflow-hidden">
      <div className="p-5">
        {/* Price rows */}
        <div className="space-y-2 mb-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-[var(--color-text-2)]">One-off total</span>
            <span className="text-sm font-bold text-[var(--color-text)]">£{oneOffPrice.toFixed(2)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-[var(--color-text-2)]">With subscription</span>
            <span
              className="text-sm font-black"
              style={{ color: 'var(--color-accent)' }}
            >
              £{subscriptionPrice.toFixed(2)}/mo
            </span>
          </div>
        </div>

        {/* Saving callout */}
        <div
          className="px-3 py-2 rounded-xl text-xs font-semibold mb-5 text-center"
          style={{
            color: 'var(--color-accent)',
            background: 'color-mix(in srgb, var(--color-accent) 8%, transparent)',
          }}
        >
          {savingsSummary}
        </div>

        {/* CTAs */}
        <div className="space-y-2">
          <button
            onClick={onCheckout}
            className="w-full py-4 rounded-2xl text-sm font-bold tracking-wide bg-[var(--color-accent)] text-[var(--color-bg)] active:scale-95 transition-all"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Continue to Checkout →
          </button>
          <button
            onClick={onCustomise}
            className="w-full py-3 rounded-2xl text-sm font-semibold border border-[var(--color-border)] text-[var(--color-muted)] active:scale-95 transition-all"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Customise Stack
          </button>
        </div>
      </div>
    </div>
  )
}

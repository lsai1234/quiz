'use client'

import { customerDeliveryCharge, deriveFreeDeliveryThreshold } from '@/lib/pricing/delivery'
import type { PricingConfig, CustomerDeliveryRate } from '@/lib/stack-blueprint/pricing'


/**
 * What WE charge the member for delivery, editable — the mirror of `RateCard`,
 * which is what PowerBody charge US.
 *
 * Shown as its own ladder next to theirs rather than as a single number, because
 * the whole point of the shape is that the two ladders line up. A founder
 * setting the free line at £60 while our own cost does not drop until £100 of
 * retail cannot see the mistake in a lone "£3.95" input; they can see it in two
 * tables side by side, which is what this is for.
 *
 * The live basket preview under it prices a real order through both ladders, so
 * "what do we actually absorb here" is answered on the page.
 */
export function CustomerRates({
  config,
  orderValue,
  onChange,
  onSurchargeChange,
}: {
  config: PricingConfig
  /** The retail basket being modelled, so the applicable rung is marked. */
  orderValue: number
  onChange: (rates: CustomerDeliveryRate[]) => void
  onSurchargeChange: (surcharge: number) => void
}) {
  const rates = [...config.delivery.customerRates].sort(
    (a, b) => (a.maxOrderValue ?? Infinity) - (b.maxOrderValue ?? Infinity),
  )
  const applicableIndex = rates.findIndex((r) => r.maxOrderValue == null || orderValue < r.maxOrderValue)
  const freeAbove = deriveFreeDeliveryThreshold(config)
  const hasFreeBand = rates.some((r) => r.price === 0)

  const update = (index: number, patch: Partial<CustomerDeliveryRate>) =>
    onChange(rates.map((r, i) => (i === index ? { ...r, ...patch } : r)))

  const remove = (index: number) => onChange(rates.filter((_, i) => i !== index))

  const add = () => onChange([...rates, { maxOrderValue: 200, price: 1.95 }])

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[11px] font-bold text-[var(--ink-1)]">What the member pays</p>
        <p className="text-[10px]" style={{ color: 'var(--accent)' }}>
          £{orderValue.toFixed(2)} basket → £{customerDeliveryCharge(orderValue, 'uk-1', config).toFixed(2)} mainland ·
          £{customerDeliveryCharge(orderValue, 'uk-2', config).toFixed(2)} Highlands
        </p>
      </div>

      <div className="space-y-1">
        {rates.map((rate, index) => {
          const isApplicable = index === applicableIndex
          return (
            <div
              key={index}
              className="flex items-center gap-1.5 rounded-lg px-2 py-1.5"
              style={{
                background: isApplicable ? `var(--accent-fill)` : 'var(--surface-2)',
                border: `1px solid ${isApplicable ? `var(--accent-line)` : 'var(--edge)'}`,
              }}
            >
              <span className="text-[10px] text-[var(--ink-3)] flex-1">basket under £</span>
              <input
                type="number"
                value={rate.maxOrderValue ?? ''}
                placeholder="∞"
                onChange={(e) =>
                  update(index, { maxOrderValue: e.target.value === '' ? null : parseFloat(e.target.value) || 0 })
                }
                className="w-16 px-1 py-0.5 rounded text-[11px] text-right outline-none"
                style={{ background: 'var(--surface-1)', border: '1px solid var(--edge)', color: 'var(--ink-1)' }}
                aria-label="Basket value ceiling (blank for no limit)"
              />
              <span className="text-[10px] text-[var(--ink-3)]">retail · pays £</span>
              <input
                type="number"
                step="0.01"
                value={rate.price}
                onChange={(e) => update(index, { price: parseFloat(e.target.value) || 0 })}
                className="w-14 px-1 py-0.5 rounded text-[11px] text-right outline-none"
                style={{ background: 'var(--surface-1)', border: '1px solid var(--edge)', color: 'var(--ink-1)' }}
                aria-label="What the member pays, inc VAT"
              />
              <button
                onClick={() => remove(index)}
                className="text-[var(--ink-3)] text-xs px-0.5"
                aria-label="Remove this band"
              >
                ✕
              </button>
            </div>
          )
        })}
      </div>

      <div className="flex items-center gap-1.5 rounded-lg px-2 py-1.5" style={{ background: 'var(--surface-2)', border: '1px solid var(--edge)' }}>
        <span className="text-[10px] text-[var(--ink-3)] flex-1">Highlands &amp; Islands surcharge · £</span>
        <input
          type="number"
          step="0.01"
          value={config.delivery.zone2Surcharge}
          onChange={(e) => onSurchargeChange(parseFloat(e.target.value) || 0)}
          className="w-14 px-1 py-0.5 rounded text-[11px] text-right outline-none"
          style={{ background: 'var(--surface-1)', border: '1px solid var(--edge)', color: 'var(--ink-1)' }}
          aria-label="Zone 2 surcharge, inc VAT"
        />
      </div>

      <button onClick={add} className="text-xs font-bold" style={{ color: 'var(--accent)' }}>+ Add a band</button>

      {hasFreeBand ? (
        <p className="text-[10px] text-[var(--ink-3)] leading-snug">
          Free delivery above <strong>£{freeAbove.toFixed(2)}</strong> — derived from the last paid band, and what the
          storefront advertises. Banded on the basket SUBTOTAL before any discount, so a basket can&apos;t lose the perk
          by earning one. The surcharge applies on top of every band, the free one included: PowerBody&apos;s Zone 2
          free line is £300 of wholesale, so our cost never actually goes away up there.
        </p>
      ) : (
        <p className="text-[10px] leading-snug" style={{ color: 'var(--tone-critical)' }}>
          No band is priced at £0, so delivery is never free. Set the open-ended top band to £0 to offer it.
        </p>
      )}
    </div>
  )
}

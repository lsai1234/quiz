'use client'

import { ZONE_LABELS, selectService } from '@/lib/pricing/delivery'
import type { PricingConfig, DeliveryService, DeliveryZone } from '@/lib/stack-blueprint/pricing'

const ACCENT = '#00D4FF'
const RED = '#f87171'

const ZONES: DeliveryZone[] = ['uk-1', 'uk-2', 'eu']

/**
 * PowerBody's delivery rate card, editable.
 *
 * Shown as a table of weight bands rather than a list of numbers because that
 * is what it is: the thing that decides which row applies is the parcel's
 * weight, and a founder needs to see the cliff between £3.25 and £5.17 to
 * understand why a 7kg order prices differently.
 */
export function RateCard({
  config,
  grams,
  onChange,
}: {
  config: PricingConfig
  /** The weight currently being modelled, so the applicable row can be marked. */
  grams: number
  onChange: (services: DeliveryService[]) => void
}) {
  const update = (id: string, patch: Partial<DeliveryService>) =>
    onChange(config.delivery.services.map((s) => (s.id === id ? { ...s, ...patch } : s)))

  const remove = (id: string) => onChange(config.delivery.services.filter((s) => s.id !== id))

  const add = () =>
    onChange([
      ...config.delivery.services,
      { id: `svc-${Date.now()}`, name: 'New service', zone: 'uk-1', minGrams: 0, maxGrams: 1000, price: 0 },
    ])

  return (
    <div className="space-y-3">
      {ZONES.map((zone) => {
        const services = config.delivery.services.filter((s) => s.zone === zone)
        const applicable = selectService(grams, zone, config)
        return (
          <div key={zone}>
            <div className="flex items-baseline justify-between gap-2 mb-1">
              <p className="text-[11px] font-bold text-[var(--color-text)]">{ZONE_LABELS[zone]}</p>
              {applicable ? (
                <p className="text-[10px]" style={{ color: ACCENT }}>
                  {grams}g → {applicable.name} at £{applicable.price.toFixed(2)}
                </p>
              ) : (
                <p className="text-[10px]" style={{ color: RED }}>no service carries {grams}g</p>
              )}
            </div>

            {services.length === 0 && <p className="text-[10px] text-[var(--color-muted)]">No services for this zone.</p>}

            <div className="space-y-1">
              {services.map((s) => {
                const isApplicable = applicable?.id === s.id
                return (
                  <div
                    key={s.id}
                    className="flex items-center gap-1.5 rounded-lg px-2 py-1.5"
                    style={{
                      background: isApplicable ? `color-mix(in srgb, ${ACCENT} 8%, transparent)` : 'var(--color-surface-2)',
                      border: `1px solid ${isApplicable ? `color-mix(in srgb, ${ACCENT} 35%, transparent)` : 'var(--color-border)'}`,
                    }}
                  >
                    <input
                      value={s.name}
                      onChange={(e) => update(s.id, { name: e.target.value })}
                      className="flex-1 min-w-0 bg-transparent text-[11px] outline-none text-[var(--color-text)]"
                      aria-label="Service name"
                    />
                    <input
                      type="number"
                      value={s.minGrams}
                      onChange={(e) => update(s.id, { minGrams: parseInt(e.target.value) || 0 })}
                      className="w-14 px-1 py-0.5 rounded text-[11px] text-right outline-none"
                      style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
                      aria-label="Minimum grams"
                    />
                    <span className="text-[10px] text-[var(--color-muted)]">–</span>
                    <input
                      type="number"
                      value={s.maxGrams}
                      onChange={(e) => update(s.id, { maxGrams: parseInt(e.target.value) || 0 })}
                      className="w-16 px-1 py-0.5 rounded text-[11px] text-right outline-none"
                      style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
                      aria-label="Maximum grams"
                    />
                    <span className="text-[10px] text-[var(--color-muted)]">g · £</span>
                    <input
                      type="number"
                      step="0.01"
                      value={s.price}
                      onChange={(e) => update(s.id, { price: parseFloat(e.target.value) || 0 })}
                      className="w-14 px-1 py-0.5 rounded text-[11px] text-right outline-none"
                      style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
                      aria-label="Price ex VAT"
                    />
                    <button onClick={() => remove(s.id)} className="text-[var(--color-muted)] text-xs px-0.5" aria-label={`Remove ${s.name}`}>✕</button>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      <button onClick={add} className="text-xs font-bold" style={{ color: ACCENT }}>+ Add a service</button>
      <p className="text-[10px] text-[var(--color-muted)] leading-snug">
        Prices are ex VAT, as PowerBody quote them. Bands are (min, max] so a weight sitting exactly on a boundary
        lands in the lower band. The cheapest service that can carry the weight is the one they&apos;ll use.
      </p>
    </div>
  )
}

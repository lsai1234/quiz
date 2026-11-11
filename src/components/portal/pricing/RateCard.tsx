'use client'

import { CARRIER_LABELS, ZONE_LABELS, selectService } from '@/lib/pricing/delivery'
import type { PricingConfig, DeliveryCarrier, DeliveryService, DeliveryZone } from '@/lib/stack-blueprint/pricing'
import { Button, Input, Select } from '@/components/system'


const ZONES: DeliveryZone[] = ['uk-1', 'uk-2', 'eu']
const CARRIERS = Object.keys(CARRIER_LABELS) as DeliveryCarrier[]

/**
 * PowerBody's delivery rate card, editable.
 *
 * Shown as a table of services by weight because that is what it is: each
 * service takes parcels up to a weight, and a parcel goes with the cheapest
 * one that can carry it. The service it goes with is marked for the parcel
 * being modelled, so the step from Royal Mail to DPD over 7 kg is visible.
 */
export function RateCard({
  config,
  grams,
  onChange,
}: {
  config: PricingConfig
  /** The parcel weight being modelled (g), so the service it goes with is marked. */
  grams: number
  onChange: (services: DeliveryService[]) => void
}) {
  const update = (id: string, patch: Partial<DeliveryService>) =>
    onChange(config.delivery.services.map((s) => (s.id === id ? { ...s, ...patch } : s)))

  const remove = (id: string) => onChange(config.delivery.services.filter((s) => s.id !== id))

  const add = () =>
    onChange([
      ...config.delivery.services,
      { id: `svc-${Date.now()}`, name: 'New service', zone: 'uk-1', maxGrams: 7000, price: 0, carrier: 'royal-mail' },
    ])

  const kg = (g: number) => `${(g / 1000).toFixed(g < 1000 ? 2 : 1)} kg`

  return (
    <div className="space-y-3">
      {ZONES.map((zone) => {
        const services = config.delivery.services.filter((s) => s.zone === zone)
        const applicable = selectService(grams, zone, config)
        return (
          <div key={zone}>
            <div className="flex items-baseline justify-between gap-2 mb-1">
              <p className="text-[11px] font-bold text-[var(--ink-1)]">{ZONE_LABELS[zone]}</p>
              {applicable ? (
                <p className="text-[10px]" style={{ color: 'var(--accent)' }}>
                  {kg(grams)} parcel → {applicable.name}, £{applicable.price.toFixed(2)}
                </p>
              ) : (
                <p className="text-[10px]" style={{ color: 'var(--tone-critical)' }}>nothing takes {kg(grams)}</p>
              )}
            </div>

            {services.length === 0 && <p className="text-[10px] text-[var(--ink-3)]">No services for this zone.</p>}

            <div className="space-y-1">
              {services.map((s) => {
                const isApplicable = applicable?.id === s.id
                return (
                  <div
                    key={s.id}
                    className="flex flex-wrap items-center gap-1.5 rounded-lg px-2 py-1.5"
                    style={{
                      background: isApplicable ? `var(--accent-fill)` : 'var(--surface-2)',
                      border: `1px solid ${isApplicable ? `var(--accent-line)` : 'var(--edge)'}`,
                    }}
                  >
                    <Input
                      label={`Name of delivery service ${s.name || 'unnamed'}`}
                      compact
                      className="flex-1 min-w-0"
                      value={s.name}
                      onChange={(e) => update(s.id, { name: e.target.value })}
                    />
                    <Select
                      label={`Which PowerBody service ${s.name || 'this'} is`}
                      compact
                      value={s.carrier}
                      onChange={(e) => update(s.id, { carrier: e.target.value as DeliveryCarrier })}
                    >
                      {CARRIERS.map((c) => (
                        <option key={c} value={c}>
                          {CARRIER_LABELS[c]}
                        </option>
                      ))}
                    </Select>
                    <span style={{ fontSize: 'var(--text-micro)', color: 'var(--ink-3)' }}>up to</span>
                    <Input
                      label={`Heaviest parcel ${s.name || 'this service'} takes, in kg — blank for no limit`}
                      compact
                      align="right"
                      suffix="kg"
                      className="w-24"
                      type="number"
                      step="0.01"
                      value={s.maxGrams == null ? '' : s.maxGrams / 1000}
                      placeholder="∞"
                      onChange={(e) => update(s.id, { maxGrams: e.target.value === '' ? null : Math.round((parseFloat(e.target.value) || 0) * 1000) })}
                    />
                    <span style={{ fontSize: 'var(--text-micro)', color: 'var(--ink-3)' }}>costs</span>
                    <Input
                      label={`What ${s.name || 'this service'} costs us, ex VAT`}
                      compact
                      align="right"
                      prefix="£"
                      className="w-24"
                      type="number"
                      step="0.01"
                      value={s.price}
                      onChange={(e) => update(s.id, { price: parseFloat(e.target.value) || 0 })}
                    />
                    <Button variant="ghost" size="sm" icon="trash" aria-label={`Remove ${s.name}`} onClick={() => remove(s.id)} />
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      <Button variant="ghost" size="sm" icon="plus" onClick={add}>
        Add a service
      </Button>
      <p className="text-[10px] text-[var(--ink-3)] leading-snug">
        From PowerBody&apos;s Dropshipping Guide, ex VAT. Each parcel goes with the cheapest service that can carry its weight, and
        every order asks PowerBody for that service by its code (Settings → Supplier). Leave the weight blank for no limit.
      </p>
    </div>
  )
}

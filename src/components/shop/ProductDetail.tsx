'use client'

import Link from 'next/link'
import type { CatalogueProduct, CatalogueVariant } from '@/lib/catalogue/types'
import { formatGBP, PRICING_CONFIG } from '@/lib/stack-blueprint/pricing'
import { variantStock } from '@/lib/shop/merchandising'
import { productFacts, productDietary } from '@/lib/product-facts'
import { pricePerServing, formatPerServing } from '@/lib/shop/per-serving'
import { isAccessory } from '@/lib/catalogue/accessory'
import { Icon } from '@/components/ui/Icon'

/**
 * Everything a shopper can read about one product, without the chrome around it.
 *
 * The product page is the only caller now that the quick-view sheet is gone;
 * the content stays in its own module so a second surface (a sheet, a compare
 * view) can never become a second, thinner description of the same tub.
 *
 * The facts lead. Format, size, servings and price per serving answer "what is
 * this and is it worth it" in four cells; the supplier's description follows
 * for whoever wants to read on.
 */

export function variantLabel(v: Pick<CatalogueVariant, 'title' | 'flavour' | 'size'>): string {
  const parts = [v.flavour, v.size].filter(Boolean)
  return parts.length > 0 ? parts.join(', ') : v.title
}

/* ── Options ──────────────────────────────────────────────────────────────── */

interface OptionProps {
  product: CatalogueProduct
  variant: CatalogueVariant | undefined
  onSelectVariant: (id: string) => void
}

/**
 * The variants as pills, in the dimensions they actually vary in.
 *
 * Flavours and sizes get a row each when both vary; picking a flavour keeps
 * the size you had if that combination exists and is in stock, and falls back
 * to the first one that is. When variants vary in neither (supplier titles
 * only), they are one row of their own names. Every pill is a real variant, so
 * nothing here can choose a combination the shop does not sell.
 */
export function VariantOptions({ product, variant, onSelectVariant }: OptionProps) {
  if (product.variants.length < 2) return null

  const flavours = unique(product.variants.map((v) => v.flavour))
  const sizes = unique(product.variants.map((v) => v.size))
  const byFlavour = flavours.length > 1
  const bySize = sizes.length > 1

  if (!byFlavour && !bySize) {
    return (
      <OptionRow title="Option" chosen={variant ? variantLabel(variant) : ''}>
        {product.variants.map((v) => (
          <Pill key={v.id} on={v.id === variant?.id} disabled={!v.available} onClick={() => onSelectVariant(v.id)} price={v.price}>
            {variantLabel(v)}
          </Pill>
        ))}
      </OptionRow>
    )
  }

  const pickFlavour = (f: string) => {
    const match = product.variants.find((v) => v.flavour === f && v.size === variant?.size && v.available)
      ?? product.variants.find((v) => v.flavour === f && v.available)
      ?? product.variants.find((v) => v.flavour === f)
    if (match) onSelectVariant(match.id)
  }
  const pickSize = (s: string) => {
    const match = product.variants.find((v) => v.size === s && (!byFlavour || v.flavour === variant?.flavour) && v.available)
      ?? product.variants.find((v) => v.size === s && v.available)
      ?? product.variants.find((v) => v.size === s)
    if (match) onSelectVariant(match.id)
  }

  return (
    <>
      {byFlavour && (
        <OptionRow title="Flavour" chosen={variant?.flavour ?? ''}>
          {flavours.map((f) => {
            const any = product.variants.some((v) => v.flavour === f && v.available)
            return (
              <Pill key={f} on={variant?.flavour === f} disabled={!any} onClick={() => pickFlavour(f)}>
                {f}
              </Pill>
            )
          })}
        </OptionRow>
      )}
      {bySize && (
        <OptionRow title="Size" chosen={variant?.size ?? ''}>
          {sizes.map((s) => {
            const exact = product.variants.find((v) => v.size === s && (!byFlavour || v.flavour === variant?.flavour))
            const shown = exact ?? product.variants.find((v) => v.size === s)
            return (
              <Pill key={s} on={variant?.size === s} disabled={!shown?.available} onClick={() => pickSize(s)} price={shown?.price}>
                {s}
              </Pill>
            )
          })}
        </OptionRow>
      )}
    </>
  )
}

function OptionRow({ title, chosen, children }: { title: string; chosen: string; children: React.ReactNode }) {
  return (
    <div className="sf-pdp-opt">
      <p className="sf-pdp-opt-h">
        <span>{title}</span>
        {chosen && <b>{chosen}</b>}
      </p>
      <div className="sf-pdp-pills" role="group" aria-label={title}>{children}</div>
    </div>
  )
}

function Pill({ on, disabled, onClick, price, children }: { on: boolean; disabled?: boolean; onClick: () => void; price?: number; children: React.ReactNode }) {
  return (
    <button
      type="button"
      className="sf-chip sf-pdp-pill"
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
      data-interactive
    >
      {children}
      {price != null && <i className="sf-num">{formatGBP(price)}</i>}
      {disabled && <i>Sold out</i>}
    </button>
  )
}

function unique(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((v): v is string => !!v))]
}

/* ── The body ─────────────────────────────────────────────────────────────── */

interface Props {
  product: CatalogueProduct
  /** The variant currently chosen. */
  variant: CatalogueVariant | undefined
  /**
   * Given, the body leads with the option pills itself. The product page puts
   * them higher up, beside the price, and leaves this out; the Founders Hub's
   * preview passes it so its picture of the page still has them.
   */
  onSelectVariant?: (id: string) => void
  className?: string
}

export function ProductDetailBody({ product, variant, onSelectVariant, className }: Props) {
  const price = variant?.price ?? product.basePrice

  // Honest subscribe-&-save figure for this variant — the same discount the
  // basket nudge quotes, shown as a concrete monthly price.
  const subscribePct = Math.round(PRICING_CONFIG.subscriptionDiscount * 100)
  const monthlyPrice = price * (1 - PRICING_CONFIG.subscriptionDiscount)

  // The facts of the variant on screen, not of the product: 100 vcaps and a
  // 454g bag of the same powder are 33 servings and 454, and one number cannot
  // be right under both.
  const facts = productFacts(product, variant)
  const perServ = variant ? pricePerServing(product, variant) : null
  const cells = [
    ...facts.map((f) => ({ key: f.key, label: f.label === 'Per unit' ? 'Servings' : f.label, value: f.value })),
    ...(variant?.size ? [{ key: 'size', label: 'Size', value: variant.size }] : []),
    ...(perServ != null ? [{ key: 'per', label: 'Per serving', value: formatPerServing(perServ) }] : []),
  ]
  const dietary = productDietary(product)

  return (
    <div className={`sf-pdp-body ${className ?? ''}`}>
      {onSelectVariant && <VariantOptions product={product} variant={variant} onSelectVariant={onSelectVariant} />}

      {/* Never on an accessory. A monthly shaker is not a plan, it is a
          cupboard full of shakers — and the offer reads as one we would honour. */}
      {product.subscriptionEligible && !isAccessory(product) && (
        <Link href="/quiz" data-interactive className="sf-pdp-plan">
          <Icon name="calendar" size={22} />
          <span className="sf-pdp-plan-words">
            <b>Subscribe &amp; save {subscribePct}%</b>
            <span>on a personalised monthly plan</span>
          </span>
          <span className="sf-pdp-plan-price sf-num">
            {formatGBP(monthlyPrice)}<small>/mo</small>
          </span>
          <Icon name="chevron-right" size={16} />
        </Link>
      )}

      {cells.length > 0 && (
        <section aria-labelledby="pdp-facts">
          <h2 id="pdp-facts" className="sr-only">The facts</h2>
          <dl className="sf-pdp-facts">
            {cells.map((c) => (
              <div key={c.key}>
                <dt>{c.label}</dt>
                <dd className="sf-tnum">{c.value}</dd>
              </div>
            ))}
          </dl>
          {dietary.length > 0 && (
            <ul className="sf-pdp-diet" aria-label="Dietary">
              {dietary.map((label) => (
                <li key={label}><Icon name="check" size={14} />{label}</li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section aria-labelledby="pdp-about">
        <h2 id="pdp-about" className="sf-pdp-h">What it is</h2>
        {product.shortReason && product.shortReason !== product.description && (
          <p className="sf-body" style={{ color: 'var(--text)', margin: '0 0 var(--space-2)' }}>{product.shortReason}</p>
        )}
        {/* `pre-line`, because `cleanDescription` keeps the supplier's
            paragraph and bullet breaks as newlines. */}
        <p className="sf-body" style={{ color: 'var(--text-2)', whiteSpace: 'pre-line', margin: 0, maxWidth: '62ch' }}>{product.description}</p>
      </section>

      {product.warnings.length > 0 && (
        <p className="sf-meta" style={{ margin: 0 }}>{product.warnings.join(' ')}</p>
      )}
    </div>
  )
}

/** "2 left in stock", only when it is genuinely nearly gone. A fact, not a countdown. */
export function stockLine(variant: CatalogueVariant | undefined): string | null {
  if (!variant || !variant.available) return null
  const { count } = variantStock(variant)
  return count != null && count > 0 && count < 5 ? `${count} left in stock` : null
}

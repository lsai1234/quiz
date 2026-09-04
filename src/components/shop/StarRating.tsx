import type { ProductRating } from '@/lib/catalogue/types'
import { formatRatingCount } from '@/lib/shop/ratings'

// A single 5-point star.
const STAR_PATH =
  'M12 2.4l2.95 5.98 6.6.96-4.77 4.65 1.13 6.57L12 17.4l-5.9 3.1 1.12-6.56L2.45 9.34l6.6-.96L12 2.4z'

interface Props {
  rating: ProductRating
  /** Star edge length in px. */
  size?: number
  /** Show the numeric average before the stars (fuller sheet layout). */
  showAverage?: boolean
  /** Show the review count after the stars. */
  showCount?: boolean
  /** Fill colour for the earned portion. Defaults to the shop accent. */
  color?: string
  className?: string
}

/** The five stars, with the earned fraction overlaid on an empty outline row. */
function Stars({ value, size, color }: { value: number; size: number; color: string }) {
  const pct = Math.max(0, Math.min(100, (value / 5) * 100))
  const row = (fill: string, stroke: string) => (
    <div className="flex" style={{ gap: size * 0.12, width: 'max-content' }}>
      {[0, 1, 2, 3, 4].map((i) => (
        <svg key={i} width={size} height={size} viewBox="0 0 24 24" style={{ display: 'block' }}>
          <path d={STAR_PATH} fill={fill} stroke={stroke} strokeWidth={fill === 'none' ? 1.6 : 0} strokeLinejoin="round" />
        </svg>
      ))}
    </div>
  )
  return (
    <div className="relative inline-block" aria-hidden>
      {row('none', 'color-mix(in srgb, var(--text-dim, var(--color-border-2)) 45%, transparent)')}
      <div className="absolute inset-0 overflow-hidden" style={{ width: `${pct}%` }}>
        {row(color, 'none')}
      </div>
    </div>
  )
}

/**
 * Compact star-rating row for shop cards and the product sheet. Renders the mean
 * with a fractional final star, plus an optional numeric average and review count.
 * The whole row carries a single label for screen readers; the stars are decorative.
 */
export function StarRating({
  rating,
  size = 12,
  showAverage = false,
  showCount = true,
  color = 'var(--text-dim, var(--color-accent))',
  className = '',
}: Props) {
  const label = `Rated ${rating.average} out of 5 from ${rating.count} review${rating.count === 1 ? '' : 's'}`
  return (
    <div className={`flex items-center gap-1.5 ${className}`} role="img" aria-label={label}>
      {showAverage && (
        <span className="sf-tnum text-xs leading-none" style={{ color: 'var(--text, var(--color-text))' }}>
          {rating.average.toFixed(1)}
        </span>
      )}
      <Stars value={rating.average} size={size} color={color} />
      {showCount && (
        <span className="sf-tnum text-[11px] leading-none" style={{ color: 'var(--text-dim, var(--color-muted))' }}>
          ({formatRatingCount(rating.count)})
        </span>
      )}
    </div>
  )
}

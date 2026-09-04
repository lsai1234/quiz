/** An honest low-stock chip — only rendered with a real, positive remaining count. */
export function StockChip({ count, className = '' }: { count: number; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full label whitespace-nowrap ${className}`}
      style={{
        color: 'var(--color-amber)',
        background: 'color-mix(in srgb, var(--color-amber) 13%, transparent)',
        border: '1px solid color-mix(in srgb, var(--color-amber) 28%, transparent)',
        fontFamily: 'var(--font-display)',
      }}
    >
      Only {count} left
    </span>
  )
}

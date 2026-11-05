/** Shared text styles for the training screens: tokens only. */
export const eyebrow = {
  fontFamily: 'var(--font-display)',
  fontSize: 'var(--text-micro)',
  fontWeight: 'var(--weight-strong)',
  letterSpacing: 'var(--tracking-eyebrow)',
  textTransform: 'uppercase' as const,
  color: 'var(--accent)',
}
export const title = {
  fontFamily: 'var(--font-display)',
  fontSize: 'var(--text-title)',
  fontWeight: 'var(--weight-strong)',
  color: 'var(--ink-1)',
  lineHeight: 'var(--leading-tight)',
}
export const display = { ...title, fontSize: 'var(--text-display)' }
export const body = { color: 'var(--ink-2)', fontSize: 'var(--text-body-sm)', lineHeight: 'var(--leading-body)' }
export const meta = { color: 'var(--ink-3)', fontSize: 'var(--text-meta)', lineHeight: 'var(--leading-snug)' }
export const strong = { color: 'var(--ink-1)', fontSize: 'var(--text-body)', fontWeight: 'var(--weight-strong)', lineHeight: 'var(--leading-snug)' }
export const label = { ...eyebrow, color: 'var(--ink-2)', marginBottom: 'var(--space-3)' }
export const stack = (gap: string) => ({ display: 'flex', flexDirection: 'column' as const, gap })

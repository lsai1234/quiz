/** Number formatting for the Analytics page — one place, so every figure reads the same. */

export function count(n: number): string {
  if (n >= 100_000) return `${(n / 1000).toFixed(0)}K`
  if (n >= 10_000) return `${(n / 1000).toFixed(1)}K`
  return n.toLocaleString('en-GB')
}

/** A share, 0–1. One decimal under 10%, where a rounding would hide a real difference. */
export function pct(v: number): string {
  if (!Number.isFinite(v) || v <= 0) return '0%'
  const p = v * 100
  return p < 10 ? `${p.toFixed(1)}%` : `${Math.round(p)}%`
}

export function money(pence: number): string {
  return `£${(pence / 100).toLocaleString('en-GB', { minimumFractionDigits: pence % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 })}`
}

/** Seconds as "2m 34s", "45s", "1h 5m". */
export function duration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return '—'
  const s = Math.round(seconds)
  if (s < 60) return `${s}s`
  if (s < 3600) {
    const rest = s % 60
    return rest ? `${Math.floor(s / 60)}m ${rest}s` : `${Math.floor(s / 60)}m`
  }
  const mins = Math.round((s % 3600) / 60)
  return mins ? `${Math.floor(s / 3600)}h ${mins}m` : `${Math.floor(s / 3600)}h`
}

/** Change against the previous period, as a share. Null when there is nothing to compare with. */
export function change(now: number, before: number | undefined | null): number | null {
  if (before === undefined || before === null) return null
  if (before === 0) return now === 0 ? 0 : null
  return (now - before) / before
}

export function date(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London' })
}

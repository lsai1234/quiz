import type { ClaimRisk } from '@/lib/types'

const config: Record<ClaimRisk, { label: string; className: string }> = {
  low: { label: 'Low Risk', className: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' },
  medium: { label: 'Medium Risk', className: 'bg-amber-500/20 text-amber-400 border border-amber-500/30' },
  high: { label: 'High Risk', className: 'bg-red-500/20 text-red-400 border border-red-500/30' },
}

export function RiskBadge({ risk, size = 'sm' }: { risk: ClaimRisk; size?: 'sm' | 'md' }) {
  const normalised = (risk?.toLowerCase() ?? 'low') as ClaimRisk
  const { label, className } = config[normalised] ?? config.low
  return (
    <span className={`rounded-full font-medium ${size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm'} ${className}`}>
      {label}
    </span>
  )
}

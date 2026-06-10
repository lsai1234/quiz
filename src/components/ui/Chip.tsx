'use client'

interface ChipProps {
  label: string
  emoji?: string
  selected?: boolean
  onClick?: () => void
  variant?: 'default' | 'goal' | 'action'
}

export function Chip({ label, emoji, selected, onClick, variant = 'default' }: ChipProps) {
  const base = 'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-all active:scale-95 cursor-pointer select-none'
  const variants = {
    default: selected
      ? 'bg-orange-500 text-black'
      : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 border border-zinc-700',
    goal: selected
      ? 'bg-orange-500 text-black'
      : 'bg-zinc-900 text-zinc-300 border border-zinc-700 hover:border-orange-500/50',
    action: 'bg-zinc-800 text-zinc-200 hover:bg-zinc-700 border border-zinc-700',
  }

  return (
    <button type="button" onClick={onClick} className={`${base} ${variants[variant]}`}>
      {emoji && <span>{emoji}</span>}
      {label}
    </button>
  )
}

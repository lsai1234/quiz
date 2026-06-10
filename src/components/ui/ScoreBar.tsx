function scoreColor(score: number) {
  if (score >= 90) return 'bg-emerald-500'
  if (score >= 80) return 'bg-orange-400'
  if (score >= 70) return 'bg-amber-500'
  return 'bg-red-500'
}

export function ScoreBar({ label, score }: { label: string; score: number }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-zinc-400 w-36 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${scoreColor(score)}`}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className="text-xs font-mono text-zinc-300 w-6 text-right">{score}</span>
    </div>
  )
}

export function OverallScore({ score }: { score: number }) {
  const color = score >= 90 ? 'text-emerald-400' : score >= 80 ? 'text-orange-400' : score >= 70 ? 'text-amber-400' : 'text-red-400'
  const label = score >= 90 ? 'Queue after review' : score >= 80 ? 'Strong — minor edits' : score >= 70 ? 'Needs improvement' : 'Do not queue yet'

  return (
    <div className="flex flex-col items-center gap-1">
      <div className={`text-5xl font-bold tabular-nums ${color}`}>{score}</div>
      <div className="text-xs text-zinc-400">{label}</div>
    </div>
  )
}
